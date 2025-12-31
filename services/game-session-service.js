/**
 * GameSessionService
 *
 * Manages game session lifecycle including:
 * - Game creation and PIN generation
 * - Game state management (lobby, starting, question, revealing, finished)
 * - Question timing and advancement logic
 * - Game cleanup and resource management
 */

const { v4: uuidv4 } = require('uuid');
const { QuestionTypeService } = require('./question-type-service');

class GameSessionService {
  constructor(logger, config) {
    this.logger = logger;
    this.config = config;
    this.games = new Map();
  }

  /**
   * Generate a unique 6-digit game PIN
   * @returns {string} 6-digit PIN
   */
  generateGamePin() {
    let pin;
    do {
      pin = Math.floor(100000 + Math.random() * 900000).toString();
    } while (this.games.has(pin));
    return pin;
  }

  /**
   * Clean up stale games (older than maxAge or orphaned)
   * Called before creating new games to prevent memory buildup
   * @param {number} maxAgeMs - Maximum age in milliseconds (default 2 hours)
   */
  cleanupStaleGames(maxAgeMs = 2 * 60 * 60 * 1000) {
    const now = Date.now();
    const staleGames = [];

    for (const [pin, game] of this.games) {
      const age = now - (game.createdAt || now);
      const isStale = age > maxAgeMs;
      const isOrphanedLobby = game.gameState === 'lobby' && game.players.size === 0 && age > 30 * 60 * 1000; // Empty lobby > 30min

      if (isStale || isOrphanedLobby) {
        staleGames.push({ pin, reason: isStale ? 'expired' : 'orphaned_lobby' });
      }
    }

    for (const { pin, reason } of staleGames) {
      const game = this.games.get(pin);
      if (game) {
        game.clearTimers();
        this.games.delete(pin);
        this.logger.info(`Cleaned up stale game ${pin} (${reason})`);
      }
    }

    if (staleGames.length > 0) {
      this.logger.debug(`Cleaned up ${staleGames.length} stale games`);
    }
  }

  /**
   * Create a new game session
   * @param {string} hostId - Socket ID of the host
   * @param {Object} quiz - Quiz data
   * @returns {Object} Game instance
   */
  createGame(hostId, quiz) {
    // Clean up any stale games before creating a new one
    this.cleanupStaleGames();

    const game = new Game(hostId, quiz, this.logger, this.config);
    this.games.set(game.pin, game);
    this.logger.info(`Game created with PIN: ${game.pin}`);
    return game;
  }

  /**
   * Get a game by PIN
   * @param {string} pin - Game PIN
   * @returns {Object|undefined} Game instance or undefined
   */
  getGame(pin) {
    return this.games.get(pin);
  }

  /**
   * Get all games
   * @returns {Map} All games
   */
  getAllGames() {
    return this.games;
  }

  /**
   * Find game by host ID
   * @param {string} hostId - Socket ID of the host
   * @returns {Object|undefined} Game instance or undefined
   */
  findGameByHost(hostId) {
    return Array.from(this.games.values()).find(g => g.hostId === hostId);
  }

  /**
   * Delete a game
   * @param {string} pin - Game PIN
   */
  deleteGame(pin) {
    const game = this.games.get(pin);
    if (game) {
      game.cleanup();
      this.games.delete(pin);
      this.logger.info(`Game ${pin} deleted`);
    }
  }

  /**
   * Clean up orphaned games (no host, no players)
   * @param {Object} io - Socket.IO instance
   */
  cleanupOrphanedGames(io) {
    this.games.forEach((game, pin) => {
      if (game.players.size === 0 && game.gameState === 'lobby') {
        const hostSocket = io.sockets.sockets.get(game.hostId);
        if (!hostSocket) {
          this.deleteGame(pin);
          this.logger.debug(`Cleaned up orphaned game ${pin}`);
        }
      }
    });
  }

