/**
 * Unit tests for socket/player-events.js
 *
 * Exercises player-join, player-change-name (handler wiring only — schema
 * itself is covered by player-events-validation.test.js), player-rejoin,
 * leave-game, host-rejoin, session-check, leave-session, release-session,
 * request-time-sync, and disconnect. Validation is REAL; services are mocks.
 */

const { registerPlayerEvents } = require('../../socket/player-events');
const { createFakeSocket, createFakeIo, createOptions } = require('./helpers/socket-fakes');

const UUID_A = '00000000-0000-4000-8000-000000000001';
const UUID_B = '00000000-0000-4000-8000-000000000002';

function setup(overrides = {}) {
    const socket = createFakeSocket('player-sock');
    const io = createFakeIo();
    const options = createOptions(overrides);
    registerPlayerEvents(io, socket, options);
    return { socket, io, options, h: socket.handlers };
}

const findEmit = (list, event) => list.find(e => e.event === event);

describe('player-events: player-join', () => {
    it('forwards a valid join to the player service', () => {
        const game = { pin: '123456' };
        const { socket, io, options, h } = setup();
        options.gameSessionService.getGame.mockReturnValue(game);

        h['player-join']({ pin: '123456', name: 'Al' });

        expect(options.playerManagementService.handlePlayerJoin).toHaveBeenCalledWith(
            'player-sock', '123456', 'Al', game, socket, io, undefined
        );
        expect(findEmit(socket.emits, 'error')).toBeFalsy();
    });

    it('emits an error when the join fails', () => {
        const { socket, options, h } = setup();
        options.gameSessionService.getGame.mockReturnValue({ pin: '123456' });
        options.playerManagementService.handlePlayerJoin.mockReturnValue({ success: false, error: 'full', messageKey: 'error_game_full' });

        h['player-join']({ pin: '123456', name: 'Al' });

        expect(findEmit(socket.emits, 'error').data.messageKey).toBe('error_game_full');
    });

    it('rejects a malformed PIN via validateAndHandle', () => {
        const { socket, options, h } = setup();
        h['player-join']({ pin: 'abc', name: 'Al' });
        expect(findEmit(socket.emits, 'error')).toBeTruthy();
        expect(options.playerManagementService.handlePlayerJoin).not.toHaveBeenCalled();
    });
});

describe('player-events: player-change-name (handler wiring)', () => {
    it('forwards a valid name change to the player service', () => {
        const game = { pin: '123456' };
        const { socket, io, options, h } = setup();
        options.playerManagementService.getPlayer.mockReturnValue({ gamePin: '123456' });
        options.gameSessionService.getGame.mockReturnValue(game);

        h['player-change-name']({ newName: 'Bob' });

        expect(options.playerManagementService.handlePlayerNameChange).toHaveBeenCalledWith('player-sock', 'Bob', game, socket, io);
    });

    it('errors when the player is not found', () => {
        const { socket, options, h } = setup();
        options.playerManagementService.getPlayer.mockReturnValue(null);
        h['player-change-name']({ newName: 'Bob' });
        expect(findEmit(socket.emits, 'error').data.messageKey).toBe('error_player_not_found');
        expect(options.playerManagementService.handlePlayerNameChange).not.toHaveBeenCalled();
    });

    it('does not call the service on an invalid payload', () => {
        const { options, h } = setup();
        h['player-change-name']({ newName: '' });
        expect(options.playerManagementService.handlePlayerNameChange).not.toHaveBeenCalled();
    });
});

