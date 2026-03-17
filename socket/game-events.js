/**
 * Game lifecycle event handlers
 * Handles: host-join, start-game, rematch-game
 */

const { validateAndHandle } = require('../services/validation-schemas');

function registerGameEvents(io, socket, options) {
    const { gameSessionService, playerManagementService, questionFlowService, checkRateLimit, logger } = options;

    socket.on('host-join', (data) => {
        if (!checkRateLimit(socket.id, 'host-join', 5, socket)) return;
        try {
            const validated = validateAndHandle(socket, 'host-join', data, logger);
            if (!validated) return;

            const { quiz } = validated;
            logger.debug(`host-join: "${quiz.title}" with ${quiz.questions.length} questions`);

            if (quiz.questions.length === 0) {
                socket.emit('error', { message: 'Quiz must have at least one question', messageKey: 'error_quiz_needs_questions' });
                return;
            }

            // Check if host already has an existing game
            const existingGame = gameSessionService.findGameByHost(socket.id);
            if (existingGame) {
                existingGame.endQuestion();
                io.to(`game-${existingGame.pin}`).emit('game-ended', { reason: 'Host started new game', messageKey: 'error_host_new_game' });
                gameSessionService.deleteGame(existingGame.pin);
            }

            // Create new game
            const game = gameSessionService.createGame(socket.id, quiz);

            socket.join(`game-${game.pin}`);
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
            socket.emit('error', { message: 'Failed to create game', messageKey: 'error_failed_create_game' });
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
            socket.emit('error', { message: 'Failed to start game', messageKey: 'error_failed_start_game' });
        }
    });

    // Handle stop-quiz - host ends the game early, shows final results
    socket.on('stop-quiz', () => {
        if (!checkRateLimit(socket.id, 'stop-quiz', 3, socket)) return;
        try {
            const game = gameSessionService.findGameByHost(socket.id);
            if (!game) return;
            if (game.gameState === 'finished') return;

            // If a question is actively running, end it first
            if (game.gameState === 'question') {
                game.endingQuestionEarly = false;
                if (game.earlyEndTimer) {
                    clearTimeout(game.earlyEndTimer);
                    game.earlyEndTimer = null;
                }

                game.endQuestion();

                const question = game.quiz.questions[game.currentQuestion];
                const correctAnswerData = questionFlowService.buildCorrectAnswerData(question);

                io.to(game.hostId).emit('question-timeout', correctAnswerData);
                io.to(game.hostId).emit('answer-statistics', game.getAnswerStatistics());
                questionFlowService.emitPlayerResults(game, io);
            }

            // Clear pending timers
            game.isAdvancing = false;
            if (game.advanceTimer) {
                clearTimeout(game.advanceTimer);
                game.advanceTimer = null;
            }
            if (game.leaderboardTimer) {
                clearTimeout(game.leaderboardTimer);
                game.leaderboardTimer = null;
            }

            gameSessionService.endGame(game, io);
            logger.info(`Game ${game.pin} stopped early by host`);
        } catch (error) {
            logger.error('Error in stop-quiz handler:', error);
            socket.emit('error', { message: 'Failed to stop quiz', messageKey: 'error_failed_stop_quiz' });
        }
    });

    // Handle host-leave-game - host leaves, all players disconnected
    socket.on('host-leave-game', () => {
        if (!checkRateLimit(socket.id, 'host-leave-game', 3, socket)) return;
        try {
            const game = gameSessionService.findGameByHost(socket.id);
            if (!game) return;

            playerManagementService.handleHostDisconnect(game, io);
            gameSessionService.deleteGame(game.pin);
            logger.info(`Host left game ${game.pin}`);
        } catch (error) {
            logger.error('Error in host-leave-game handler:', error);
        }
    });

    // Handle rematch - reset game with same PIN, keep players, allow new joins
    socket.on('rematch-game', () => {
        if (!checkRateLimit(socket.id, 'rematch-game', 3, socket)) return;
        try {
            const game = gameSessionService.findGameByHost(socket.id);
            if (!game) {
                socket.emit('error', { message: 'Game not found', messageKey: 'error_game_not_found' });
                return;
            }

            // Only allow rematch if game has finished
            if (game.gameState !== 'finished') {
                socket.emit('error', { message: 'Can only rematch after game ends', messageKey: 'error_can_only_rematch' });
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
            socket.emit('error', { message: 'Failed to start rematch', messageKey: 'error_failed_rematch' });
        }
    });
}

module.exports = { registerGameEvents };
