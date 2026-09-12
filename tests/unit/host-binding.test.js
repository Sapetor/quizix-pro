/**
 * Socket-to-user binding.
 *
 * The HTTP path attaches `req.user` from the session cookie (middleware/attach-user).
 * Sockets carried no user at all, so `game.hostUserId` was always null and a
 * signed-in host was authorized for its own results only by the browser-local
 * host token. These tests cover the socket half: the same cookie reader and the
 * same verifier, applied to `socket.handshake`, carried onto the game the host
 * creates.
 *
 * Anonymous play is first-class: every cookie failure mode must still connect.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { SessionService, COOKIE_NAME } = require('../../services/session-service');
const { GameSessionService } = require('../../services/game-session-service');
const { registerGameEvents, createSocketUserBinding } = require('../../socket/game-events');
const { createFakeSocket, createFakeIo, createOptions } = require('./helpers/socket-fakes');

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

const CONFIG = {
    TIMING: {
        DEFAULT_QUESTION_TIME: 20,
        LEADERBOARD_DISPLAY_TIME: 3000,
        GAME_START_DELAY: 3000,
        AUTO_ADVANCE_DELAY: 3000
    },
    SCORING: {
        BASE_POINTS: 100,
        MAX_BONUS_TIME: 10000,
        TIME_BONUS_DIVISOR: 10,
        DIFFICULTY_MULTIPLIERS: { easy: 1, medium: 2, hard: 3 },
        DEFAULT_NUMERIC_TOLERANCE: 0.1
    }
};

const validQuiz = {
    title: 'My Quiz',
    questions: [{ type: 'multiple-choice', question: 'Q1', options: ['a', 'b'], correctIndex: 0 }]
};

const USER = { id: 'user-1', username: 'teacher' };
const userService = { getUser: (uid) => (uid === USER.id ? USER : null) };

let secretDir;
let sessionService;
let gameSessionService;

beforeAll(() => {
    secretDir = fs.mkdtempSync(path.join(os.tmpdir(), 'host-binding-'));
});

afterAll(() => {
    fs.rmSync(secretDir, { recursive: true, force: true });
});

beforeEach(() => {
    // GameSessionService schedules a stale-game sweep on construction; fake
    // timers keep those out of the real event loop, as in game-session-service.test.js.
    jest.useFakeTimers();
    sessionService = new SessionService(silentLogger, {
        secretPath: path.join(secretDir, '.session-secret')
    });
    gameSessionService = new GameSessionService(silentLogger, CONFIG);
});

afterEach(() => {
    gameSessionService.stopPeriodicCleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
});

/**
 * Run the connection middleware against a handshake, then host a game on that
 * socket. Returns what a connecting client would experience: the next() call,
 * the bound user, and the created game.
 */
function connectAndHost(handshake) {
    const socket = createFakeSocket('host-sock');
    socket.data = {}; // socket.io initializes this before any middleware runs
    socket.handshake = handshake;

    const next = jest.fn();
    createSocketUserBinding({ sessionService, userService, logger: silentLogger })(socket, next);

    const io = createFakeIo();
    const options = createOptions({ gameSessionService });
    options.playerManagementService.createOrGetSession.mockReturnValue({
        hostSessionId: 'hs',
        currentGamePin: null
    });
    registerGameEvents(io, socket, options);
    socket.handlers['host-join']({ quiz: validQuiz });

    return { socket, next, game: gameSessionService.findGameByHost('host-sock') };
}

function cookieFor(value) {
    return { headers: { cookie: `${COOKIE_NAME}=${value}` } };
}

