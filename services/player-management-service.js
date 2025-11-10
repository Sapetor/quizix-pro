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
        error: 'PIN and name are required'
      };
    }

    // Validate name length
    if (name.length > this.config.LIMITS.MAX_PLAYER_NAME_LENGTH || name.trim().length === 0) {
      return {
        success: false,
        error: `Name must be 1-${this.config.LIMITS.MAX_PLAYER_NAME_LENGTH} characters`
      };
    }

    // Check if game exists
    if (!game) {
      return {
        success: false,
        error: 'Game not found'
      };
    }

    // Check if game is still in lobby
    if (game.gameState !== 'lobby') {
      return {
        success: false,
        error: 'Game already started'
      };
    }

    // Add player to game
    game.addPlayer(socketId, name);
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

      // Broadcast updated player list
      io.to(`game-${playerData.gamePin}`).emit('player-list-update', {
        players: Array.from(game.players.values()).map(p => ({
          id: p.id,
          name: p.name
        }))
      });

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
