/**
 * QuestionFlowService
 *
 * Manages question flow and answer handling including:
 * - Answer submission and validation
 * - Early question ending (when all players have answered)
 * - Answer statistics calculation
 * - Player result distribution
 */

// Window over which per-answer host count updates are coalesced into one emit
const ANSWER_COUNT_FLUSH_MS = 100;

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

        // `endingQuestionEarly` covers the reveal delay in endQuestionEarly: the
        // round is already called but gameState is still 'question' for ~1s.
        // Without this gate late answers were accepted and speed-bonus-scored.
        if (!game || game.gameState !== 'question' || game.endingQuestionEarly) {
            this.logger.warn('Answer submission rejected: game not in question state');
            // Inform player their answer was rejected (too late or game not ready)
            socket.emit('answer-rejected', {
                reason: game ? 'question_ended' : 'game_not_found',
                message: game ? 'Question has already ended' : 'Game not found',
                messageKey: game ? 'error_question_ended' : 'error_game_not_found'
            });
            return;
        }

        // Submit the answer
        const submission = game.submitAnswer(socketId, answer, type);

        if (!submission.accepted) {
            this.logger.debug(`Answer submission not accepted (${submission.reason}) for ${socketId}`);
            if (submission.reason === 'duplicate') {
                // Echo the answer actually on record so a client that lost its
                // local submitted-state (retry, double-tap, reconnect replay)
                // re-renders the locked-in answer rather than what it just re-sent.
                socket.emit('answer-already-submitted', {
                    reason: submission.reason,
                    answer: submission.result.answer
                });
            } else {
                socket.emit('answer-rejected', {
                    reason: submission.reason,
                    message: 'You are not registered in this game',
                    messageKey: 'error_player_not_found'
                });
            }
            return;
        }

        // Confirm submission to player
        socket.emit('answer-submitted', { answer: answer });

        this.scheduleAnswerCountUpdate(game, io);
    }

    /**
   * Schedule a coalesced answer-count flush for this game.
   * With many players, one emit + one scan per 100ms window replaces one per answer.
   * @param {Object} game - Game instance
   * @param {Object} io - Socket.IO instance
   */
    scheduleAnswerCountUpdate(game, io) {
        if (game.answerCountTimer) return; // flush already pending

        // Latch the disconnect epoch so the flush can tell whether the roster
        // shrank while it was pending — see flushAnswerCount.
        game.answerCountArmEpoch = game.disconnectEpoch;

        game.answerCountTimer = setTimeout(() => {
            game.answerCountTimer = null;
            try {
                this.flushAnswerCount(game, io);
            } catch (error) {
                this.logger.error('Error flushing answer count:', error);
            }
        }, ANSWER_COUNT_FLUSH_MS);
    }

    /**
   * Single scan of the player map feeding both the host count update and the
   * "everyone answered" early-end check.
   * @param {Object} game - Game instance
   * @param {Object} io - Socket.IO instance
   */
    flushAnswerCount(game, io) {
        // The question may have ended (timeout, host advance, teardown) while pending
        if (game.gameState !== 'question') {
            this.logger.debug('Answer count flush skipped: game no longer in question state');
            return;
        }

        let connectedPlayers = 0;
        let answeredPlayers = 0;
        game.players.forEach(player => {
            if (player.disconnected) return;
            connectedPlayers++;
            if (player.answers[game.currentQuestion]) answeredPlayers++;
        });

        this.logger.debug(`Answer count: ${answeredPlayers}/${connectedPlayers} active players answered`);

        // Emit live answer count update to host (only if host is connected)
        if (game.hostId) {
            io.to(game.hostId).emit('answer-count-update', {
                answeredPlayers,
                connectedPlayers,
                totalPlayers: game.players.size
            });
        }

        // A disconnect must never be what ends a question early: a player whose
        // Wi-Fi blips has a 2-minute grace period to rejoin, so shrinking the
        // active roster is not consent to cut the question short. If anyone
        // dropped while this flush was pending, the gap may have closed because
        // the roster shrank rather than because someone answered — skip the
        // early-end decision. The next accepted answer re-arms and re-checks;
        // otherwise the question runs its full timer.
        const rosterShrankWhilePending = game.disconnectEpoch !== game.answerCountArmEpoch;

        // If all active players answered, end question early (check flag to prevent duplicates)
        if (answeredPlayers >= connectedPlayers && connectedPlayers > 0 &&
            !rosterShrankWhilePending && !game.endingQuestionEarly) {
            this.endQuestionEarly(game, io);
        }
    }

    /**
   * End question early (all players answered, or the host pressed End Round)
   * @param {Object} game - Game instance
   * @param {Object} io - Socket.IO instance
   * @param {string} [trigger] - 'all-answered' (default) or 'host'
   */
    endQuestionEarly(game, io, trigger = 'all-answered') {
    // Prevent duplicate calls with flag
        if (game.endingQuestionEarly) {
            this.logger.debug('Already ending question early, ignoring duplicate call');
            return;
        }
        game.endingQuestionEarly = true;

        const reason = trigger === 'host' ? 'Host ended the round' : 'All players answered';
        this.logger.debug(`${reason}, ending question early for game ${game.pin}`);

        // Clear existing timers
        if (game.questionTimer) {
            clearTimeout(game.questionTimer);
            game.questionTimer = null;
        }

        if (game.advanceTimer) {
            clearTimeout(game.advanceTimer);
            game.advanceTimer = null;
        }

        if (game.answerCountTimer) {
            clearTimeout(game.answerCountTimer);
            game.answerCountTimer = null;
        }

        // Wait 1 second before revealing answers (gives players time to see their submission)
        // Store timer ID for proper cleanup if game is destroyed
        game.earlyEndTimer = setTimeout(() => {
            game.earlyEndTimer = null;
            try {
                // Check game state BEFORE resetting flag
                if (game.gameState !== 'question') {
                    this.logger.debug('Game state changed, skipping early end');
                    game.endingQuestionEarly = false;
                    return;
                }

                // End the question
                game.endQuestion();

                // Get question data with null check
                const question = game.quiz.questions[game.currentQuestion];
                if (!question) {
                    this.logger.error(`Question not found at index ${game.currentQuestion}`);
                    game.endingQuestionEarly = false;
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

                // Reset flag AFTER successful completion
                game.endingQuestionEarly = false;
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
        // Poll: there is nothing to reveal. Send explicit nulls so the client
        // never highlights a tile or claims an answer was right/wrong.
        if (question.isPoll === true) {
            return {
                correctAnswer: null,
                correctOption: '',
                questionType: question.type || 'true-false',
                tolerance: null,
                explanation: question.explanation || null,
                isPoll: true
            };
        }

        const correctAnswer = question.correctAnswer ?? question.correctIndex;
        let correctOption = '';

        switch (question.type || 'multiple-choice') {
            case 'multiple-choice':
                correctOption = question.options && question.options[correctAnswer]
                    ? question.options[correctAnswer]
                    : '';
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
                    .join(' → ');
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
            explanation: question.explanation || null,
            isPoll: false
        };

        // For multiple-correct questions, also send the correctAnswers array
        if (question.type === 'multiple-correct') {
            data.correctAnswers = question.correctAnswers || [];
        }

        // Ordering needs the canonical index order (not just the joined display
        // string) so the host reveal can number the item tiles.
        if (question.type === 'ordering') {
            data.correctOrder = question.correctOrder || [];
        }

        return data;
    }

    /**
   * Emit individual results to each player
   * @param {Object} game - Game instance
   * @param {Object} io - Socket.IO instance
   */
    emitPlayerResults(game, io) {
        const currentQuestion = game.quiz.questions[game.currentQuestion];
        const correctAnswerData = this.buildCorrectAnswerData(currentQuestion);

        game.players.forEach((player, playerId) => {
            // Skip disconnected players — they'll get results on reconnection
            if (player.disconnected) return;

            const playerAnswer = player.answers[game.currentQuestion];

            // Inverse-map canonical correct indices into this player's shuffled
            // coordinate space (mapping[shuffledIndex] = originalIndex, so indexOf
            // converts canonical -> displayed). When randomizeAnswers is off the
            // mapping is empty and values pass through unchanged.
            const mapping = game.answerMappings?.get(playerId);
            let correctAnswer = correctAnswerData.correctAnswer;
            let correctAnswers = correctAnswerData.correctAnswers;
            if (mapping) {
                if (correctAnswerData.questionType === 'multiple-choice' && typeof correctAnswer === 'number') {
                    correctAnswer = mapping.indexOf(correctAnswer);
                }
                if (correctAnswerData.questionType === 'multiple-correct' && Array.isArray(correctAnswers)) {
                    correctAnswers = correctAnswers.map(idx => mapping.indexOf(idx));
                }
            }

            io.to(playerId).emit('player-result', {
                isPoll: correctAnswerData.isPoll === true,
                isCorrect: playerAnswer ? playerAnswer.isCorrect : false,
                points: playerAnswer ? playerAnswer.points : 0,
                partialScore: playerAnswer ? playerAnswer.partialScore : undefined,
                totalScore: player.score,
                explanation: currentQuestion?.explanation || null,
                questionType: correctAnswerData.questionType,
                correctAnswer: correctAnswer,
                correctAnswers: correctAnswers
            });
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