describe('player-events: player-rejoin', () => {
    it('emits rejoin-failed on non-object data', () => {
        const { socket, options, h } = setup();
        h['player-rejoin'](null);
        expect(findEmit(socket.emits, 'rejoin-failed')).toBeTruthy();
        expect(options.playerManagementService.handlePlayerRejoin).not.toHaveBeenCalled();
    });

    it('forwards a valid rejoin request to the service', () => {
        const game = { pin: '123456' };
        const { options, h } = setup();
        options.gameSessionService.getGame.mockReturnValue(game);

        h['player-rejoin']({ pin: '123456', sessionToken: 'tok' });

        expect(options.playerManagementService.handlePlayerRejoin).toHaveBeenCalledWith(
            'player-sock', '123456', 'tok', game, expect.anything(), expect.anything(), options.questionFlowService
        );
    });

    it('emits rejoin-failed when the service rejects', () => {
        const { socket, options, h } = setup();
        options.gameSessionService.getGame.mockReturnValue({ pin: '123456' });
        options.playerManagementService.handlePlayerRejoin.mockReturnValue({ success: false, error: 'expired', messageKey: 'error_rejoin' });

        h['player-rejoin']({ pin: '123456', sessionToken: 'tok' });

        expect(findEmit(socket.emits, 'rejoin-failed').data.messageKey).toBe('error_rejoin');
    });
});

describe('player-events: leave-game', () => {
    it('disconnects the player intentionally', () => {
        const game = { pin: '123456' };
        const { io, options, h } = setup();
        options.playerManagementService.getPlayer.mockReturnValue({ name: 'Al', gamePin: '123456' });
        options.gameSessionService.getGame.mockReturnValue(game);

        h['leave-game']();

        expect(options.playerManagementService.handlePlayerDisconnect).toHaveBeenCalledWith('player-sock', game, io, true);
    });

    it('does nothing when the socket is not a known player', () => {
        const { options, h } = setup();
        options.playerManagementService.getPlayer.mockReturnValue(null);
        h['leave-game']();
        expect(options.playerManagementService.handlePlayerDisconnect).not.toHaveBeenCalled();
    });
});

describe('player-events: host-rejoin', () => {
    function disconnectedGame() {
        return {
            pin: '123456', hostDisconnected: true, hostDisconnectedAt: 1, hostId: 'old-host',
            hostToken: 'secret', gameState: 'question', currentQuestion: 0,
            players: new Map([['p1', { id: 'p1', name: 'Al', score: 10 }]]),
            leaderboard: [], quiz: { title: 'Q' }
        };
    }

    it('errors when pin is missing', () => {
        const { socket, h } = setup();
        h['host-rejoin']({});
        expect(findEmit(socket.emits, 'error')).toBeTruthy();
    });

    it('errors when the game is not in reconnect state', () => {
        const { socket, options, h } = setup();
        options.gameSessionService.getGame.mockReturnValue({ pin: '123456', hostDisconnected: false });
        h['host-rejoin']({ pin: '123456', token: 'secret' });
        expect(findEmit(socket.emits, 'error')).toBeTruthy();
    });

    it('rejects a wrong reconnect token', () => {
        const { socket, options, h } = setup();
        options.gameSessionService.getGame.mockReturnValue(disconnectedGame());
        h['host-rejoin']({ pin: '123456', token: 'WRONG' });
        expect(findEmit(socket.emits, 'error').data.messageKey).toBe('error_not_authorized_host');
    });

    it('restores the host and emits host-reconnected + host-rejoin-success on a valid token', () => {
        const game = disconnectedGame();
        const { socket, io, options, h } = setup();
        options.gameSessionService.getGame.mockReturnValue(game);
        options.playerManagementService.getSessionByHostSocket.mockReturnValue({ hostSocketId: 'old-host' });

        h['host-rejoin']({ pin: '123456', token: 'secret' });

        expect(game.hostDisconnected).toBe(false);
        expect(game.hostId).toBe('player-sock');
        expect(options.gameSessionService.updateHostId).toHaveBeenCalledWith('old-host', 'player-sock', '123456');
        expect(findEmit(io.toEmits, 'host-reconnected')).toBeTruthy();
        expect(findEmit(socket.emits, 'host-rejoin-success')).toBeTruthy();
    });

    // host-rejoin-success only switches screens: without a replayed
    // question-start the reconnected host sees an empty host-game-screen (no
    // question, no statistics block, no End Round) for the rest of the question.
    it('replays question-start and the live answer count when rejoining mid-question', () => {
        const game = disconnectedGame();
        game.quiz = {
            title: 'Q',
            questions: [{
                type: 'multiple-choice',
                question: 'Q1?',
                options: ['A', 'B'],
                correctAnswer: 0,
                timeLimit: 20
            }]
        };
        game.questionStartTime = Date.now();
        game.questionEndsAt = Date.now() + 12000;
        game.players = new Map([
            ['p1', { id: 'p1', name: 'Al', score: 10, answers: { 0: { answer: 0 } } }],
            ['p2', { id: 'p2', name: 'Bo', score: 0, answers: {} }],
            ['p3', { id: 'p3', name: 'Cy', score: 0, answers: {}, disconnected: true }]
        ]);
        const { socket, options, h } = setup();
        options.gameSessionService.getGame.mockReturnValue(game);

        h['host-rejoin']({ pin: '123456', token: 'secret' });

        const replay = findEmit(socket.emits, 'question-start');
        expect(replay).toBeTruthy();
        expect(replay.data).toMatchObject({
            questionNumber: 1,
            totalQuestions: 1,
            question: 'Q1?',
            type: 'multiple-choice',
            options: ['A', 'B']
        });
        expect(replay.data.remainingTimeMs).toBeGreaterThan(0);
        expect(replay.data.remainingTimeMs).toBeLessThanOrEqual(12000);

        expect(findEmit(socket.emits, 'answer-count-update').data).toEqual({
            answeredPlayers: 1,
            connectedPlayers: 2,
            totalPlayers: 3
        });
    });

    it('does not replay question-start when the game is not in a question', () => {
        const game = disconnectedGame();
        game.gameState = 'lobby';
        const { socket, options, h } = setup();
        options.gameSessionService.getGame.mockReturnValue(game);

        h['host-rejoin']({ pin: '123456', token: 'secret' });

        expect(findEmit(socket.emits, 'question-start')).toBeFalsy();
        expect(findEmit(socket.emits, 'host-rejoin-success')).toBeTruthy();
    });
});

