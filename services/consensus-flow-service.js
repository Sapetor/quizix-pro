/**
 * ConsensusFlowService
 *
 * Handles the consensus mode game flow including:
 * - Proposal submission and distribution updates
 * - Consensus detection and team scoring
 * - Discussion/quick response management
 * - Proposal history for results
 */

const QUICK_RESPONSE_TYPES = {
    propose: 'I think it\'s {answer}',
    agree: 'I agree with {player}',
    unsure: 'I\'m not sure',
    discuss: 'Let\'s discuss',
    ready: 'Ready to lock in'
};

class ConsensusFlowService {
    constructor(logger, gameSessionService) {
        this.logger = logger;
        this.gameSessionService = gameSessionService;
    }

    /**
     * Handle a player's proposal submission
     * @param {string} playerId - Player's socket ID
     * @param {number} answer - Proposed answer index
     * @param {Object} game - Game instance
     * @param {Object} socket - Player's socket
     * @param {Object} io - Socket.IO instance
     * @returns {Object} Result of proposal submission
     */
    handleProposalSubmission(playerId, answer, game, socket, io) {
        if (!game || !game.isConsensusMode) {
            return { success: false, error: 'Not in consensus mode', messageKey: 'consensus_not_active' };
        }

        if (game.gameState !== 'question') {
            return { success: false, error: 'No active question', messageKey: 'consensus_no_question' };
        }

        if (game.consensusLocked) {
            return { success: false, error: 'Consensus already locked', messageKey: 'consensus_already_locked' };
        }

        // Validate answer index
        const question = game.quiz.questions[game.currentQuestion];
        if (!question || !question.options || answer < 0 || answer >= question.options.length) {
            return { success: false, error: 'Invalid answer', messageKey: 'consensus_invalid_answer' };
        }

        // Submit proposal
        const distribution = game.submitProposal(playerId, answer);

        if (!distribution) {
            return { success: false, error: 'Failed to submit proposal', messageKey: 'consensus_failed_propose' };
        }

        // Broadcast updated distribution to all players in the game
        io.to(`game-${game.pin}`).emit('proposal-update', distribution);

        // Check if consensus threshold has been reached
        const consensus = game.checkConsensus();
        if (consensus && consensus.reached) {
            // Notify players that consensus threshold has been met
            io.to(`game-${game.pin}`).emit('consensus-threshold-met', {
                answer: consensus.answer,
                percentage: consensus.percentage,
                threshold: game.consensusConfig.threshold
            });
        }

        this.logger.debug(`Player ${playerId} proposed answer ${answer} in game ${game.pin}`);

        return { success: true, distribution };
    }

    /**
     * Handle quick response from a player
     * @param {string} playerId - Player's socket ID
     * @param {string} type - Quick response type
     * @param {string} targetPlayer - Optional target player name
     * @param {Object} game - Game instance
     * @param {Object} socket - Player's socket
     * @param {Object} io - Socket.IO instance
     * @returns {Object} Result
     */
    handleQuickResponse(playerId, type, targetPlayer, game, socket, io) {
        if (!game || !game.isConsensusMode) {
            return { success: false, error: 'Not in consensus mode', messageKey: 'consensus_not_active' };
        }

        if (!QUICK_RESPONSE_TYPES[type]) {
            return { success: false, error: 'Invalid response type', messageKey: 'consensus_invalid_response' };
        }

        const message = game.addDiscussionMessage(playerId, 'quick', type, targetPlayer);

        if (!message) {
            return { success: false, error: 'Player not found', messageKey: 'error_player_not_found' };
        }

        // Broadcast to all players
        io.to(`game-${game.pin}`).emit('quick-response', message);

        this.logger.debug(`Player ${playerId} sent quick response: ${type}`);

        return { success: true, message };
    }

    /**
     * Handle chat message from a player
     * @param {string} playerId - Player's socket ID
     * @param {string} text - Message text
     * @param {Object} game - Game instance
     * @param {Object} socket - Player's socket
     * @param {Object} io - Socket.IO instance
     * @returns {Object} Result
     */
    handleChatMessage(playerId, text, game, socket, io) {
        if (!game || !game.isConsensusMode) {
            return { success: false, error: 'Not in consensus mode', messageKey: 'consensus_not_active' };
        }

        if (!game.consensusConfig.allowChat) {
            return { success: false, error: 'Chat is disabled', messageKey: 'consensus_chat_disabled' };
        }

        // Basic text sanitization
        const sanitizedText = text
            .trim()
            .slice(0, 200)
            .replace(/[<>]/g, '');

        if (!sanitizedText) {
            return { success: false, error: 'Empty message', messageKey: 'consensus_empty_message' };
        }

        const message = game.addDiscussionMessage(playerId, 'chat', sanitizedText);

        if (!message) {
            return { success: false, error: 'Player not found', messageKey: 'error_player_not_found' };
        }

        // Broadcast to all players
        io.to(`game-${game.pin}`).emit('chat-message', message);

        this.logger.debug(`Player ${playerId} sent chat message in game ${game.pin}`);

        return { success: true, message };
    }

    /**
     * Lock consensus (host only or auto when threshold met)
     * @param {Object} game - Game instance
     * @param {Object} io - Socket.IO instance
     * @returns {Object} Lock result with team score
     */
    lockConsensus(game, io) {
        if (!game || !game.isConsensusMode) {
            return { success: false, error: 'Not in consensus mode', messageKey: 'consensus_not_active' };
        }

        const result = game.lockConsensus();

        if (!result) {
            return { success: false, error: 'Failed to lock consensus', messageKey: 'consensus_failed_lock' };
        }

        // Broadcast consensus result
        io.to(`game-${game.pin}`).emit('consensus-reached', result);

        // Also send team score update
        io.to(`game-${game.pin}`).emit('team-score-update', {
            teamScore: game.teamScore,
            questionPoints: result.teamPoints,
            isCorrect: result.isCorrect
        });

        this.logger.info(`Consensus locked in game ${game.pin}: answer=${result.answer}, correct=${result.isCorrect}, points=${result.teamPoints}`);

        return { success: true, result };
    }

    /**
     * Called when a new question starts - resets consensus state
     * @param {Object} game - Game instance
     */
    resetForNewQuestion(game) {
        if (!game || !game.isConsensusMode) return;

        game.resetConsensusForQuestion();

        this.logger.debug(`Consensus reset for new question in game ${game.pin}`);
    }

    /**
     * Get consensus data for results
     * @param {Object} game - Game instance
     * @returns {Object} Consensus results data
     */
    getConsensusResultsData(game) {
        if (!game || !game.isConsensusMode) {
            return null;
        }

        return {
            gameMode: 'consensus',
            teamScore: game.teamScore,
            consensusConfig: game.consensusConfig
        };
    }

    /**
     * Get quick response types for client
     * @returns {Object} Quick response type definitions
     */
    static getQuickResponseTypes() {
        return QUICK_RESPONSE_TYPES;
    }
}

module.exports = { ConsensusFlowService };
