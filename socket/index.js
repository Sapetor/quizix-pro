/**
 * Socket.IO event handler registration
 * Combines all event handler modules into a single registration function
 */

const { registerGameEvents } = require('./game-events');
const { registerPlayerEvents } = require('./player-events');
const { registerGameplayEvents } = require('./gameplay-events');
const { registerConsensusEvents } = require('./consensus-events');

/**
 * Register all Socket.IO event handlers for a socket connection
 * @param {SocketIO.Server} io - Socket.IO server instance
 * @param {SocketIO.Socket} socket - Individual socket connection
 * @param {Object} options - Dependencies and configuration
 * @param {Object} options.gameSessionService - Game session management service
 * @param {Object} options.playerManagementService - Player management service
 * @param {Object} options.questionFlowService - Question flow service
 * @param {Object} options.consensusFlowService - Consensus flow service
 * @param {Object} options.socketBatchService - Socket batch service
 * @param {Function} options.checkRateLimit - Rate limiting function
 * @param {Object} options.logger - Logger instance
 * @param {Object} options.CONFIG - Configuration constants
 */
function registerSocketHandlers(io, socket, options) {
    registerGameEvents(io, socket, options);
    registerPlayerEvents(io, socket, options);
    registerGameplayEvents(io, socket, options);
    registerConsensusEvents(io, socket, options);
}

module.exports = { registerSocketHandlers };
