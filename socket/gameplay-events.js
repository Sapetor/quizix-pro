/**
 * Gameplay event handlers
 * Handles: submit-answer, use-power-up, next-question
 */

function registerGameplayEvents(io, socket, options) {
    const { gameSessionService, playerManagementService, questionFlowService, checkRateLimit, logger } = options;

    socket.on('submit-answer', (data) => {
        if (!checkRateLimit(socket.id, 'submit-answer', 3, socket)) return; // Strict limit: 3 per second
        try {
            if (!data || data.answer === undefined) {
                socket.emit('answer-error', { message: 'Invalid answer data', messageKey: 'error_invalid_answer' });
                return;
            }

            const { answer, type } = data;
            const playerData = playerManagementService.getPlayer(socket.id);
            if (!playerData) {
                socket.emit('answer-error', { message: 'Player session not found', messageKey: 'error_session_not_found' });
                return;
            }

            const game = gameSessionService.getGame(playerData.gamePin);
            if (!game) {
                socket.emit('answer-error', { message: 'Game not found', messageKey: 'error_game_not_found' });
                return;
            }

            questionFlowService.handleAnswerSubmission(
                socket.id,
                answer,
                type,
                playerData,
                game,
                socket,
                io
            );
        } catch (error) {
            logger.error('Error in submit-answer handler:', error);
            socket.emit('answer-error', { message: 'Server error processing answer', messageKey: 'error_server_error' });
        }
    });

    // Handle power-up usage
    socket.on('use-power-up', (data) => {
        if (!checkRateLimit(socket.id, 'use-power-up', 3, socket)) return;
        try {
            if (!data || !data.type) {
                socket.emit('power-up-result', { success: false, error: 'Invalid power-up data', messageKey: 'error_invalid_powerup' });
                return;
            }

            const { type } = data;
            const playerData = playerManagementService.getPlayer(socket.id);
            if (!playerData) {
                socket.emit('power-up-result', { success: false, error: 'Player not found', messageKey: 'error_player_not_found' });
                return;
            }

            const game = gameSessionService.getGame(playerData.gamePin);
            if (!game) {
                socket.emit('power-up-result', { success: false, error: 'Game not found', messageKey: 'error_game_not_found' });
                return;
            }

            const result = game.usePowerUp(socket.id, type);
            socket.emit('power-up-result', result);

            if (result.success) {
                logger.info(`Player ${playerData.name} used power-up: ${type} in game ${playerData.gamePin}`);
            }
        } catch (error) {
            logger.error('Error in use-power-up handler:', error);
            socket.emit('power-up-result', { success: false, error: 'Server error', messageKey: 'error_server_error' });
        }
    });

    socket.on('next-question', () => {
        if (!checkRateLimit(socket.id, 'next-question', 5, socket)) return;
        try {
            logger.debug('NEXT-QUESTION EVENT RECEIVED');
            const game = gameSessionService.findGameByHost(socket.id);

            if (!game) {
                logger.debug('No game found for host');
                return;
            }

            logger.debug('Game state before next-question:', {
                gameState: game.gameState,
                currentQuestion: game.currentQuestion,
                totalQuestions: game.quiz.questions.length,
                gamePin: game.pin
            });

            gameSessionService.manualAdvanceToNextQuestion(game, io);
        } catch (error) {
            logger.error('SERVER ERROR in next-question handler:', error);
            logger.error('Error stack:', error.stack);
        }
    });
}

module.exports = { registerGameplayEvents };
