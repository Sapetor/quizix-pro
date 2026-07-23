/**
 * Unit tests for socket/consensus-events.js
 *
 * Exercises propose-answer, send-quick-response, send-chat-message,
 * lock-consensus. Validation is REAL; consensus/game/player services are mocks.
 */

const { registerConsensusEvents } = require('../../socket/consensus-events');
const { createFakeSocket, createFakeIo, createOptions } = require('./helpers/socket-fakes');

function setup(overrides = {}) {
    const socket = createFakeSocket('player-sock');
    const io = createFakeIo();
    const options = createOptions(overrides);
    registerConsensusEvents(io, socket, options);
    return { socket, io, options, h: socket.handlers };
}

const findEmit = (list, event) => list.find(e => e.event === event);

function wirePlayerAndGame(options, game = { pin: '123456', isConsensusMode: true }) {
    options.playerManagementService.getPlayer.mockReturnValue({ name: 'Al', gamePin: '123456' });
    options.gameSessionService.getGame.mockReturnValue(game);
    return game;
}

describe('consensus-events: propose-answer', () => {
    it('forwards a valid proposal to the consensus service', () => {
        const { socket, io, options, h } = setup();
        const game = wirePlayerAndGame(options);

        h['propose-answer']({ answer: 2 });

        expect(options.consensusFlowService.handleProposalSubmission).toHaveBeenCalledWith('player-sock', 2, game, socket, io);
    });

    it('rejects an invalid payload (negative answer) without calling the service', () => {
        const { socket, options, h } = setup();
        h['propose-answer']({ answer: -1 });
        expect(findEmit(socket.emits, 'error')).toBeTruthy();
        expect(options.consensusFlowService.handleProposalSubmission).not.toHaveBeenCalled();
    });

    it('errors when the player is not found', () => {
        const { socket, options, h } = setup();
        options.playerManagementService.getPlayer.mockReturnValue(null);
        h['propose-answer']({ answer: 0 });
        expect(findEmit(socket.emits, 'error').data.messageKey).toBe('error_player_not_found');
    });

    it('errors when the game is not found', () => {
        const { socket, options, h } = setup();
        options.playerManagementService.getPlayer.mockReturnValue({ gamePin: '123456' });
        options.gameSessionService.getGame.mockReturnValue(null);
        h['propose-answer']({ answer: 0 });
        expect(findEmit(socket.emits, 'error').data.messageKey).toBe('error_game_not_found');
    });

    it('surfaces a service failure as an error emit', () => {
        const { socket, options, h } = setup();
        wirePlayerAndGame(options);
        options.consensusFlowService.handleProposalSubmission.mockReturnValue({ success: false, error: 'nope', messageKey: 'consensus_bad' });
        h['propose-answer']({ answer: 0 });
        expect(findEmit(socket.emits, 'error').data.messageKey).toBe('consensus_bad');
    });
});

describe('consensus-events: send-quick-response', () => {
    it('forwards a valid response with a null target by default', () => {
        const { socket, io, options, h } = setup();
        const game = wirePlayerAndGame(options);

        h['send-quick-response']({ type: 'agree' });

        expect(options.consensusFlowService.handleQuickResponse).toHaveBeenCalledWith('player-sock', 'agree', null, game, socket, io);
    });

    it('passes through an explicit targetPlayer', () => {
        const { options, h } = setup();
        wirePlayerAndGame(options);
        h['send-quick-response']({ type: 'discuss', targetPlayer: 'p2' });
        expect(options.consensusFlowService.handleQuickResponse).toHaveBeenCalledWith('player-sock', 'discuss', 'p2', expect.anything(), expect.anything(), expect.anything());
    });

    it('rejects an invalid response type', () => {
        const { socket, options, h } = setup();
        h['send-quick-response']({ type: 'shout' });
        expect(findEmit(socket.emits, 'error')).toBeTruthy();
        expect(options.consensusFlowService.handleQuickResponse).not.toHaveBeenCalled();
    });
});

describe('consensus-events: send-chat-message', () => {
    it('forwards a valid chat message', () => {
        const { socket, io, options, h } = setup();
        const game = wirePlayerAndGame(options);

        h['send-chat-message']({ text: 'hello team' });

        expect(options.consensusFlowService.handleChatMessage).toHaveBeenCalledWith('player-sock', 'hello team', game, socket, io);
    });

    it('rejects an empty message', () => {
        const { socket, options, h } = setup();
        h['send-chat-message']({ text: '' });
        expect(findEmit(socket.emits, 'error')).toBeTruthy();
        expect(options.consensusFlowService.handleChatMessage).not.toHaveBeenCalled();
    });

    it('rejects an over-length message (>200 chars)', () => {
        const { socket, options, h } = setup();
        h['send-chat-message']({ text: 'x'.repeat(201) });
        expect(findEmit(socket.emits, 'error')).toBeTruthy();
        expect(options.consensusFlowService.handleChatMessage).not.toHaveBeenCalled();
    });
});

describe('consensus-events: lock-consensus', () => {
    it('locks consensus for a host in consensus mode', () => {
        const game = { pin: '123456', isConsensusMode: true };
        const { io, options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(game);

        h['lock-consensus']();

        expect(options.consensusFlowService.lockConsensus).toHaveBeenCalledWith(game, io);
    });

    it('rejects a non-host (no hosted game)', () => {
        const { socket, options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(null);
        h['lock-consensus']();
        expect(findEmit(socket.emits, 'error').data.messageKey).toBe('consensus_host_only_lock');
        expect(options.consensusFlowService.lockConsensus).not.toHaveBeenCalled();
    });

    it('rejects when the game is not in consensus mode', () => {
        const { socket, options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue({ pin: '1', isConsensusMode: false });
        h['lock-consensus']();
        expect(findEmit(socket.emits, 'error').data.messageKey).toBe('consensus_not_active');
        expect(options.consensusFlowService.lockConsensus).not.toHaveBeenCalled();
    });

    it('surfaces a lock failure as an error emit', () => {
        const { socket, options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue({ pin: '1', isConsensusMode: true });
        options.consensusFlowService.lockConsensus.mockReturnValue({ success: false, error: 'busy' });
        h['lock-consensus']();
        expect(findEmit(socket.emits, 'error').data.messageKey).toBe('consensus_failed_lock');
    });
});