  /**
   * Start a game
   * @param {Object} game - Game instance
   * @param {Object} io - Socket.IO instance
   */
  startGame(game, io) {
    game.gameState = 'starting';
    game.startTime = new Date().toISOString();

    io.to(`game-${game.pin}`).emit('game-started', {
      gamePin: game.pin,
      questionCount: game.quiz.questions.length,
      manualAdvancement: game.manualAdvancement
    });

    // Auto-advance to first question after delay
    this.autoAdvanceToFirstQuestion(game, io);
  }

  /**
   * Auto-advance to the first question after game starts
   * @param {Object} game - Game instance
   * @param {Object} io - Socket.IO instance
   */
  autoAdvanceToFirstQuestion(game, io) {
    // Store timer ID for proper cleanup
    game.startTimer = setTimeout(() => {
      game.startTimer = null;
      if (game.gameState === 'finished') {
        return;
      }

      if (game.nextQuestion()) {
        this.startQuestion(game, io);
      } else {
        this.endGame(game, io);
      }
    }, this.config.TIMING.GAME_START_DELAY);
  }

  /**
   * Start a question
   * @param {Object} game - Game instance
   * @param {Object} io - Socket.IO instance
   */
  startQuestion(game, io) {
    if (game.currentQuestion >= game.quiz.questions.length) {
      this.endGame(game, io);
      return;
    }

    const question = game.quiz.questions[game.currentQuestion];
    const timeLimit = question.timeLimit || 20;

    game.gameState = 'question';
    game.questionStartTime = Date.now();

    const questionData = {
      questionNumber: game.currentQuestion + 1,
      totalQuestions: game.quiz.questions.length,
      question: question.question,
      options: question.options,
      type: question.type || 'multiple-choice',
      image: question.image || '',
      timeLimit: timeLimit
    };

    io.to(`game-${game.pin}`).emit('question-start', questionData);

    // Set timer for automatic question timeout
    game.questionTimer = setTimeout(() => {
      this.handleQuestionTimeout(game, io, question);
    }, timeLimit * 1000);
  }

  /**
   * Handle question timeout (time runs out)
   * @param {Object} game - Game instance
   * @param {Object} io - Socket.IO instance
   * @param {Object} question - Question data
   */
  handleQuestionTimeout(game, io, question) {
    // Guard against race condition: question may have ended early
    if (game.gameState !== 'question') {
      this.logger.debug(`Question timeout ignored - game already in state: ${game.gameState}`);
      return;
    }

    // Guard against race condition: question may be ending early via QuestionFlowService
    if (game.endingQuestionEarly) {
      this.logger.debug(`Question timeout ignored - question ending early`);
      return;
    }

    // Clear early end timer if it exists (race condition prevention)
    if (game.earlyEndTimer) {
      clearTimeout(game.earlyEndTimer);
      game.earlyEndTimer = null;
    }

    game.endQuestion();

    // Guard against null/undefined question
    if (!question) {
      this.logger.error(`Question timeout called with null question for game ${game.pin}`);
      this.advanceToNextQuestion(game, io);
      return;
    }

    const correctAnswer = question.correctAnswer;
    let correctOption = '';

    switch (question.type || 'multiple-choice') {
      case 'multiple-choice':
        correctOption = question.options && question.options[correctAnswer] ? question.options[correctAnswer] : '';
        break;
      case 'multiple-correct':
        const correctAnswers = question.correctAnswers || [];
        correctOption = correctAnswers.map(idx => question.options[idx]).join(', ');
        break;
      case 'true-false':
        correctOption = correctAnswer;
        break;
      case 'numeric':
        correctOption = correctAnswer.toString();
        break;
      case 'ordering':
        const correctOrder = question.correctOrder || [];
        correctOption = correctOrder.map(idx => question.options[idx]).join(' → ');
        break;
    }

    const timeoutData = {
      correctAnswer: correctAnswer,
      correctOption: correctOption,
      questionType: question.type || 'multiple-choice',
      tolerance: question.tolerance || null,
      explanation: question.explanation || null
    };

    // For multiple-correct questions, also send the correctAnswers array
    if (question.type === 'multiple-correct') {
      timeoutData.correctAnswers = question.correctAnswers || [];
    }

    io.to(`game-${game.pin}`).emit('question-timeout', timeoutData);

    // Get statistics and emit to host
    const answerStats = game.getAnswerStatistics();
    io.to(game.hostId).emit('answer-statistics', answerStats);

    // Send individual results to each player (include all answer data for client display)
    game.players.forEach((player, playerId) => {
      const playerAnswer = player.answers[game.currentQuestion];
      const resultData = {
        isCorrect: playerAnswer ? playerAnswer.isCorrect : false,
        points: playerAnswer ? playerAnswer.points : 0,
        totalScore: player.score,
        explanation: timeoutData.explanation,
        questionType: timeoutData.questionType,
        correctAnswer: timeoutData.correctAnswer
      };
      // Include correctAnswers array for multiple-correct questions
      if (timeoutData.correctAnswers) {
        resultData.correctAnswers = timeoutData.correctAnswers;
      }
      io.to(playerId).emit('player-result', resultData);
    });

    // Advance to next question or end game
    this.advanceToNextQuestion(game, io);
  }

