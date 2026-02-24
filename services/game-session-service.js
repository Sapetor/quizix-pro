/**
 * GameSessionService
 *
 * Manages game session lifecycle including:
 * - Game creation and PIN generation
 * - Game state management (lobby, starting, question, revealing, finished)
 * - Question timing and advancement logic
 * - Game cleanup and resource management
 */

const { getLimits, isMobileMode } = require('../config/limits');
const { Game, shuffleWithMapping } = require('./game');

class GameSessionService {
    constructor(logger, config) {
        this.logger = logger;
        this.config = config;
        this.games = new Map();
        this.cleanupInterval = null;
        this.socketBatchService = null; // Injected via setSocketBatchService()

        // Load environment-based limits
        this.limits = getLimits();
        if (isMobileMode()) {
            this.logger.info('Running in mobile mode with reduced limits');
        }

        // Start periodic cleanup every 30 minutes instead of per-game-creation
        this.startPeriodicCleanup();
    }

    /**
     * Inject SocketBatchService for room cleanup
     * @param {SocketBatchService} socketBatchService - The socket batch service instance
     */
    setSocketBatchService(socketBatchService) {
        this.socketBatchService = socketBatchService;
    }

    /**
   * Start periodic stale game cleanup
   * Runs every 30 minutes to clean up old/orphaned games
   */
    startPeriodicCleanup() {
    // Run cleanup every 30 minutes (more efficient than per-creation)
        this.cleanupInterval = setInterval(() => {
            this.cleanupStaleGames();
        }, 30 * 60 * 1000);

        // Run initial cleanup after 5 minutes
        setTimeout(() => {
            this.cleanupStaleGames();
        }, 5 * 60 * 1000);
    }

