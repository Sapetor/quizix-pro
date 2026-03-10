/**
 * Player management event handlers
 * Handles: player-join, player-change-name, leave-game, disconnect
 */

function registerPlayerEvents(io, socket, options) {
    const { gameSessionService, playerManagementService, questionFlowService, checkRateLimit, logger } = options;

    socket.on('player-join', (data) => {
        if (!checkRateLimit(socket.id, 'player-join', 5, socket)) return;
        try {
            if (!data || typeof data !== 'object') {
                socket.emit('error', { message: 'Invalid request data', messageKey: 'error_invalid_request' });
                return;
            }

            const { pin, name } = data;
            const game = gameSessionService.getGame(pin);

            const result = playerManagementService.handlePlayerJoin(
                socket.id,
                pin,
                name,
                game,
                socket,
                io
            );

            if (!result.success) {
                socket.emit('error', { message: result.error, messageKey: result.messageKey || 'error_failed_join' });
            }
        } catch (error) {
            logger.error('Error in player-join handler:', error);
            socket.emit('error', { message: 'Failed to join game', messageKey: 'error_failed_join' });
        }
    });

    socket.on('player-change-name', (data) => {
        if (!checkRateLimit(socket.id, 'player-change-name', 5, socket)) return;
        try {
            if (!data || typeof data !== 'object') {
                socket.emit('error', { message: 'Invalid request data', messageKey: 'error_invalid_request' });
                return;
            }

            const { newName } = data;
            const playerData = playerManagementService.getPlayer(socket.id);

            if (!playerData) {
                socket.emit('error', { message: 'Player not found', messageKey: 'error_player_not_found' });
                return;
            }

            const game = gameSessionService.getGame(playerData.gamePin);

            const result = playerManagementService.handlePlayerNameChange(
                socket.id,
                newName,
                game,
                socket,
                io
            );

            if (!result.success) {
                socket.emit('error', { message: result.error, messageKey: result.messageKey || 'error_failed_change_name' });
            }
        } catch (error) {
            logger.error('Error in player-change-name handler:', error);
            socket.emit('error', { message: 'Failed to change name', messageKey: 'error_failed_change_name' });
        }
    });

    // Handle player rejoin via session token
    socket.on('player-rejoin', (data) => {
        if (!checkRateLimit(socket.id, 'player-rejoin', 5, socket)) return;
        try {
            if (!data || typeof data !== 'object') {
                socket.emit('rejoin-failed', { message: 'Invalid request data' });
                return;
            }

            const { pin, sessionToken } = data;
            const game = gameSessionService.getGame(pin);

            const result = playerManagementService.handlePlayerRejoin(
                socket.id,
                pin,
                sessionToken,
                game,
                socket,
                io,
                questionFlowService
            );

            if (!result.success) {
                socket.emit('rejoin-failed', { message: result.error, messageKey: result.messageKey });
            }
        } catch (error) {
            logger.error('Error in player-rejoin handler:', error);
            socket.emit('rejoin-failed', { message: 'Failed to rejoin game' });
        }
    });

    // Handle intentional leave (player clicks leave button)
    socket.on('leave-game', () => {
        try {
            const playerData = playerManagementService.getPlayer(socket.id);
            if (playerData) {
                const game = gameSessionService.getGame(playerData.gamePin);
                playerManagementService.handlePlayerDisconnect(socket.id, game, io, true);
                logger.info(`Player ${playerData.name} left game ${playerData.gamePin} intentionally`);
            }
        } catch (error) {
            logger.error('Error handling leave-game:', error);
        }
    });

    socket.on('disconnect', () => {
        try {
            // Handle player disconnect (non-intentional — grace period for active games)
            const playerData = playerManagementService.getPlayer(socket.id);
            if (playerData) {
                const game = gameSessionService.getGame(playerData.gamePin);
                playerManagementService.handlePlayerDisconnect(socket.id, game, io, false);
            }

            // Handle host disconnect
            const hostedGame = gameSessionService.findGameByHost(socket.id);
            if (hostedGame) {
                playerManagementService.handleHostDisconnect(hostedGame, io);
                gameSessionService.deleteGame(hostedGame.pin);
            }

            // Clean up orphaned games
            gameSessionService.cleanupOrphanedGames(io);
        } catch (error) {
            logger.error('Error in disconnect handler:', error);
        }
    });
}

module.exports = { registerPlayerEvents };