  /**
   * Advance to next question with leaderboard display
   * @param {Object} game - Game instance
   * @param {Object} io - Socket.IO instance
   */
  advanceToNextQuestion(game, io) {
    if (game.gameState === 'finished' || game.isAdvancing) {
      return;
    }

    game.isAdvancing = true;

    if (game.advanceTimer) {
      clearTimeout(game.advanceTimer);
      game.advanceTimer = null;
    }

    game.advanceTimer = setTimeout(() => {
      if (game.gameState === 'finished') {
        game.isAdvancing = false;
        return;
      }

      game.updateLeaderboard();

      io.to(`game-${game.pin}`).emit('question-end', {
        showStatistics: true
      });

      const hasMoreQuestions = (game.currentQuestion + 1) < game.quiz.questions.length;

      if (game.manualAdvancement) {
        // Show next button to host
        io.to(game.hostId).emit('show-next-button', {
          isLastQuestion: !hasMoreQuestions
        });
        game.isAdvancing = false;
      } else {
        // Auto-advance mode: show leaderboard then continue
        io.to(`game-${game.pin}`).emit('show-leaderboard', {
          leaderboard: game.leaderboard.slice(0, 5)
        });

        game.advanceTimer = setTimeout(() => {
          if (game.gameState === 'finished') {
            game.isAdvancing = false;
            return;
          }

          if (game.nextQuestion()) {
            this.startQuestion(game, io);
          } else {
            this.endGame(game, io);
          }
          game.isAdvancing = false;
        }, 3000);
      }
    }, this.config.TIMING.LEADERBOARD_DISPLAY_TIME);
  }

  /**
   * Manually advance to next question (triggered by host)
   * @param {Object} game - Game instance
   * @param {Object} io - Socket.IO instance
   */
  manualAdvanceToNextQuestion(game, io) {
    this.logger.debug('Manual advance to next question');

    if (game.isAdvancing) {
      this.logger.debug('Game already advancing, ignoring');
      return;
    }

    if (game.gameState === 'finished') {
      this.logger.debug('Game already finished, hiding next button');
      io.to(game.hostId).emit('hide-next-button');
      return;
    }

    game.isAdvancing = true;

    if (game.advanceTimer) {
      clearTimeout(game.advanceTimer);
      game.advanceTimer = null;
    }

    io.to(game.hostId).emit('hide-next-button');

    io.to(`game-${game.pin}`).emit('show-leaderboard', {
      leaderboard: game.leaderboard.slice(0, 5)
    });

    // Store timer ID for proper cleanup
    game.advanceTimer = setTimeout(() => {
      game.advanceTimer = null;
      const hasMoreQuestions = game.nextQuestion();

      if (hasMoreQuestions) {
        this.startQuestion(game, io);
      } else {
        this.endGame(game, io);
      }

      game.isAdvancing = false;
    }, 3000);
  }

