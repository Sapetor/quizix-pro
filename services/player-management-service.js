/**
 * PlayerManagementService
 *
 * Manages player lifecycle including:
 * - Player join/leave operations
 * - Player state tracking
 * - Disconnection handling
 * - Player reference cleanup
 */

class PlayerManagementService {
    constructor(logger, config) {
        this.logger = logger;
        this.config = config;
        this.players = new Map(); // Global player registry: socketId -> { gamePin, name }
        this.disconnectTimers = new Map(); // sessionToken -> timeoutId for grace period removal
    }

    /**
   * Handle player joining a game
   * @param {string} socketId - Socket ID of the player
   * @param {string} pin - Game PIN
   * @param {string} name - Player name
   * @param {Object} game - Game instance
   * @param {Object} socket - Socket instance
   * @param {Object} io - Socket.IO instance
   * @returns {Object} Result object with success status and optional error message
   */
    handlePlayerJoin(socketId, pin, name, game, socket, io) {
    // Validate input
        if (!pin || !name || typeof pin !== 'string' || typeof name !== 'string') {
            return {
                success: false,
                error: 'PIN and name are required',
                messageKey: 'error_pin_name_required'
            };
        }

        // Validate name length
        if (name.length > this.config.LIMITS.MAX_PLAYER_NAME_LENGTH || name.trim().length === 0) {
            return {
                success: false,
                error: `Name must be 1-${this.config.LIMITS.MAX_PLAYER_NAME_LENGTH} characters`,
                messageKey: 'error_name_length'
            };
        }

        // Validate name content - allow alphanumeric, spaces, and common special chars
        // Prevents XSS and other injection attacks
        if (!/^[\p{L}\p{N}\s\-_'.!?]+$/u.test(name)) {
            return {
                success: false,
                error: 'Name contains invalid characters',
                messageKey: 'error_name_invalid_chars'
            };
        }

        // Check if game exists
        if (!game) {
            return {
                success: false,
                error: 'Game not found',
                messageKey: 'error_game_not_found'
            };
        }

        // Check if game is still in lobby
        if (game.gameState !== 'lobby') {
            return {
                success: false,
                error: 'Game already started',
                messageKey: 'error_game_already_started'
            };
        }

        // Add player to game (returns result object with success/error)
        const addResult = game.addPlayer(socketId, name);
        if (!addResult.success) {
            return {
                success: false,
                error: addResult.error
            };
        }

        // Generate session token for reconnection
        const crypto = require('crypto');
        const sessionToken = crypto.randomUUID();
        const player = game.players.get(socketId);
        if (player) {
            player.sessionToken = sessionToken;
        }

        this.players.set(socketId, { gamePin: pin, name });

        // Join socket room
        socket.join(`game-${pin}`);

        // Get current player list
        const currentPlayers = this._getPlayerListForBroadcast(game);

        // Emit success to joining player (includes sessionToken for reconnection)
        socket.emit('player-joined', {
            gamePin: pin,
            playerName: name,
            players: currentPlayers,
            sessionToken
        });

        // Broadcast updated player list to all players in the game
        io.to(`game-${pin}`).emit('player-list-update', {
            players: currentPlayers
        });

        this.logger.info(`Player ${name} joined game ${pin} (${currentPlayers.length} players)`);

        return {
            success: true,
            playerCount: currentPlayers.length
        };
    }

    /**
   * Handle player disconnection
   * @param {string} socketId - Socket ID of the disconnected player
   * @param {Object} game - Game instance (if player was in a game)
   * @param {Object} io - Socket.IO instance
   */
    handlePlayerDisconnect(socketId, game, io, intentional = false) {
        const playerData = this.players.get(socketId);

        if (playerData && game) {
            const gamePlayer = game.players.get(socketId);

            // If game is active (not lobby) and disconnect is not intentional,
            // mark player as disconnected instead of removing them
            if (!intentional && gamePlayer && gamePlayer.sessionToken && game.gameState !== 'lobby') {
                gamePlayer.disconnected = true;
                gamePlayer.disconnectedAt = Date.now();
                gamePlayer.oldSocketId = socketId;

                const sessionToken = gamePlayer.sessionToken;

                // Set grace period timer (2 minutes) — after which, truly remove them
                const gracePeriodMs = 2 * 60 * 1000;
                const timerId = setTimeout(() => {
                    this._finalizePlayerRemoval(sessionToken, game, io);
                }, gracePeriodMs);
                this.disconnectTimers.set(sessionToken, timerId);

                // Broadcast updated player list (with disconnected flag)
                const currentPlayers = this._getPlayerListForBroadcast(game);
                io.to(`game-${playerData.gamePin}`).emit('player-list-update', {
                    players: currentPlayers
                });

                // Emit player-disconnected event for audio feedback
                io.to(`game-${playerData.gamePin}`).emit('player-disconnected', {
                    playerName: playerData.name,
                    players: currentPlayers
                });

                this.logger.info(`Player ${playerData.name} marked as disconnected in game ${playerData.gamePin} (grace period started)`);
            } else {
                // Lobby or intentional leave: remove immediately
                game.removePlayer(socketId);

                const currentPlayers = this._getPlayerListForBroadcast(game);

                io.to(`game-${playerData.gamePin}`).emit('player-list-update', {
                    players: currentPlayers
                });

                io.to(`game-${playerData.gamePin}`).emit('player-disconnected', {
                    playerName: playerData.name,
                    players: currentPlayers
                });

                this.logger.info(`Player ${playerData.name} removed from game ${playerData.gamePin}`);
            }

            // Update live answer count if game is in question state
            if (game.gameState === 'question' && game.hostId) {
                const activePlayers = Array.from(game.players.values())
                    .filter(p => !p.disconnected);
                const answeredPlayers = activePlayers
                    .filter(player => player.answers && player.answers[game.currentQuestion]).length;

                io.to(game.hostId).emit('answer-count-update', {
                    answeredPlayers: answeredPlayers,
                    totalPlayers: activePlayers.length
                });
            }
        }

        // Remove from global player registry
        this.players.delete(socketId);
    }

    /**
     * Finalize removal of a disconnected player after grace period expires
     * @param {string} sessionToken - The player's session token
     * @param {Object} game - Game instance
     * @param {Object} io - Socket.IO instance
     */
    _finalizePlayerRemoval(sessionToken, game, io) {
        this.disconnectTimers.delete(sessionToken);

        if (!game || game.gameState === 'ended') return;

        // Find the player by session token
        for (const [playerId, player] of game.players) {
            if (player.sessionToken === sessionToken && player.disconnected) {
                game.removePlayer(playerId);
                this.players.delete(playerId);

                const currentPlayers = this._getPlayerListForBroadcast(game);
                io.to(`game-${game.pin}`).emit('player-list-update', {
                    players: currentPlayers
                });

                this.logger.info(`Player ${player.name} removed after grace period expired in game ${game.pin}`);
                break;
            }
        }
    }

    /**
     * Handle player rejoin via session token
     * @param {string} newSocketId - New socket ID of the reconnecting player
     * @param {string} pin - Game PIN
     * @param {string} sessionToken - Session token from previous connection
     * @param {Object} game - Game instance
     * @param {Object} socket - Socket instance
     * @param {Object} io - Socket.IO instance
     * @returns {Object} Result object with success status
     */
    handlePlayerRejoin(newSocketId, pin, sessionToken, game, socket, io) {
        if (!pin || !sessionToken) {
            return { success: false, error: 'PIN and session token are required' };
        }

        if (!game) {
            return { success: false, error: 'Game not found', messageKey: 'error_game_not_found' };
        }

        // Find the disconnected player by session token
        let foundPlayerId = null;
        let foundPlayer = null;
        for (const [playerId, player] of game.players) {
            if (player.sessionToken === sessionToken && player.disconnected) {
                foundPlayerId = playerId;
                foundPlayer = player;
                break;
            }
        }

        if (!foundPlayer) {
            return { success: false, error: 'Session not found or expired', messageKey: 'rejoin_failed' };
        }

        // Clear the grace period timer
        const timerId = this.disconnectTimers.get(sessionToken);
        if (timerId) {
            clearTimeout(timerId);
            this.disconnectTimers.delete(sessionToken);
        }

        // Reassign player data to new socket ID
        game.players.delete(foundPlayerId);
        foundPlayer.id = newSocketId;
        foundPlayer.disconnected = false;
        foundPlayer.disconnectedAt = null;
        delete foundPlayer.oldSocketId;
        game.players.set(newSocketId, foundPlayer);

        // Update answer mappings if they exist
        if (game.answerMappings.has(foundPlayerId)) {
            const mapping = game.answerMappings.get(foundPlayerId);
            game.answerMappings.delete(foundPlayerId);
            game.answerMappings.set(newSocketId, mapping);
        }

        // Update global player registry
        this.players.set(newSocketId, { gamePin: pin, name: foundPlayer.name });

        // Join socket room
        socket.join(`game-${pin}`);

        // Emit rejoin success with current game state
        socket.emit('rejoin-success', {
            playerName: foundPlayer.name,
            score: foundPlayer.score,
            currentQuestion: game.currentQuestion,
            gameStatus: game.gameState,
            sessionToken: sessionToken,
            gamePin: pin
        });

        // Broadcast updated player list
        const currentPlayers = this._getPlayerListForBroadcast(game);
        io.to(`game-${pin}`).emit('player-list-update', {
            players: currentPlayers
        });

        this.logger.info(`Player ${foundPlayer.name} rejoined game ${pin} (score: ${foundPlayer.score})`);

        return { success: true, playerName: foundPlayer.name };
    }

    /**
     * Build player list for broadcast, including disconnected status
     * @param {Object} game - Game instance
     * @returns {Array} Player list for client consumption
     */
    _getPlayerListForBroadcast(game) {
        return Array.from(game.players.values()).map(p => ({
            id: p.id,
            name: p.name,
            disconnected: p.disconnected || false
        }));
    }

    /**
   * Handle host disconnection
   * @param {Object} game - Game instance
   * @param {Object} io - Socket.IO instance
   */
    handleHostDisconnect(game, io) {
        this.logger.info(`Host disconnected from game ${game.pin}`);

        // End any active question
        game.endQuestion();

        // Save results if game was in progress
        if (game.gameState === 'question' || game.gameState === 'finished') {
            game.endTime = new Date().toISOString();
            game.saveResults();
        }

        // Notify all players that game ended
        io.to(`game-${game.pin}`).emit('game-ended', {
            reason: 'Host disconnected'
        });

        // Clear any pending disconnect grace period timers for this game's players
        for (const player of game.players.values()) {
            if (player.sessionToken && this.disconnectTimers.has(player.sessionToken)) {
                clearTimeout(this.disconnectTimers.get(player.sessionToken));
                this.disconnectTimers.delete(player.sessionToken);
            }
        }

        // Clean up player references from global registry
        for (const playerId of game.players.keys()) {
            this.players.delete(playerId);
            this.logger.debug(`Removed player ${playerId} from global registry (host disconnect)`);
        }

        // Clean up game resources
        game.cleanup();
    }

    /**
     * Handle player name change while in lobby
     * @param {string} socketId - Socket ID of the player
     * @param {string} newName - New player name
     * @param {Object} game - Game instance
     * @param {Object} socket - Socket instance
     * @param {Object} io - Socket.IO instance
     * @returns {Object} Result object with success status
     */
    handlePlayerNameChange(socketId, newName, game, socket, io) {
        // Validate input
        if (!newName || typeof newName !== 'string') {
            return { success: false, error: 'Name is required', messageKey: 'error_name_required' };
        }

        const trimmedName = newName.trim();

        // Validate name length
        if (trimmedName.length === 0 || trimmedName.length > this.config.LIMITS.MAX_PLAYER_NAME_LENGTH) {
            return {
                success: false,
                error: `Name must be 1-${this.config.LIMITS.MAX_PLAYER_NAME_LENGTH} characters`,
                messageKey: 'error_name_length'
            };
        }

        // Validate name content - allow alphanumeric, spaces, and common special chars
        if (!/^[\p{L}\p{N}\s\-_'.!?]+$/u.test(trimmedName)) {
            return { success: false, error: 'Name contains invalid characters', messageKey: 'error_name_invalid_chars' };
        }

        // Check if game exists
        if (!game) {
            return { success: false, error: 'Game not found', messageKey: 'error_game_not_found' };
        }

        // Check if game is still in lobby
        if (game.gameState !== 'lobby') {
            return { success: false, error: 'Cannot change name after game has started', messageKey: 'error_name_change_started' };
        }

        // Get current player data from registry
        const playerData = this.players.get(socketId);
        if (!playerData) {
            return { success: false, error: 'Player not found', messageKey: 'error_player_not_found' };
        }

        const oldName = playerData.name;

        // Check if name is the same
        if (oldName === trimmedName) {
            return { success: true, oldName, newName: trimmedName };
        }

        // Check for duplicate names in the same game
        const duplicatePlayer = Array.from(game.players.values()).find(
            p => p.name.toLowerCase() === trimmedName.toLowerCase() && p.id !== socketId
        );
        if (duplicatePlayer) {
            return { success: false, error: 'Name is already taken', messageKey: 'error_name_already_taken' };
        }

        // Update player name in game's players Map
        const gamePlayer = game.players.get(socketId);
        if (gamePlayer) {
            gamePlayer.name = trimmedName;
        }

        // Update in global player registry
        playerData.name = trimmedName;

        // Get updated player list
        const currentPlayers = Array.from(game.players.values()).map(p => ({
            id: p.id,
            name: p.name
        }));

        // Emit success to the player who changed their name
        socket.emit('name-changed', {
            success: true,
            oldName: oldName,
            newName: trimmedName
        });

        // Broadcast updated player list to all players in the game
        io.to(`game-${playerData.gamePin}`).emit('player-list-update', {
            players: currentPlayers
        });

        this.logger.info(`Player changed name from "${oldName}" to "${trimmedName}" in game ${playerData.gamePin}`);

        return { success: true, oldName, newName: trimmedName };
    }

    /**
   * Get player data by socket ID
   * @param {string} socketId - Socket ID
   * @returns {Object|undefined} Player data or undefined
   */
    getPlayer(socketId) {
        return this.players.get(socketId);
    }

    /**
   * Get all players
   * @returns {Map} All players
   */
    getAllPlayers() {
        return this.players;
    }

    /**
   * Remove player from registry
   * @param {string} socketId - Socket ID
   */
    removePlayer(socketId) {
        this.players.delete(socketId);
    }

    /**
   * Get player count for a game
   * @param {Object} game - Game instance
   * @returns {number} Number of players
   */
    getPlayerCount(game) {
        return game.players.size;
    }

    /**
   * Get player list for a game
   * @param {Object} game - Game instance
   * @returns {Array} Array of player objects
   */
    getPlayerList(game) {
        return Array.from(game.players.values()).map(p => ({
            id: p.id,
            name: p.name,
            score: p.score
        }));
    }
}

module.exports = { PlayerManagementService };