    /**
   * Stop periodic cleanup (for graceful shutdown)
   */
    stopPeriodicCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
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
   * Called periodically by interval timer to prevent memory buildup
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
   * @returns {Object} Game instance or throws error if limit reached
   */
    createGame(hostId, quiz) {
        // Enforce concurrent game limit
        if (this.games.size >= this.limits.MAX_CONCURRENT_GAMES) {
            const error = new Error(`Maximum concurrent games limit reached (${this.limits.MAX_CONCURRENT_GAMES})`);
            error.code = 'GAME_LIMIT_REACHED';
            error.messageKey = 'error_player_limit';
            throw error;
        }

        const game = new Game(hostId, quiz, this.logger, this.config, this.limits);
        this.games.set(game.pin, game);
        this.logger.info(`Game created with PIN: ${game.pin} (${this.games.size}/${this.limits.MAX_CONCURRENT_GAMES} games)`);
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

            // Clean up socket batch service room to prevent memory leaks
            if (this.socketBatchService) {
                this.socketBatchService.cleanupRoom(`game-${pin}`);
            }

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
            manualAdvancement: game.manualAdvancement,
            powerUpsEnabled: game.powerUpsEnabled
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
            try {
                if (game.gameState === 'finished') {
                    return;
                }

                if (game.nextQuestion()) {
                    this.startQuestion(game, io);
                } else {
                    this.endGame(game, io);
                }
            } catch (error) {
                this.logger.error(`Error in autoAdvanceToFirstQuestion for game ${game.pin}:`, error);
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
        const timeLimit = question.timeLimit || question.time || 20;
        const questionType = question.type || 'multiple-choice';

        game.gameState = 'question';
        game.questionStartTime = Date.now();

        // Clear previous question's answer mappings
        game.answerMappings = new Map();

        // Determine if this question type should have shuffled answers
        const shouldShuffle = game.quiz.randomizeAnswers &&
            (questionType === 'multiple-choice' || questionType === 'multiple-correct') &&
            question.options && question.options.length > 1;

        // Base question data (without options - will be customized per player)
        const baseQuestionData = {
            questionNumber: game.currentQuestion + 1,
            totalQuestions: game.quiz.questions.length,
            question: question.question,
            type: questionType,
            image: question.image || '',
            video: question.video || '',
            timeLimit: timeLimit
        };

        if (shouldShuffle) {
            // Send per-player shuffled options
            game.players.forEach((player, playerId) => {
                const { shuffled, mapping } = shuffleWithMapping(question.options);

                // Store mapping for answer validation: mapping[shuffledIndex] = originalIndex
                game.answerMappings.set(playerId, mapping);

                const playerQuestionData = {
                    ...baseQuestionData,
                    options: shuffled
                };

                io.to(playerId).emit('question-start', playerQuestionData);
            });

            // Send unshuffled to host (so they see the "canonical" order)
            io.to(game.hostId).emit('question-start', {
                ...baseQuestionData,
                options: question.options
            });
        } else {
            // No shuffling - broadcast same data to everyone
            const questionData = {
                ...baseQuestionData,
                options: question.options
            };
            io.to(`game-${game.pin}`).emit('question-start', questionData);
        }

        // Set timer for automatic question timeout
        game.questionTimer = setTimeout(() => {
            try {
                this.handleQuestionTimeout(game, io, question);
            } catch (error) {
                this.logger.error(`Error in question timeout handler for game ${game.pin}:`, error);
            }
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
            this.logger.debug('Question timeout ignored - question ending early');
            return;
        }

        // Clear early end timer if it exists (race condition prevention)
        if (game.earlyEndTimer) {
            clearTimeout(game.earlyEndTimer);
            game.earlyEndTimer = null;
        }

        // Reset endingQuestionEarly flag in case it was being set
        game.endingQuestionEarly = false;

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
                // Validate indices before accessing options array
                correctOption = correctAnswers
                    .filter(idx => question.options && idx >= 0 && idx < question.options.length)
                    .map(idx => question.options[idx])
                    .join(', ');
                break;
            case 'true-false':
                correctOption = correctAnswer;
                break;
            case 'numeric':
                correctOption = correctAnswer.toString();
                break;
            case 'ordering':
                const correctOrder = question.correctOrder || [];
                // Validate indices before accessing options array
                correctOption = correctOrder
                    .filter(idx => question.options && idx >= 0 && idx < question.options.length)
                    .map(idx => question.options[idx])
                    .join(' -> ');
                break;
        }

        const timeoutData = {
            correctAnswer: correctAnswer,
            correctOption: correctOption,
            questionType: question.type || 'multiple-choice',
            tolerance: question.tolerance || null,
            explanation: question.explanation || null,
            explanationVideo: question.explanationVideo || null
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
            try {
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

                    // Use separate leaderboardTimer to avoid overwriting advanceTimer
                    game.leaderboardTimer = setTimeout(() => {
                        try {
                            game.leaderboardTimer = null;
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
                        } catch (error) {
                            this.logger.error(`Error in leaderboard timer for game ${game.pin}:`, error);
                            game.isAdvancing = false;
                        }
                    }, this.config.TIMING.LEADERBOARD_DISPLAY_TIME);
                }
            } catch (error) {
                this.logger.error(`Error in advanceToNextQuestion for game ${game.pin}:`, error);
                game.isAdvancing = false;
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
            try {
                game.advanceTimer = null;
                const hasMoreQuestions = game.nextQuestion();

                if (hasMoreQuestions) {
                    this.startQuestion(game, io);
                } else {
                    this.endGame(game, io);
                }

                game.isAdvancing = false;
            } catch (error) {
                this.logger.error(`Error in manualAdvanceToNextQuestion for game ${game.pin}:`, error);
                game.isAdvancing = false;
            }
        }, this.config.TIMING.LEADERBOARD_DISPLAY_TIME);
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
        game.clearTimers();

        io.to(game.hostId).emit('hide-next-button');

        game.updateLeaderboard();
        game.saveResults();

        // Emit game-end event after brief delay
        setTimeout(() => {
            if (game.gameState === 'finished') {
                // Send to host (broadcast leaderboard)
                io.to(game.hostId).emit('game-end', {
                    finalLeaderboard: game.leaderboard
                });

                // Send to each player with their personal concept mastery
                game.players.forEach((player, playerId) => {
                    const conceptMastery = game.calculatePlayerConceptMastery(playerId);
                    io.to(playerId).emit('game-end', {
                        finalLeaderboard: game.leaderboard,
                        conceptMastery: conceptMastery
                    });
                });

                this.logger.debug(`Game ${game.pin} ended with ${game.players.size} players`);
            }
        }, 1000);
    }
}

module.exports = { GameSessionService };
