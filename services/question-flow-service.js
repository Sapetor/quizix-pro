/**
 * QuestionFlowService
 *
 * Manages question flow and answer handling including:
 * - Answer submission and validation
 * - Early question ending (when all players have answered)
 * - Answer statistics calculation
 * - Player result distribution
 */

class QuestionFlowService {
  constructor(logger, gameSessionService) {
    this.logger = logger;
    this.gameSessionService = gameSessionService;
  }

  /**
   * Handle player answer submission
   * @param {string} socketId - Socket ID of the player
   * @param {*} answer - Player's answer
   * @param {string} type - Answer type
   * @param {Object} playerData - Player data from registry
   * @param {Object} game - Game instance
   * @param {Object} socket - Socket instance
   * @param {Object} io - Socket.IO instance
   */
  handleAnswerSubmission(socketId, answer, type, playerData, game, socket, io) {
    if (!playerData) {
      this.logger.warn(`Answer submission from unknown player: ${socketId}`);
      return;
    }

    if (!game || game.gameState !== 'question') {
      this.logger.warn(`Answer submission rejected: game not in question state`);
      return;
    }

    // Submit the answer
    game.submitAnswer(socketId, answer, type);

    // Confirm submission to player
    socket.emit('answer-submitted', { answer: answer });

    // Check if all players have answered
    const totalPlayers = game.players.size;
    const answeredPlayers = Array.from(game.players.values())
      .filter(player => player.answers[game.currentQuestion]).length;

    this.logger.debug(`Answer submitted: ${answeredPlayers}/${totalPlayers} players answered`);

    // Emit live answer count update to host (only if host is connected)
    if (game.hostId) {
      const liveStats = {
        answeredPlayers: answeredPlayers,
        totalPlayers: totalPlayers
      };
      io.to(game.hostId).emit('answer-count-update', liveStats);
    }

    // If all players answered, end question early (check flag to prevent duplicates)
    if (answeredPlayers >= totalPlayers && totalPlayers > 0 &&
        game.gameState === 'question' && !game.endingQuestionEarly) {
      this.endQuestionEarly(game, io);
    }
  }

  /**
   * End question early when all players have answered
   * @param {Object} game - Game instance
   * @param {Object} io - Socket.IO instance
   */
  endQuestionEarly(game, io) {
    // Prevent duplicate calls with flag
    if (game.endingQuestionEarly) {
      this.logger.debug('Already ending question early, ignoring duplicate call');
      return;
    }
    game.endingQuestionEarly = true;

    this.logger.debug(`All players answered, ending question early for game ${game.pin}`);

    // Clear existing timers
    if (game.questionTimer) {
      clearTimeout(game.questionTimer);
      game.questionTimer = null;
    }

    if (game.advanceTimer) {
      clearTimeout(game.advanceTimer);
      game.advanceTimer = null;
    }

    // Wait 1 second before revealing answers (gives players time to see their submission)
    setTimeout(() => {
      try {
        // Reset flag
        game.endingQuestionEarly = false;

        if (game.gameState !== 'question') {
          this.logger.debug('Game state changed, skipping early end');
          return;
        }

        // End the question
        game.endQuestion();

        // Get question data with null check
        const question = game.quiz.questions[game.currentQuestion];
        if (!question) {
          this.logger.error(`Question not found at index ${game.currentQuestion}`);
          return;
        }

        // Build correct answer data
        const correctAnswerData = this.buildCorrectAnswerData(question);

        // Emit question timeout with early end flag
        io.to(`game-${game.pin}`).emit('question-timeout', {
          ...correctAnswerData,
          earlyEnd: true
        });

        // Get and emit answer statistics to host (only if host connected)
        if (game.hostId) {
          const answerStats = game.getAnswerStatistics();
          io.to(game.hostId).emit('answer-statistics', answerStats);
        }

        // Send individual results to each player
        this.emitPlayerResults(game, io);

        // Advance to next question
        this.gameSessionService.advanceToNextQuestion(game, io);
      } catch (error) {
        this.logger.error('Error in endQuestionEarly callback:', error);
        game.endingQuestionEarly = false;
      }
    }, 1000);
  }

  /**
   * Build correct answer data for a question
   * @param {Object} question - Question data
   * @returns {Object} Correct answer data
   */
  buildCorrectAnswerData(question) {
    const correctAnswer = question.correctAnswer;
    let correctOption = '';

    switch (question.type || 'multiple-choice') {
      case 'multiple-choice':
        correctOption = question.options && question.options[correctAnswer]
          ? question.options[correctAnswer]
          : '';
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

      default:
        correctOption = correctAnswer;
        break;
    }

    const data = {
      correctAnswer: correctAnswer,
      correctOption: correctOption,
      questionType: question.type || 'multiple-choice',
      tolerance: question.tolerance || null,
      explanation: question.explanation || null
    };

    // For multiple-correct questions, also send the correctAnswers array
    if (question.type === 'multiple-correct') {
      data.correctAnswers = question.correctAnswers || [];
    }

    return data;
  }

  /**
   * Emit individual results to each player
   * @param {Object} game - Game instance
   * @param {Object} io - Socket.IO instance
   */
  emitPlayerResults(game, io) {
    // Get explanation from current question if available
    const currentQuestion = game.quiz.questions[game.currentQuestion];
    const explanation = currentQuestion?.explanation || null;

    game.players.forEach((player, playerId) => {
      const playerAnswer = player.answers[game.currentQuestion];

      if (playerAnswer) {
        io.to(playerId).emit('player-result', {
          isCorrect: playerAnswer.isCorrect,
          points: playerAnswer.points,
          totalScore: player.score,
          explanation: explanation
        });
      } else {
        io.to(playerId).emit('player-result', {
          isCorrect: false,
          points: 0,
          totalScore: player.score,
          explanation: explanation
        });
      }
    });

    this.logger.debug(`Emitted results to ${game.players.size} players`);
  }

  /**
   * Get answer statistics for current question
   * @param {Object} game - Game instance
   * @returns {Object} Statistics object
   */
  getAnswerStatistics(game) {
    return game.getAnswerStatistics();
  }
}

module.exports = { QuestionFlowService };