describe('player-events: session-check', () => {
    it('emits session-invalid when the session is unknown', () => {
        const { socket, options, h } = setup();
        options.playerManagementService.hostSessions = new Map();
        h['session-check']({ deviceId: UUID_A, hostSessionId: UUID_B });
        expect(findEmit(socket.emits, 'session-invalid')).toBeTruthy();
    });

    it('joins the waiting room when there is no active game', () => {
        const registry = new Map([[UUID_A, { name: 'Al', socketId: 'old' }]]);
        const session = { playerRegistry: registry, currentGamePin: null };
        const { socket, options, h } = setup();
        options.playerManagementService.hostSessions = new Map([[UUID_B, session]]);

        h['session-check']({ deviceId: UUID_A, hostSessionId: UUID_B });

        expect(registry.get(UUID_A).socketId).toBe('player-sock');
        expect(socket.joinedRooms).toContain(`session:${UUID_B}`);
        expect(findEmit(socket.emits, 'session-waiting')).toBeTruthy();
    });

    it('auto-joins the player when an active lobby game exists', () => {
        const registry = new Map([[UUID_A, { name: 'Al', socketId: 'old' }]]);
        const session = { playerRegistry: registry, currentGamePin: '123456' };
        const game = { pin: '123456', gameState: 'lobby' };
        const { options, h } = setup();
        options.playerManagementService.hostSessions = new Map([[UUID_B, session]]);
        options.gameSessionService.getGame.mockReturnValue(game);

        h['session-check']({ deviceId: UUID_A, hostSessionId: UUID_B });

        expect(options.playerManagementService.handlePlayerJoin).toHaveBeenCalledWith(
            'player-sock', '123456', 'Al', game, expect.anything(), expect.anything(), UUID_A
        );
    });
});

describe('player-events: leave-session', () => {
    it('unregisters the device and leaves the room', () => {
        const { socket, options, h } = setup();
        h['leave-session']({ deviceId: UUID_A, hostSessionId: UUID_B });
        expect(options.playerManagementService.unregisterDevice).toHaveBeenCalledWith(UUID_A);
        expect(socket.leftRooms).toContain(`session:${UUID_B}`);
    });

    it('rejects an invalid (non-uuid) payload', () => {
        const { options, h } = setup();
        h['leave-session']({ deviceId: 'nope', hostSessionId: UUID_B });
        expect(options.playerManagementService.unregisterDevice).not.toHaveBeenCalled();
    });
});