  /**
   * End the game and show final results
   * @param {Object} game - Game instance
   * @param {Object} io - Socket.IO instance
   */
  endGame(game, io) {
    this.logger.debug(`Ending game ${game.pin}`);

    if (game.gameState === 'finished') {
      this.logger.debug('Game already finished, skipping endGame');
      return;
    }

    game.gameState = 'finished';
    game.endTime = new Date().toISOString();
    game.isAdvancing = false;

    // Clear all timers
    if (game.questionTimer) {
      clearTimeout(game.questionTimer);
      game.questionTimer = null;
    }
    if (game.advanceTimer) {
      clearTimeout(game.advanceTimer);
      game.advanceTimer = null;
    }

    io.to(game.hostId).emit('hide-next-button');

    game.updateLeaderboard();
    game.saveResults();

    // Emit game-end event after brief delay
    setTimeout(() => {
      if (game.gameState === 'finished') {
        io.to(`game-${game.pin}`).emit('game-end', {
          finalLeaderboard: game.leaderboard
        });
        this.logger.debug(`Game ${game.pin} ended with ${game.players.size} players`);
      }
    }, 1000);
  }
}

/**
 * Game class representing a single game session
 */
class Game {
  constructor(hostId, quiz, logger, config) {
    this.id = uuidv4();
    this.pin = this.generatePin();
    this.hostId = hostId;
    this.quiz = quiz;
    this.players = new Map();
    this.currentQuestion = -1;
    this.gameState = 'lobby';
    this.questionStartTime = null;
    this.leaderboard = [];
    this.questionTimer = null;
    this.advanceTimer = null;
    this.isAdvancing = false;
    this.endingQuestionEarly = false;
    this.startTime = null;
    this.endTime = null;
    this.createdAt = Date.now(); // Track game creation time for cleanup
    this.manualAdvancement = quiz.manualAdvancement || false;
    this.logger = logger;
    this.config = config;
  }

