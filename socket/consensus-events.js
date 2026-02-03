/**
 * Consensus mode event handlers
 * Handles: propose-answer, send-quick-response, send-chat-message, lock-consensus
 */

function registerConsensusEvents(io, socket, options) {
    const { gameSessionService, playerManagementService, consensusFlowService, checkRateLimit, logger } = options;

    // Handle proposal submission (consensus mode)
    socket.on('propose-answer', (data) => {
        if (!checkRateLimit(socket.id, 'propose-answer', 5, socket)) return;
        try {
            if (!data || data.answer === undefined) {
                socket.emit('error', { message: 'Invalid proposal data' });
                return;
            }

            const playerData = playerManagementService.getPlayer(socket.id);
            if (!playerData) {
                socket.emit('error', { message: 'Player not found' });
                return;
            }

            const game = gameSessionService.getGame(playerData.gamePin);
            if (!game) {
                socket.emit('error', { message: 'Game not found' });
                return;
            }

            const result = consensusFlowService.handleProposalSubmission(
                socket.id,
                data.answer,
                game,
                socket,
                io
            );

            if (!result.success) {
                socket.emit('error', { message: result.error });
            }
        } catch (error) {
            logger.error('Error in propose-answer handler:', error);
            socket.emit('error', { message: 'Failed to submit proposal' });
        }
    });

    // Handle quick response (consensus mode discussion)
    socket.on('send-quick-response', (data) => {
        if (!checkRateLimit(socket.id, 'send-quick-response', 10, socket)) return;
        try {
            if (!data || !data.type) {
                socket.emit('error', { message: 'Invalid quick response data' });
                return;
            }

            const playerData = playerManagementService.getPlayer(socket.id);
            if (!playerData) {
                socket.emit('error', { message: 'Player not found' });
                return;
            }

            const game = gameSessionService.getGame(playerData.gamePin);
            if (!game) {
                socket.emit('error', { message: 'Game not found' });
                return;
            }

            const result = consensusFlowService.handleQuickResponse(
                socket.id,
                data.type,
                data.targetPlayer || null,
                game,
                socket,
                io
            );

            if (!result.success) {
                socket.emit('error', { message: result.error });
            }
        } catch (error) {
            logger.error('Error in send-quick-response handler:', error);
            socket.emit('error', { message: 'Failed to send quick response' });
        }
    });

    // Handle chat message (consensus mode, if enabled)
    socket.on('send-chat-message', (data) => {
        if (!checkRateLimit(socket.id, 'send-chat-message', 5, socket)) return;
        try {
            if (!data || !data.text) {
                socket.emit('error', { message: 'Invalid chat message' });
                return;
            }

            const playerData = playerManagementService.getPlayer(socket.id);
            if (!playerData) {
                socket.emit('error', { message: 'Player not found' });
                return;
            }

            const game = gameSessionService.getGame(playerData.gamePin);
            if (!game) {
                socket.emit('error', { message: 'Game not found' });
                return;
            }

            const result = consensusFlowService.handleChatMessage(
                socket.id,
                data.text,
                game,
                socket,
                io
            );

            if (!result.success) {
                socket.emit('error', { message: result.error });
            }
        } catch (error) {
            logger.error('Error in send-chat-message handler:', error);
            socket.emit('error', { message: 'Failed to send chat message' });
        }
    });

    // Handle consensus lock (host only)
    socket.on('lock-consensus', () => {
        if (!checkRateLimit(socket.id, 'lock-consensus', 3, socket)) return;
        try {
            const game = gameSessionService.findGameByHost(socket.id);
            if (!game) {
                socket.emit('error', { message: 'Only host can lock consensus' });
                return;
            }

            if (!game.isConsensusMode) {
                socket.emit('error', { message: 'Not in consensus mode' });
                return;
            }

            const result = consensusFlowService.lockConsensus(game, io);

            if (!result.success) {
                socket.emit('error', { message: result.error });
            }
        } catch (error) {
            logger.error('Error in lock-consensus handler:', error);
            socket.emit('error', { message: 'Failed to lock consensus' });
        }
    });
}

module.exports = { registerConsensusEvents };
