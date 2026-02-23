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
        this.players.set(socketId, { gamePin: pin, name });

        // Join socket room
        socket.join(`game-${pin}`);

        // Get current player list
        const currentPlayers = Array.from(game.players.values()).map(p => ({
            id: p.id,
            name: p.name
        }));

        // Emit success to joining player
        socket.emit('player-joined', {
            gamePin: pin,
            playerName: name,
            players: currentPlayers
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
    handlePlayerDisconnect(socketId, game, io) {
        const playerData = this.players.get(socketId);

        if (playerData && game) {
            game.removePlayer(socketId);

            const currentPlayers = Array.from(game.players.values()).map(p => ({
                id: p.id,
                name: p.name
            }));

            // Broadcast updated player list
            io.to(`game-${playerData.gamePin}`).emit('player-list-update', {
                players: currentPlayers
            });

            // Emit player-disconnected event for audio feedback
            io.to(`game-${playerData.gamePin}`).emit('player-disconnected', {
                playerName: playerData.name,
                players: currentPlayers
            });

            // Update live answer count if game is in question state
            if (game.gameState === 'question' && game.hostId) {
                const totalPlayers = game.players.size;
                const answeredPlayers = Array.from(game.players.values())
                    .filter(player => player.answers && player.answers[game.currentQuestion]).length;

                io.to(game.hostId).emit('answer-count-update', {
                    answeredPlayers: answeredPlayers,
                    totalPlayers: totalPlayers
                });
            }

            this.logger.info(`Player ${playerData.name} disconnected from game ${playerData.gamePin}`);
        }

        // Remove from global player registry
        this.players.delete(socketId);
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

        // Clean up player references from global registry
        const playersToRemove = [];
        game.players.forEach((player, playerId) => {
            playersToRemove.push(playerId);
        });

        playersToRemove.forEach(playerId => {
            this.players.delete(playerId);
            this.logger.debug(`Removed player ${playerId} from global registry (host disconnect)`);
        });

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
