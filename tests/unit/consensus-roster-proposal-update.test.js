/**
 * Consensus proposal distribution after roster changes.
 *
 * getProposalDistribution() depends on game.players (totalPlayers,
 * consensusPercent, the names per answer), but only a new proposal emitted
 * proposal-update. A leave, a grace-period removal or a rejoin left the bars
 * showing the old numbers until the next proposal. A rejoin also left the
 * proposal under the old socket id, so the name dropped out of the bars and a
 * second proposal from the rejoined player was counted twice.
 *
 * Real Game and PlayerManagementService; fake sockets and io.
 */

const { Game } = require('../../services/game');
const { PlayerManagementService } = require('../../services/player-management-service');
const { createFakeSocket, createFakeIo, createFakeLogger } = require('./helpers/socket-fakes');

const CONFIG = { LIMITS: { MAX_PLAYER_NAME_LENGTH: 20 }, SCORING: { BASE_POINTS: 100 } };

function setup({ consensusMode = true } = {}) {
    jest.useFakeTimers();
    const logger = createFakeLogger();
    const pms = new PlayerManagementService(logger, CONFIG);
    const io = createFakeIo();
    const game = new Game('host-sock', {
        title: 'T',
        consensusMode,
        questions: [{ type: 'multiple-choice', question: 'Q1', options: ['A', 'B', 'C', 'D'], correctAnswer: 1, timeLimit: 20 }]
    }, logger, CONFIG, { MAX_PLAYERS_PER_GAME: 50 });
    game.pin = '123456';
    const join = (id, name) => {
        const socket = createFakeSocket(id);
        io.sockets.sockets.set(id, socket);
        pms.handlePlayerJoin(id, game.pin, name, game, socket, io);
        return socket;
    };
    join('p1', 'Al');
    join('p2', 'Bo');
    join('p3', 'Cy');
    game.gameState = 'question';
    game.currentQuestion = 0;
    game.submitProposal('p1', 1);
    game.submitProposal('p2', 1);
    io.toEmits.length = 0;
    return { pms, io, game, join };
}

const proposalUpdates = (io) => io.toEmits.filter(e => e.event === 'proposal-update' && e.room === 'game-123456');

afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
});

describe('proposal-update on roster changes in consensus mode', () => {
    it('is emitted when a player leaves during a question', () => {
        const { pms, io, game } = setup();
        pms.handlePlayerDisconnect('p3', game, io, true);

        const updates = proposalUpdates(io);
        expect(updates).toHaveLength(1);
        expect(updates[0].data.totalPlayers).toBe(2);
        expect(updates[0].data.consensusPercent).toBe(100);
    });

    it('is emitted when a disconnected player is removed after the grace period', () => {
        const { pms, io, game } = setup();
        pms.handlePlayerDisconnect('p3', game, io, false);
        io.toEmits.length = 0;

        jest.advanceTimersByTime(2 * 60 * 1000);

        const updates = proposalUpdates(io);
        expect(updates).toHaveLength(1);
        expect(updates[0].data.totalPlayers).toBe(2);
    });

    it('moves the proposal to the new socket and emits on rejoin', () => {
        const { pms, io, game } = setup();
        const token = game.players.get('p1').sessionToken;
        pms.handlePlayerDisconnect('p1', game, io, false);
        io.toEmits.length = 0;

        const s = createFakeSocket('p1-new');
        const result = pms.handlePlayerRejoin('p1-new', game.pin, token, game, s, io, null);
        expect(result.success).toBe(true);

        const updates = proposalUpdates(io);
        expect(updates).toHaveLength(1);
        expect(updates[0].data.proposals['1'].players).toEqual(expect.arrayContaining(['Al', 'Bo']));

        // A second proposal from the rejoined player replaces, not adds
        const dist = game.submitProposal('p1-new', 1);
        expect(dist.totalProposals).toBe(2);
    });

    it('is not emitted outside consensus mode or outside a question', () => {
        const plain = setup({ consensusMode: false });
        plain.pms.handlePlayerDisconnect('p3', plain.game, plain.io, true);
        expect(proposalUpdates(plain.io)).toHaveLength(0);
        jest.clearAllTimers();

        const reveal = setup();
        reveal.game.gameState = 'revealing';
        reveal.pms.handlePlayerDisconnect('p3', reveal.game, reveal.io, true);
        expect(proposalUpdates(reveal.io)).toHaveLength(0);
    });
});