describe('socket user binding', () => {
    test('a valid session cookie binds the user and the game records the host', () => {
        const { socket, next, game } = connectAndHost(cookieFor(sessionService.signSession(USER.id)));

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(); // no error argument: the socket connects
        expect(socket.data.user).toEqual(USER);
        expect(game.hostUserId).toBe(USER.id);
    });

    test('the cookie is found among unrelated cookies', () => {
        const raw = sessionService.signSession(USER.id);
        const { game } = connectAndHost({
            headers: { cookie: `theme=dark; ${COOKIE_NAME}=${raw}; lang=en` }
        });

        expect(game.hostUserId).toBe(USER.id);
    });

    test('no cookie header at all: connects anonymously and still hosts', () => {
        const { socket, next, game } = connectAndHost({ headers: {} });

        expect(next).toHaveBeenCalledWith();
        expect(socket.data.user).toBeNull();
        expect(game).toBeDefined();
        expect(game.hostUserId).toBeNull();
    });

    test('cookies present but none of them ours: connects anonymously', () => {
        const { socket, next, game } = connectAndHost({ headers: { cookie: 'theme=dark' } });

        expect(next).toHaveBeenCalledWith();
        expect(socket.data.user).toBeNull();
        expect(game.hostUserId).toBeNull();
    });

    test('a malformed cookie value does not throw and does not block the connection', () => {
        for (const value of ['', 'garbage', 'no-dot', 'a.b.c', '.sig', 'payload.']) {
            const { socket, next, game } = connectAndHost(cookieFor(value));
            expect(next).toHaveBeenCalledWith();
            expect(socket.data.user).toBeNull();
            expect(game.hostUserId).toBeNull();
            gameSessionService.deleteGame(game.pin);
        }
    });

    test('a tampered signature is rejected, the socket still connects', () => {
        const raw = sessionService.signSession(USER.id);
        const tampered = raw.slice(0, raw.lastIndexOf('.') + 1) + 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

        const { socket, next, game } = connectAndHost(cookieFor(tampered));

        expect(next).toHaveBeenCalledWith();
        expect(socket.data.user).toBeNull();
        expect(game.hostUserId).toBeNull();
    });

    test('an expired cookie is rejected, the socket still connects', () => {
        const expiring = new SessionService(silentLogger, {
            secretPath: path.join(secretDir, '.session-secret'),
            ttlMs: -1000
        });

        const { socket, next, game } = connectAndHost(cookieFor(expiring.signSession(USER.id)));

        expect(next).toHaveBeenCalledWith();
        expect(socket.data.user).toBeNull();
        expect(game.hostUserId).toBeNull();
    });

    test('a valid cookie for a deleted user binds nobody', () => {
        const { socket, next, game } = connectAndHost(cookieFor(sessionService.signSession('ghost')));

        expect(next).toHaveBeenCalledWith();
        expect(socket.data.user).toBeNull();
        expect(game.hostUserId).toBeNull();
    });

    test('a handshake without headers does not throw', () => {
        const { socket, next, game } = connectAndHost({});

        expect(next).toHaveBeenCalledWith();
        expect(socket.data.user).toBeNull();
        expect(game.hostUserId).toBeNull();
    });

    test('a reconnecting socket is re-bound: the middleware runs again per connection', () => {
        const raw = cookieFor(sessionService.signSession(USER.id));
        const bind = createSocketUserBinding({ sessionService, userService, logger: silentLogger });

        const first = createFakeSocket('sock-a');
        first.data = {};
        first.handshake = raw;
        bind(first, jest.fn());

        const second = createFakeSocket('sock-b');
        second.data = {};
        second.handshake = raw;
        bind(second, jest.fn());

        expect(first.data.user).toEqual(USER);
        expect(second.data.user).toEqual(USER);
    });

    test('a throwing user lookup is swallowed: the socket connects anonymously', () => {
        const socket = createFakeSocket('host-sock');
        socket.data = {};
        socket.handshake = cookieFor(sessionService.signSession(USER.id));
        const next = jest.fn();

        createSocketUserBinding({
            sessionService,
            userService: { getUser() { throw new Error('store offline'); } },
            logger: silentLogger
        })(socket, next);

        expect(next).toHaveBeenCalledWith();
        expect(socket.data.user).toBeNull();
    });
});

describe('hostUserId reaches the saved results record', () => {
    test('a game hosted by a signed-in user carries the owner through to saveResults', () => {
        const { game } = connectAndHost(cookieFor(sessionService.signSession(USER.id)));

        // Same field services/game.js writes into the results file.
        expect(game.hostUserId).toBe(USER.id);
        expect(typeof game.hostToken).toBe('string');
    });

    test('an anonymous game records no owner, only the host token', () => {
        const { game } = connectAndHost({ headers: {} });

        expect(game.hostUserId).toBeNull();
        expect(typeof game.hostToken).toBe('string');
    });
});
