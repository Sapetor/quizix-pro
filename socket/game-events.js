/**
 * Game lifecycle event handlers
 * Handles: host-join, start-game, rematch-game
 */

function registerGameEvents(io, socket, options) {
    const { gameSessionService, playerManagementService, checkRateLimit, logger } = options;

    socket.on('host-join', (data) => {
        if (!checkRateLimit(socket.id, 'host-join', 5, socket)) return;
        try {
            logger.debug('host-join event received');
            logger.debug('host-join received data:', JSON.stringify(data, null, 2));
            logger.debug('quiz title from data:', data?.quiz?.title);

            if (!data || !data.quiz || !Array.isArray(data.quiz.questions)) {
                socket.emit('error', { message: 'Invalid quiz data' });
                return;
            }

            const { quiz } = data;
            logger.debug('extracted quiz title:', quiz.title);

            if (quiz.questions.length === 0) {
                socket.emit('error', { message: 'Quiz must have at least one question' });
                return;
            }

            // Check if host already has an existing game
            const existingGame = gameSessionService.findGameByHost(socket.id);
            if (existingGame) {
                existingGame.endQuestion();
                io.to(`game-${existingGame.pin}`).emit('game-ended', { reason: 'Host started new game' });
                gameSessionService.deleteGame(existingGame.pin);
            }

            // Create new game
            const game = gameSessionService.createGame(socket.id, quiz);

            socket.join(`game-${game.pin}`);
            logger.debug('Sending game-created with title:', quiz.title);
            socket.emit('game-created', {
                pin: game.pin,
                gameId: game.id,
                title: quiz.title
            });

            socket.broadcast.emit('game-available', {
                pin: game.pin,
                title: quiz.title,
                questionCount: quiz.questions.length,
                created: game.createdAt
            });
        } catch (error) {
            logger.error('Error in host-join handler:', error);
            socket.emit('error', { message: 'Failed to create game' });
        }
    });

    socket.on('start-game', () => {
        if (!checkRateLimit(socket.id, 'start-game', 3, socket)) return;
        try {
            const game = gameSessionService.findGameByHost(socket.id);
            if (!game) {
                return;
            }

            gameSessionService.startGame(game, io);
        } catch (error) {
            logger.error('Error in start-game handler:', error);
            socket.emit('error', { message: 'Failed to start game' });
        }
    });

    // Handle rematch - reset game with same PIN, keep players, allow new joins
    socket.on('rematch-game', () => {
        if (!checkRateLimit(socket.id, 'rematch-game', 3, socket)) return;
        try {
            const game = gameSessionService.findGameByHost(socket.id);
            if (!game) {
                socket.emit('error', { message: 'Game not found' });
                return;
            }

            // Only allow rematch if game has finished
            if (game.gameState !== 'finished') {
                socket.emit('error', { message: 'Can only rematch after game ends' });
                return;
            }

            // Reset the game
            game.reset();

            // Get current player list for the lobby
            const playerList = Array.from(game.players.values()).map(p => ({
                id: p.id,
                name: p.name
            }));

            // Notify all clients in the game room that game has been reset
            io.to(`game-${game.pin}`).emit('game-reset', {
                pin: game.pin,
                title: game.quiz.title,
                players: playerList,
                questionCount: game.quiz.questions.length,
                hostSocketId: socket.id
            });

            logger.info(`Game ${game.pin} reset for rematch by host`);
        } catch (error) {
            logger.error('Error in rematch-game handler:', error);
            socket.emit('error', { message: 'Failed to start rematch' });
        }
    });
}

module.exports = { registerGameEvents };
