/**
 * Gameplay event handlers
 * Handles: submit-answer, use-power-up, next-question
 */

const { validateAndHandle } = require('../services/validation-schemas');

function registerGameplayEvents(io, socket, options) {
    const { gameSessionService, playerManagementService, questionFlowService, checkRateLimit, logger } = options;

    socket.on('submit-answer', (data) => {
        if (!checkRateLimit(socket.id, 'submit-answer', 3, socket)) return; // Strict limit: 3 per second
        try {
            const validated = validateAndHandle(socket, 'submit-answer', data, logger);
            if (!validated) return;

            const { answer, type } = validated;
            const playerData = playerManagementService.getPlayer(socket.id);
            if (!playerData) {
                socket.emit('answer-rejected', { message: 'Player session not found', messageKey: 'error_session_not_found' });
                return;
            }

            const game = gameSessionService.getGame(playerData.gamePin);
            if (!game) {
                socket.emit('answer-rejected', { message: 'Game not found', messageKey: 'error_game_not_found' });
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
            socket.emit('answer-rejected', { message: 'Server error processing answer', messageKey: 'error_server_error' });
        }
    });

    // Handle power-up usage
    socket.on('use-power-up', (data) => {
        if (!checkRateLimit(socket.id, 'use-power-up', 3, socket)) return;
        try {
            const validated = validateAndHandle(socket, 'use-power-up', data, logger);
            if (!validated) {
                socket.emit('power-up-result', { success: false, error: 'Invalid power-up data', messageKey: 'error_invalid_powerup' });
                return;
            }

            const { type } = validated;
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
                // Extend-time extends the authoritative room timer and resyncs everyone
                if (type === 'extend-time' && result.extraSeconds) {
                    gameSessionService.extendQuestionTimer(game, io, result.extraSeconds);
                }
                logger.info(`Player ${playerData.name} used power-up: ${type} in game ${playerData.gamePin}`);
            }
        } catch (error) {
            logger.error('Error in use-power-up handler:', error);
            socket.emit('power-up-result', { success: false, error: 'Server error', messageKey: 'error_server_error' });
        }
    });

    // Host forces the current question to end early
    socket.on('force-end-question', () => {
        if (!checkRateLimit(socket.id, 'force-end-question', 2, socket)) return;
        try {
            const game = gameSessionService.findGameByHost(socket.id);
            if (!game || game.gameState !== 'question') return;

            logger.info(`Host force-ended question ${game.currentQuestion + 1} in game ${game.pin}`);
            questionFlowService.endQuestionEarly(game, io, 'host');
        } catch (error) {
            logger.error('Error in force-end-question handler:', error);
        }
    });

    // Host mutes/unmutes game sounds on every PLAYER device.
    // socket.to() excludes the sender, so the host's own device keeps using its
    // header sound toggle and is never affected by this control.
    socket.on('set-players-muted', (data) => {
        if (!checkRateLimit(socket.id, 'set-players-muted', 3, socket)) return;
        try {
            const game = gameSessionService.findGameByHost(socket.id);
            if (!game) return;

            const muted = data?.muted === true;
            game.playersMuted = muted;
            socket.to(`game-${game.pin}`).emit('players-muted', { muted });

            logger.info(`Host ${muted ? 'muted' : 'unmuted'} all players in game ${game.pin}`);
        } catch (error) {
            logger.error('Error in set-players-muted handler:', error);
        }
    });

    socket.on('next-question', () => {
        if (!checkRateLimit(socket.id, 'next-question', 5, socket)) return;
        try {
            const game = gameSessionService.findGameByHost(socket.id);
            // Only the reveal is a legitimate manual advance. Accepting it in
            // 'lobby' or 'starting' left the pending game-start timer armed, so it
            // fired afterwards and advanced a second time, cutting question 1 short.
            if (!game || game.gameState !== 'revealing') return;

            logger.debug(`next-question: game ${game.pin}, question ${game.currentQuestion + 1}/${game.quiz.questions.length}`);
            gameSessionService.manualAdvanceToNextQuestion(game, io);
        } catch (error) {
            logger.error('Error in next-question handler:', error);
        }
    });
}

module.exports = { registerGameplayEvents };