  /**
   * Generate PIN (temporary method, will be replaced by service method)
   */
  generatePin() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Add a player to the game
   * @param {string} playerId - Socket ID of the player
   * @param {string} playerName - Player's name
   */
  addPlayer(playerId, playerName) {
    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      score: 0,
      answers: []
    });
  }

  /**
   * Remove a player from the game
   * @param {string} playerId - Socket ID of the player
   */
  removePlayer(playerId) {
    this.players.delete(playerId);
  }

  /**
   * Advance to the next question
   * @returns {boolean} True if there are more questions, false otherwise
   */
  nextQuestion() {
    const nextQuestionIndex = this.currentQuestion + 1;
    const hasMore = nextQuestionIndex < this.quiz.questions.length;

    this.logger.debug('nextQuestion() DEBUG:', {
      currentQuestion: this.currentQuestion,
      nextQuestionIndex: nextQuestionIndex,
      totalQuestions: this.quiz.questions.length,
      hasMore: hasMore,
      gamePin: this.pin
    });

    if (hasMore) {
      this.currentQuestion = nextQuestionIndex;
      this.gameState = 'question';
      this.questionTimer = null;
      this.advanceTimer = null;
      this.logger.debug(`Advanced to question ${this.currentQuestion + 1}`);
    } else {
      this.logger.debug('NO MORE QUESTIONS - should end game');
    }

    return hasMore;
  }

  /**
   * End the current question
   */
  endQuestion() {
    this.gameState = 'revealing';
    if (this.questionTimer) {
      clearTimeout(this.questionTimer);
      this.questionTimer = null;
    }
    if (this.advanceTimer) {
      clearTimeout(this.advanceTimer);
      this.advanceTimer = null;
    }
  }

  /**
   * Submit an answer for a player
   * @param {string} playerId - Socket ID of the player
   * @param {*} answer - Player's answer
   * @param {string} answerType - Type of answer
   * @returns {Object} Result with isCorrect and points
   */
  submitAnswer(playerId, answer, answerType) {
    const player = this.players.get(playerId);
    if (!player) return false;

    const question = this.quiz.questions[this.currentQuestion];
    const questionType = question.type || 'multiple-choice';

    // Use QuestionTypeService for centralized scoring logic
    const correctAnswerKey = this.getCorrectAnswerKey(question);
    const defaultTolerance = this.config.SCORING?.DEFAULT_NUMERIC_TOLERANCE || 0.1;
    const options = questionType === 'numeric' ? { tolerance: question.tolerance || defaultTolerance } : {};

    let isCorrect = QuestionTypeService.scoreAnswer(
      questionType,
      answer,
      correctAnswerKey,
      options
    );

    const timeTaken = Date.now() - this.questionStartTime;
    const maxBonusTime = this.config.SCORING.MAX_BONUS_TIME;
    const timeBonus = Math.max(0, maxBonusTime - timeTaken);
    const difficultyMultiplier = this.config.SCORING.DIFFICULTY_MULTIPLIERS[question.difficulty] || 2;

    const basePoints = this.config.SCORING.BASE_POINTS * difficultyMultiplier;
    const scaledTimeBonus = Math.floor(timeBonus * difficultyMultiplier / this.config.SCORING.TIME_BONUS_DIVISOR);

    // Handle partial credit for ordering questions
    let points = 0;
    let partialScore = null; // Only set for ordering questions
    if (question.type === 'ordering' && typeof isCorrect === 'number') {
      // isCorrect is a decimal (0-1) representing percentage correct
      partialScore = isCorrect; // Store the partial score (0-1)
      points = Math.floor((basePoints + scaledTimeBonus) * isCorrect);
      // Only mark as "correct" if the order is 100% right
      // Partial credit still gives points, but isCorrect = false unless perfect
      const wasCorrect = isCorrect === 1;
      isCorrect = wasCorrect;
    } else {
      points = isCorrect ? basePoints + scaledTimeBonus : 0;
    }

    const answerData = {
      answer,
      isCorrect,
      points,
      timeMs: Date.now() - this.questionStartTime
    };

    // Add partialScore for ordering questions (enables "partially correct" feedback)
    if (partialScore !== null) {
      answerData.partialScore = partialScore;
    }

    player.answers[this.currentQuestion] = answerData;
    player.score += points;

    return { isCorrect, points };
  }

  /**
   * Get the correct answer key for a question based on its type
   * @param {Object} question - Question data
   * @returns {*} Correct answer key
   */
  getCorrectAnswerKey(question) {
    const type = question.type || 'multiple-choice';

    switch (type) {
      case 'multiple-choice':
        return question.correctIndex !== undefined ? question.correctIndex : question.correctAnswer;
      case 'multiple-correct':
        return question.correctIndices || question.correctAnswers || [];
      case 'true-false':
      case 'numeric':
        return question.correctAnswer;
      case 'ordering':
        return question.correctOrder || [];
      default:
        this.logger.warn(`Unknown question type '${type}', using default correctAnswer field`);
        return question.correctAnswer;
    }
  }

  /**
   * Update the leaderboard
   * Sorts by score (descending), then by total time (ascending) as tiebreaker
   */
  updateLeaderboard() {
    this.leaderboard = Array.from(this.players.values())
      .sort((a, b) => {
        // Primary sort: higher score wins
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        // Tiebreaker: faster total response time wins
        const aTotalTime = Object.values(a.answers).reduce((sum, ans) => sum + (ans.timeMs || 0), 0);
        const bTotalTime = Object.values(b.answers).reduce((sum, ans) => sum + (ans.timeMs || 0), 0);
        return aTotalTime - bTotalTime;
      })
      .slice(0, 10);
  }

  /**
   * Get answer statistics for the current question
   * @returns {Object} Statistics object
   */
  getAnswerStatistics() {
    const question = this.quiz.questions[this.currentQuestion];

    if (!question) {
      return {
        totalPlayers: this.players.size,
        answeredPlayers: 0,
        answerCounts: {},
        questionType: 'multiple-choice'
      };
    }

    const stats = {
      totalPlayers: this.players.size,
      answeredPlayers: 0,
      answerCounts: {},
      questionType: question.type || 'multiple-choice'
    };

    if (question.type === 'multiple-choice' || question.type === 'multiple-correct') {
      question.options.forEach((_, index) => {
        stats.answerCounts[index] = 0;
      });
    } else if (question.type === 'true-false') {
      stats.answerCounts['true'] = 0;
      stats.answerCounts['false'] = 0;
    } else if (question.type === 'numeric') {
      stats.answerCounts = {};
    } else if (question.type === 'ordering') {
      stats.answerCounts = {};
    }

    Array.from(this.players.values()).forEach(player => {
      const playerAnswer = player.answers[this.currentQuestion];
      if (playerAnswer) {
        stats.answeredPlayers++;
        const answer = playerAnswer.answer;

        if (question.type === 'multiple-choice') {
          if (stats.answerCounts[answer] !== undefined) {
            stats.answerCounts[answer]++;
          }
        } else if (question.type === 'multiple-correct') {
          if (Array.isArray(answer)) {
            answer.forEach(a => {
              if (stats.answerCounts[a] !== undefined) {
                stats.answerCounts[a]++;
              }
            });
          }
        } else if (question.type === 'true-false') {
          const normalizedAnswer = answer.toString().toLowerCase();
          if (stats.answerCounts[normalizedAnswer] !== undefined) {
            stats.answerCounts[normalizedAnswer]++;
          }
        } else if (question.type === 'numeric') {
          stats.answerCounts[answer.toString()] = (stats.answerCounts[answer.toString()] || 0) + 1;
        } else if (question.type === 'ordering') {
          const orderKey = JSON.stringify(answer);
          stats.answerCounts[orderKey] = (stats.answerCounts[orderKey] || 0) + 1;
        }
      }
    });

    // Add option count for dynamic display
    stats.optionCount = question.options?.length || 4;

    return stats;
  }

  /**
   * Save game results to file
   * Note: Client-side also saves via REST API for redundancy
   */
  saveResults() {
    try {
      const fs = require('fs');
      const path = require('path');

      // Ensure results directory exists
      const resultsDir = 'results';
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }

      const results = {
        quizTitle: this.quiz.title || 'Untitled Quiz',
        gamePin: this.pin,
        results: Array.from(this.players.values()).map(player => ({
          name: player.name,
          score: player.score,
          answers: player.answers
        })),
        startTime: this.startTime,
        endTime: this.endTime,
        saved: new Date().toISOString(),
        questions: this.quiz.questions.map((q, index) => ({
          questionNumber: index + 1,
          text: q.question || q.text,
          type: q.type || 'multiple-choice',
          options: q.options,
          correctAnswer: q.correctAnswer,
          correctAnswers: q.correctAnswers,
          correctOrder: q.correctOrder,
          difficulty: q.difficulty || 'medium',
          timeLimit: q.timeLimit || q.time
        }))
      };

      const filename = `results_${this.pin}_${Date.now()}.json`;
      fs.writeFileSync(path.join(resultsDir, filename), JSON.stringify(results, null, 2));
      this.logger.info(`Results saved: ${filename}`);
    } catch (error) {
      this.logger.error('Error saving game results:', error);
    }
  }

  /**
   * Clear all active timers to prevent memory leaks
   * Called during game cleanup and when game is deleted
   */
  clearTimers() {
    if (this.questionTimer) {
      clearTimeout(this.questionTimer);
      this.questionTimer = null;
    }
    if (this.advanceTimer) {
      clearTimeout(this.advanceTimer);
      this.advanceTimer = null;
    }
    if (this.earlyEndTimer) {
      clearTimeout(this.earlyEndTimer);
      this.earlyEndTimer = null;
    }
    if (this.startTimer) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
  }

  /**
   * Clean up game resources and remove stale player references
   */
  cleanup() {
    this.logger.debug(`Cleaning up game ${this.pin} with ${this.players.size} players`);

    // Clear all timers to prevent memory leaks
    this.clearTimers();

    // Clear internal player references
    this.players.clear();

    // Clear other game state
    this.leaderboard = [];
    this.gameState = 'ended';

    this.logger.debug(`Game ${this.pin} cleanup completed`);
  }
}

module.exports = { GameSessionService, Game };
