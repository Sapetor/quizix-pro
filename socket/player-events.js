/**
 * Player management event handlers
 * Handles: player-join, player-change-name, leave-game, disconnect
 */

const { validateAndHandle } = require('../services/validation-schemas');

function registerPlayerEvents(io, socket, options) {
    const { gameSessionService, playerManagementService, questionFlowService, checkRateLimit, logger } = options;

    socket.on('player-join', (data) => {
        if (!checkRateLimit(socket.id, 'player-join', 5, socket)) return;
        try {
            const validated = validateAndHandle(socket, 'player-join', data, logger);
            if (!validated) return;

            const { pin, name, deviceId } = validated;
            const game = gameSessionService.getGame(pin);

            const result = playerManagementService.handlePlayerJoin(
                socket.id,
                pin,
                name,
                game,
                socket,
                io,
                deviceId
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

    // Handle host reconnection after disconnect
    socket.on('host-rejoin', (data) => {
        if (!checkRateLimit(socket.id, 'host-rejoin', 5, socket)) return;
        try {
            if (!data?.pin) {
                socket.emit('error', { message: 'Missing game PIN' });
                return;
            }
            const game = gameSessionService.getGame(data.pin);
            if (!game || !game.hostDisconnected) {
                socket.emit('error', { message: 'Game not found or not in reconnect state' });
                return;
            }

            // Restore host
            game.hostDisconnected = false;
            game.hostDisconnectedAt = null;
            const oldHostId = game.hostId;
            game.hostId = socket.id;
            gameSessionService.clearHostDisconnectTimer(game.pin);
            gameSessionService.updateHostId(oldHostId, socket.id, game.pin);

            // Update host session socket ID
            const session = playerManagementService.getSessionByHostSocket(oldHostId);
            if (session) {
                session.hostSocketId = socket.id;
            }

            socket.join(`game-${game.pin}`);

            // Notify players
            io.to(`game-${game.pin}`).emit('host-reconnected');

            // Send current game state back to host
            socket.emit('host-rejoin-success', {
                pin: game.pin,
                gameState: game.gameState,
                currentQuestion: game.currentQuestion,
                players: Array.from(game.players.values()).map(p => ({
                    id: p.id, name: p.name, score: p.score,
                    disconnected: p.disconnected || false
                })),
                leaderboard: game.leaderboard,
                quizTitle: game.quiz.title
            });

            logger.info(`Host reconnected to game ${game.pin}`);
        } catch (error) {
            logger.error('Error in host-rejoin handler:', error);
            socket.emit('error', { message: 'Failed to rejoin as host' });
        }
    });

    // Handle session check from returning device
    socket.on('session-check', (data) => {
        if (!checkRateLimit(socket.id, 'session-check', 3, socket)) return;
        try {
            const validated = validateAndHandle(socket, 'session-check', data, logger);
            if (!validated) return;

            const { deviceId, hostSessionId } = validated;
            const session = playerManagementService.hostSessions.get(hostSessionId);

            if (!session || !session.playerRegistry.has(deviceId)) {
                socket.emit('session-invalid');
                return;
            }

            const entry = session.playerRegistry.get(deviceId);
            entry.socketId = socket.id;

            if (session.currentGamePin) {
                // Active game exists — auto-join the player
                const game = gameSessionService.getGame(session.currentGamePin);
                if (game && (game.gameState === 'lobby' || game.gameState === 'revealing' || game.gameState === 'question')) {
                    const result = playerManagementService.handlePlayerJoin(
                        socket.id, session.currentGamePin, entry.name, game, socket, io, deviceId
                    );
                    if (!result.success) {
                        socket.join(`session:${hostSessionId}`);
                        socket.emit('session-waiting', { hostSessionId });
                    }
                } else {
                    socket.join(`session:${hostSessionId}`);
                    socket.emit('session-waiting', { hostSessionId });
                }
            } else {
                // No active game — waiting room
                socket.join(`session:${hostSessionId}`);
                socket.emit('session-waiting', { hostSessionId });
            }
        } catch (error) {
            logger.error('Error in session-check handler:', error);
            socket.emit('session-invalid');
        }
    });

    // Handle player leaving session voluntarily
    socket.on('leave-session', (data) => {
        if (!checkRateLimit(socket.id, 'leave-session', 5, socket)) return;
        try {
            const validated = validateAndHandle(socket, 'leave-session', data, logger);
            if (!validated) return;

            const { deviceId, hostSessionId } = validated;
            playerManagementService.unregisterDevice(deviceId);
            socket.leave(`session:${hostSessionId}`);
            logger.info(`Device ${deviceId} left session ${hostSessionId}`);
        } catch (error) {
            logger.error('Error in leave-session handler:', error);
        }
    });

    // Handle host releasing all session players
    socket.on('release-session', (data) => {
        if (!checkRateLimit(socket.id, 'release-session', 3, socket)) return;
        try {
            const validated = validateAndHandle(socket, 'release-session', data, logger);
            if (!validated) return;

            const { hostSessionId } = validated;
            const session = playerManagementService.hostSessions.get(hostSessionId);

            if (!session || session.hostSocketId !== socket.id) {
                socket.emit('error', { message: 'Not authorized to release this session' });
                return;
            }

            // Make all sockets leave the session room before destroying
            const roomName = `session:${hostSessionId}`;
            const socketsInRoom = io.sockets.adapter.rooms.get(roomName);
            if (socketsInRoom) {
                for (const sid of [...socketsInRoom]) {
                    const s = io.sockets.sockets.get(sid);
                    if (s) {
                        s.emit('session-released');
                        s.leave(roomName);
                    }
                }
            }

            playerManagementService.destroySession(hostSessionId);
            logger.info(`Host released all players from session ${hostSessionId}`);
        } catch (error) {
            logger.error('Error in release-session handler:', error);
        }
    });

    // Handle timer resync request from player (e.g., after phone unlock)
    socket.on('request-time-sync', () => {
        if (!checkRateLimit(socket.id, 'request-time-sync', 3, socket)) return;
        try {
            const playerData = playerManagementService.getPlayer(socket.id);
            if (!playerData) return;

            const game = gameSessionService.getGame(playerData.gamePin);
            if (!game || game.gameState !== 'question') return;

            const question = game.quiz.questions[game.currentQuestion];
            const timeLimit = question.timeLimit || question.time || 20;
            const remainingMs = Math.max(0, (timeLimit * 1000) - (Date.now() - game.questionStartTime));

            socket.emit('time-sync', { remainingMs });
        } catch (error) {
            logger.error('Error in request-time-sync:', error);
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
                // Grace period for host: 30s before killing the game (only during active games)
                if (hostedGame.gameState !== 'lobby') {
                    hostedGame.hostDisconnectedAt = Date.now();
                    hostedGame.hostDisconnected = true;

                    // Notify players that host is temporarily disconnected
                    io.to(`game-${hostedGame.pin}`).emit('host-disconnected', {
                        graceMs: 30000
                    });

                    const timerId = setTimeout(() => {
                        gameSessionService.clearHostDisconnectTimer(hostedGame.pin);
                        // Only act if host hasn't reconnected
                        if (hostedGame.hostDisconnected) {
                            // Instead of deleting, transition to pending-migration
                            // so players can be migrated if host creates a new game
                            hostedGame.migrationSource = 'disconnect';
                            gameSessionService.setPendingMigration(hostedGame, io);

                            // Notify players that host is preparing a new game
                            io.to(`game-${hostedGame.pin}`).emit('host-preparing-new-game', { graceMs: 120000 });

                            logger.info(`Game ${hostedGame.pin} transitioned to pending-migration after host disconnect`);
                        }
                    }, 30000);
                    gameSessionService.setHostDisconnectTimer(hostedGame.pin, timerId);

                    logger.info(`Host disconnected from game ${hostedGame.pin} — 30s grace period started`);
                } else {
                    // In lobby: check if session has captured players
                    const session = playerManagementService.getSessionByHostSocket(socket.id);
                    if (session && session.playerRegistry.size > 0) {
                        // Session has players — start grace timer instead of immediate cleanup
                        session.currentGamePin = null;
                        const sessionId = session.hostSessionId;
                        const timerId = setTimeout(() => {
                            playerManagementService.sessionGraceTimers.delete(sessionId);
                            const roomName = `session:${sessionId}`;
                            const socketsInRoom = io.sockets.adapter.rooms.get(roomName);
                            if (socketsInRoom) {
                                for (const sid of [...socketsInRoom]) {
                                    const s = io.sockets.sockets.get(sid);
                                    if (s) {
                                        s.emit('session-released');
                                        s.leave(roomName);
                                    }
                                }
                            }
                            playerManagementService.destroySession(sessionId);
                            logger.info(`Session ${sessionId} destroyed after lobby disconnect grace period`);
                        }, 2 * 60 * 1000);
                        playerManagementService.sessionGraceTimers.set(sessionId, timerId);
                    }

                    // Still clean up the game immediately
                    playerManagementService.handleHostDisconnect(hostedGame, io);
                    gameSessionService.deleteGame(hostedGame.pin);
                }
            }

            // Clean up orphaned games
            gameSessionService.cleanupOrphanedGames(io);
        } catch (error) {
            logger.error('Error in disconnect handler:', error);
        }
    });
}

module.exports = { registerPlayerEvents };
