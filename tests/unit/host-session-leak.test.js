/**
 * Host sessions left behind by a host that returned to the menu.
 *
 * host-starting-new-game puts the game in pending-migration and clears its
 * hostId, so the host socket's later disconnect found no hosted game and the
 * host session stayed in hostSessions with no timer.
 *
 * Real GameSessionService, PlayerManagementService and socket handlers; fake
 * sockets and io, rate limiting stubbed to allow, fake timers.
 */

jest.mock('../../services/atomic-write', () => ({
    atomicWriteFile: jest.fn().mockResolvedValue(undefined)
}));

const { GameSessionService } = require('../../services/game-session-service');
const { PlayerManagementService } = require('../../services/player-management-service');
const { registerPlayerEvents } = require('../../socket/player-events');
const { registerGameEvents } = require('../../socket/game-events');
const { createFakeSocket, createFakeIo, createFakeLogger } = require('./helpers/socket-fakes');

const CONFIG = {
    TIMING: { DEFAULT_QUESTION_TIME: 20, LEADERBOARD_DISPLAY_TIME: 3000, GAME_START_DELAY: 3000, AUTO_ADVANCE_DELAY: 3000 },
    SCORING: {
        BASE_POINTS: 100, MAX_BONUS_TIME: 10000, TIME_BONUS_DIVISOR: 10,
        DIFFICULTY_MULTIPLIERS: { easy: 1, medium: 2, hard: 3 }, DEFAULT_NUMERIC_TOLERANCE: 0.1
    },
    LIMITS: { MAX_PLAYER_NAME_LENGTH: 20 }
};

const QUIZ = {
    title: 'T',
    questions: [{ type: 'multiple-choice', question: 'Q1', options: ['A', 'B', 'C', 'D'], correctAnswer: 1, timeLimit: 20 }]
};

let ctx;

function setup() {
    jest.useFakeTimers();
    const logger = createFakeLogger();
    const gameSessionService = new GameSessionService(logger, CONFIG);
    const playerManagementService = new PlayerManagementService(logger, CONFIG);
    const io = createFakeIo();
    const options = {
        gameSessionService,
        playerManagementService,
        questionFlowService: { buildCorrectAnswerData: jest.fn() },
        checkRateLimit: () => true,
        logger
    };
    const connect = (id) => {
        const socket = createFakeSocket(id);
        registerPlayerEvents(io, socket, options);
        registerGameEvents(io, socket, options);
        io.sockets.sockets.set(id, socket);
        return socket;
    };
    return { gameSessionService, playerManagementService, io, connect };
}

const emitted = (socket, event) => socket.emits.filter(e => e.event === event).pop()?.data;

afterEach(() => {
    clearInterval(ctx.gameSessionService.cleanupInterval);
    jest.clearAllTimers();
    jest.useRealTimers();
});

describe('host session after host-starting-new-game and disconnect', () => {
    it('does not accumulate sessions over repeated menu-and-close cycles', () => {
        ctx = setup();
        const { connect, playerManagementService, gameSessionService } = ctx;

        for (let i = 0; i < 20; i++) {
            const host = connect(`host-${i}`);
            host.handlers['host-join']({ quiz: QUIZ });
            expect(emitted(host, 'game-created')).toBeTruthy();
            host.handlers['host-starting-new-game']();
            host.handlers['disconnect']();
        }

        jest.advanceTimersByTime(10 * 60 * 1000);
        expect(gameSessionService.games.size).toBe(0);
        expect(playerManagementService.hostSessions.size).toBe(0);
    });

    it('keeps a session with registered devices under the grace timer, then destroys it', () => {
        ctx = setup();
        const { connect, playerManagementService } = ctx;
        const host = connect('host-a');
        host.handlers['host-join']({ quiz: QUIZ });
        const { pin, hostSessionId } = emitted(host, 'game-created');
        const player = connect('p1');
        player.handlers['player-join']({ pin, name: 'Al', deviceId: '00000000-0000-4000-8000-000000000001' });

        host.handlers['host-starting-new-game']();
        host.handlers['disconnect']();

        const session = playerManagementService.hostSessions.get(hostSessionId);
        expect(session).toBeTruthy();
        expect(session.currentGamePin).toBeNull();
        expect(playerManagementService.sessionGraceTimers.has(hostSessionId)).toBe(true);

        jest.advanceTimersByTime(2 * 60 * 1000);
        expect(playerManagementService.hostSessions.has(hostSessionId)).toBe(false);
    });

    it('a host back on a new socket keeps the session and migrates the players', () => {
        ctx = setup();
        const { connect, playerManagementService, gameSessionService } = ctx;
        const host = connect('host-a');
        host.handlers['host-join']({ quiz: QUIZ });
        const { pin, hostSessionId, hostSessionToken } = emitted(host, 'game-created');
        const player = connect('p1');
        player.handlers['player-join']({ pin, name: 'Al', deviceId: '00000000-0000-4000-8000-000000000001' });

        host.handlers['host-starting-new-game']();
        const { migrationToken } = emitted(host, 'migration-token');
        host.handlers['disconnect']();

        const host2 = connect('host-b');
        host2.handlers['host-join']({ quiz: QUIZ, hostSessionId, hostSessionToken, previousPin: pin, migrationToken });
        const created = emitted(host2, 'game-created');
        expect(created.hostSessionId).toBe(hostSessionId);
        expect(playerManagementService.sessionGraceTimers.has(hostSessionId)).toBe(false);
        expect(gameSessionService.getGame(created.pin).players.has('p1')).toBe(true);

        // Disconnect of the old socket must not touch the session the new socket owns
        jest.advanceTimersByTime(10 * 60 * 1000);
        expect(playerManagementService.hostSessions.has(hostSessionId)).toBe(true);
    });

    it('a host-join followed by a lobby disconnect still leaves no session', () => {
        ctx = setup();
        const { connect, playerManagementService } = ctx;
        for (let i = 0; i < 5; i++) {
            const host = connect(`host-${i}`);
            host.handlers['host-join']({ quiz: QUIZ });
            host.handlers['disconnect']();
        }
        expect(playerManagementService.hostSessions.size).toBe(0);
    });
});