describe('player-events: release-session', () => {
    it('rejects a caller that does not own the session', () => {
        const { socket, options, h } = setup();
        options.playerManagementService.hostSessions = new Map([[UUID_B, { hostSocketId: 'someone-else' }]]);
        h['release-session']({ hostSessionId: UUID_B });
        expect(findEmit(socket.emits, 'error')).toBeTruthy();
        expect(options.playerManagementService.destroySession).not.toHaveBeenCalled();
    });

    it('destroys the session for the owning host', () => {
        const { options, h } = setup();
        options.playerManagementService.hostSessions = new Map([[UUID_B, { hostSocketId: 'player-sock' }]]);
        h['release-session']({ hostSessionId: UUID_B });
        expect(options.playerManagementService.destroySession).toHaveBeenCalledWith(UUID_B);
    });
});

describe('player-events: request-time-sync', () => {
    it('does nothing when the socket is not a known player', () => {
        const { socket, options, h } = setup();
        options.playerManagementService.getPlayer.mockReturnValue(null);
        h['request-time-sync']();
        expect(findEmit(socket.emits, 'time-sync')).toBeFalsy();
    });

    it('emits a remaining-time sync during an active question', () => {
        const { socket, options, h } = setup();
        options.playerManagementService.getPlayer.mockReturnValue({ gamePin: '123456' });
        options.gameSessionService.getGame.mockReturnValue({
            gameState: 'question', currentQuestion: 0,
            questionStartTime: Date.now(),
            quiz: { questions: [{ timeLimit: 20 }] }
        });

        h['request-time-sync']();

        const sync = findEmit(socket.emits, 'time-sync');
        expect(sync).toBeTruthy();
        expect(sync.data.remainingMs).toBeGreaterThan(0);
    });
});

describe('player-events: disconnect', () => {
    afterEach(() => jest.useRealTimers());

    it('runs player-disconnect handling and always cleans up orphaned games', () => {
        const game = { pin: '123456' };
        const { io, options, h } = setup();
        options.playerManagementService.getPlayer.mockReturnValue({ name: 'Al', gamePin: '123456' });
        options.gameSessionService.getGame.mockReturnValue(game);
        options.gameSessionService.findGameByHost.mockReturnValue(null);

        h['disconnect']();

        expect(options.playerManagementService.handlePlayerDisconnect).toHaveBeenCalledWith('player-sock', game, io, false);
        expect(options.gameSessionService.cleanupOrphanedGames).toHaveBeenCalledWith(io);
    });

    it('starts a host grace period during an active game', () => {
        jest.useFakeTimers();
        const hostedGame = { pin: '123456', gameState: 'question' };
        const { io, options, h } = setup();
        options.playerManagementService.getPlayer.mockReturnValue(null);
        options.gameSessionService.findGameByHost.mockReturnValue(hostedGame);

        h['disconnect']();

        expect(hostedGame.hostDisconnected).toBe(true);
        expect(findEmit(io.toEmits, 'host-disconnected')).toBeTruthy();
        expect(options.gameSessionService.setHostDisconnectTimer).toHaveBeenCalled();
    });

    it('cleans up immediately when the host disconnects from the lobby', () => {
        const hostedGame = { pin: '123456', gameState: 'lobby' };
        const { options, h } = setup();
        options.playerManagementService.getPlayer.mockReturnValue(null);
        options.gameSessionService.findGameByHost.mockReturnValue(hostedGame);
        options.playerManagementService.getSessionByHostSocket.mockReturnValue(null);

        h['disconnect']();

        expect(options.playerManagementService.handleHostDisconnect).toHaveBeenCalledWith(hostedGame, expect.anything());
        expect(options.gameSessionService.deleteGame).toHaveBeenCalledWith('123456');
    });
});
