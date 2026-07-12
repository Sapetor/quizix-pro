/**
 * Consensus mode event handlers
 * Handles: propose-answer, send-quick-response, send-chat-message, lock-consensus
 */

const { validateAndHandle } = require('../services/validation-schemas');

function registerConsensusEvents(io, socket, options) {
    const { gameSessionService, playerManagementService, consensusFlowService, checkRateLimit, logger } = options;

    // Handle proposal submission (consensus mode)
    socket.on('propose-answer', (data) => {
        if (!checkRateLimit(socket.id, 'propose-answer', 5, socket)) return;
        try {
            const validated = validateAndHandle(socket, 'propose-answer', data, logger);
            if (!validated) return;

            const playerData = playerManagementService.getPlayer(socket.id);
            if (!playerData) {
                socket.emit('error', { message: 'Player not found', messageKey: 'error_player_not_found' });
                return;
            }

            const game = gameSessionService.getGame(playerData.gamePin);
            if (!game) {
                socket.emit('error', { message: 'Game not found', messageKey: 'error_game_not_found' });
                return;
            }

            const result = consensusFlowService.handleProposalSubmission(
                socket.id,
                validated.answer,
                game,
                socket,
                io
            );

            if (!result.success) {
                socket.emit('error', { message: result.error, messageKey: result.messageKey || 'consensus_failed_propose' });
            }
        } catch (error) {
            logger.error('Error in propose-answer handler:', error);
            socket.emit('error', { message: 'Failed to submit proposal', messageKey: 'consensus_failed_propose' });
        }
    });

    // Handle quick response (consensus mode discussion)
    socket.on('send-quick-response', (data) => {
        if (!checkRateLimit(socket.id, 'send-quick-response', 10, socket)) return;
        try {
            const validated = validateAndHandle(socket, 'send-quick-response', data, logger);
            if (!validated) return;

            const playerData = playerManagementService.getPlayer(socket.id);
            if (!playerData) {
                socket.emit('error', { message: 'Player not found', messageKey: 'error_player_not_found' });
                return;
            }

            const game = gameSessionService.getGame(playerData.gamePin);
            if (!game) {
                socket.emit('error', { message: 'Game not found', messageKey: 'error_game_not_found' });
                return;
            }

            const result = consensusFlowService.handleQuickResponse(
                socket.id,
                validated.type,
                validated.targetPlayer || null,
                game,
                socket,
                io
            );

            if (!result.success) {
                socket.emit('error', { message: result.error, messageKey: result.messageKey || 'consensus_invalid_response' });
            }
        } catch (error) {
            logger.error('Error in send-quick-response handler:', error);
            socket.emit('error', { message: 'Failed to send quick response', messageKey: 'consensus_invalid_response' });
        }
    });

    // Handle chat message (consensus mode, if enabled)
    socket.on('send-chat-message', (data) => {
        if (!checkRateLimit(socket.id, 'send-chat-message', 5, socket)) return;
        try {
            const validated = validateAndHandle(socket, 'send-chat-message', data, logger);
            if (!validated) return;

            const playerData = playerManagementService.getPlayer(socket.id);
            if (!playerData) {
                socket.emit('error', { message: 'Player not found', messageKey: 'error_player_not_found' });
                return;
            }

            const game = gameSessionService.getGame(playerData.gamePin);
            if (!game) {
                socket.emit('error', { message: 'Game not found', messageKey: 'error_game_not_found' });
                return;
            }

            const result = consensusFlowService.handleChatMessage(
                socket.id,
                validated.text,
                game,
                socket,
                io
            );

            if (!result.success) {
                socket.emit('error', { message: result.error, messageKey: result.messageKey || 'consensus_failed_chat' });
            }
        } catch (error) {
            logger.error('Error in send-chat-message handler:', error);
            socket.emit('error', { message: 'Failed to send chat message', messageKey: 'consensus_failed_chat' });
        }
    });

    // Handle consensus lock (host only)
    socket.on('lock-consensus', () => {
        if (!checkRateLimit(socket.id, 'lock-consensus', 3, socket)) return;
        try {
            const game = gameSessionService.findGameByHost(socket.id);
            if (!game) {
                socket.emit('error', { message: 'Only host can lock consensus', messageKey: 'consensus_host_only_lock' });
                return;
            }

            if (!game.isConsensusMode) {
                socket.emit('error', { message: 'Not in consensus mode', messageKey: 'consensus_not_active' });
                return;
            }

            const result = consensusFlowService.lockConsensus(game, io);

            if (!result.success) {
                socket.emit('error', { message: result.error, messageKey: result.messageKey || 'consensus_failed_lock' });
            }
        } catch (error) {
            logger.error('Error in lock-consensus handler:', error);
            socket.emit('error', { message: 'Failed to lock consensus', messageKey: 'consensus_failed_lock' });
        }
    });
}

module.exports = { registerConsensusEvents };
