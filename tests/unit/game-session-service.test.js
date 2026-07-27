/**
 * GameSessionService — Behavioral Unit Tests
 *
 * Covers session lifecycle: creation / lookup, PIN generation & collision
 * avoidance, concurrent-game limit enforcement, stale/orphan cleanup,
 * host-disconnect → pending-migration flow, and the game/question/end state
 * machine driven by fake timers.
 *
 * Socket.IO is faked (io.to(room).emit(...)); disk I/O is stubbed via the
 * atomic-write mock so saveResults never touches the filesystem. All setInterval
 * / setTimeout scheduling uses jest fake timers, and the periodic cleanup the
 * constructor starts is stopped in afterEach to avoid leaking timers.
 */

jest.mock('../../services/atomic-write', () => ({
    atomicWriteFile: jest.fn().mockResolvedValue(undefined)
}));

const { GameSessionService, ANSWER_REVEAL_MS } = require('../../services/game-session-service');

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

const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

function makeIo() {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    return { to, emit, sockets: { sockets: new Map() } };
}

function sampleQuiz(overrides = {}) {
    return {
        title: 'Test Quiz',
        questions: [
            { type: 'multiple-choice', question: 'Q1', options: ['A', 'B', 'C', 'D'], correctAnswer: 1, timeLimit: 20 },
            { type: 'multiple-choice', question: 'Q2', options: ['A', 'B'], correctAnswer: 0, timeLimit: 20 }
        ],
        ...overrides
    };
}

let svc;

beforeEach(() => {
    jest.useFakeTimers();
    svc = new GameSessionService(mockLogger, CONFIG);
});

afterEach(() => {
    svc.stopPeriodicCleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('GameSessionService — construction', () => {
    test('starts with no games and desktop concurrent-game limit', () => {
        expect(svc.games.size).toBe(0);
        expect(svc.limits.MAX_CONCURRENT_GAMES).toBe(100);
    });
});

describe('GameSessionService — createGame & lookup', () => {
    test('creates a game and indexes it by pin and host id', () => {
        const game = svc.createGame('host-1', sampleQuiz());
        expect(svc.games.size).toBe(1);
        expect(svc.getGame(game.pin)).toBe(game);
        expect(svc.findGameByHost('host-1')).toBe(game);
        expect(svc.hostIdToPin.get('host-1')).toBe(game.pin);
    });

    test('assigns a stable host reconnect token', () => {
        const game = svc.createGame('host-1', sampleQuiz());
        expect(typeof game.hostToken).toBe('string');
        expect(game.hostToken.length).toBeGreaterThan(0);
    });

    test('reassigns the PIN through the collision-checked generator', () => {
        const game = svc.createGame('host-1', sampleQuiz());
        expect(game.pin).toMatch(/^\d{6}$/);
        expect(svc.games.has(game.pin)).toBe(true);
    });

    test('getGame returns undefined for an unknown pin', () => {
        expect(svc.getGame('000000')).toBeUndefined();
    });

    test('findGameByHost returns undefined for an unknown host', () => {
        expect(svc.findGameByHost('nobody')).toBeUndefined();
    });

    test('getAllGames exposes the live games map', () => {
        svc.createGame('host-1', sampleQuiz());
        expect(svc.getAllGames()).toBe(svc.games);
        expect(svc.getAllGames().size).toBe(1);
    });
});

describe('GameSessionService — concurrent-game limit', () => {
    test('throws GAME_LIMIT_REACHED / error_player_limit once the cap is hit', () => {
        svc.limits = { ...svc.limits, MAX_CONCURRENT_GAMES: 2 };
        svc.createGame('h1', sampleQuiz());
        svc.createGame('h2', sampleQuiz());
        let err;
        try {
            svc.createGame('h3', sampleQuiz());
        } catch (e) {
            err = e;
        }
        expect(err).toBeDefined();
        expect(err.code).toBe('GAME_LIMIT_REACHED');
        expect(err.messageKey).toBe('error_player_limit');
        expect(svc.games.size).toBe(2);
    });
});

describe('GameSessionService — generateGamePin', () => {
    test('returns a 6-digit string', () => {
        expect(svc.generateGamePin()).toMatch(/^\d{6}$/);
    });

    test('skips a pin that already belongs to a live game', () => {
        // Seed a game occupying pin 100000.
        const existing = svc.createGame('h1', sampleQuiz());
        existing.pin = '100000';
        svc.games.set('100000', existing);

        // random=0 → 100000 (collision), then random=0.5 → 550000 (free).
        const spy = jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.5);
        expect(svc.generateGamePin()).toBe('550000');
        spy.mockRestore();
    });
});

describe('GameSessionService — updateHostId', () => {
    test('moves the host→pin mapping to the new socket id', () => {
        const game = svc.createGame('old-host', sampleQuiz());
        svc.updateHostId('old-host', 'new-host', game.pin);
        expect(svc.hostIdToPin.has('old-host')).toBe(false);
        expect(svc.findGameByHost('new-host')).toBe(game);
    });
});

describe('GameSessionService — deleteGame', () => {
    test('removes the game and clears its host mapping', () => {
        const game = svc.createGame('host-1', sampleQuiz());
        const pin = game.pin;
        svc.deleteGame(pin);
        expect(svc.games.has(pin)).toBe(false);
        expect(svc.hostIdToPin.has('host-1')).toBe(false);
    });

    test('cleans up the socket batch room when a batch service is attached', () => {
        const batch = { cleanupRoom: jest.fn() };
        svc.setSocketBatchService(batch);
        const game = svc.createGame('host-1', sampleQuiz());
        svc.deleteGame(game.pin);
        expect(batch.cleanupRoom).toHaveBeenCalledWith(`game-${game.pin}`);
    });

    test('is a no-op for an unknown pin', () => {
        expect(() => svc.deleteGame('999999')).not.toThrow();
    });
});

describe('GameSessionService — host disconnect timers', () => {
    test('set then clear removes the pending host-disconnect timer', () => {
        const cb = jest.fn();
        const timer = setTimeout(cb, 10000);
        svc.setHostDisconnectTimer('123456', timer);
        expect(svc.hostDisconnectTimers.has('123456')).toBe(true);
        svc.clearHostDisconnectTimer('123456');
        expect(svc.hostDisconnectTimers.has('123456')).toBe(false);
        jest.advanceTimersByTime(20000);
        expect(cb).not.toHaveBeenCalled(); // timer was cleared
    });
});

describe('GameSessionService — pending migration (host-disconnect flow)', () => {
    test('transitions to pending-migration, detaches host, and returns a token', () => {
        const io = makeIo();
        const game = svc.createGame('host-1', sampleQuiz());
        game.gameState = 'question';

        const result = svc.setPendingMigration(game, io);

        expect(game.gameState).toBe('pending-migration');
        expect(game.hostId).toBeNull();
        expect(svc.hostIdToPin.has('host-1')).toBe(false);
        expect(result.pin).toBe(game.pin);
        expect(typeof result.migrationToken).toBe('string');
        expect(svc.migrationTimers.has(game.pin)).toBe(true);
    });

    test('after the 2-minute timeout it ends and deletes a still-pending game', () => {
        const io = makeIo();
        const game = svc.createGame('host-1', sampleQuiz());
        svc.setPendingMigration(game, io);

        jest.advanceTimersByTime(120000);

        expect(io.to).toHaveBeenCalledWith(`game-${game.pin}`);
        expect(io.emit).toHaveBeenCalledWith('game-ended', expect.objectContaining({
            messageKey: 'error_host_disconnected'
        }));
        expect(svc.games.has(game.pin)).toBe(false);
        expect(svc.migrationTimers.has(game.pin)).toBe(false);
    });

    test('clearMigrationTimer cancels the pending timeout', () => {
        const io = makeIo();
        const game = svc.createGame('host-1', sampleQuiz());
        svc.setPendingMigration(game, io);
        svc.clearMigrationTimer(game.pin);

        jest.advanceTimersByTime(120000);
        // Game still present because the timeout never fired.
        expect(svc.games.has(game.pin)).toBe(true);
        expect(svc.migrationTimers.has(game.pin)).toBe(false);
    });
});

describe('GameSessionService — cleanupStaleGames', () => {
    test('deletes games older than the max age', () => {
        const game = svc.createGame('host-1', sampleQuiz());
        game.createdAt = Date.now() - (3 * 60 * 60 * 1000); // 3h old
        svc.cleanupStaleGames();
        expect(svc.games.has(game.pin)).toBe(false);
    });

    test('deletes an orphaned empty lobby older than 30 minutes', () => {
        const game = svc.createGame('host-1', sampleQuiz());
        game.gameState = 'lobby';
        game.createdAt = Date.now() - (31 * 60 * 1000);
        // no players
        svc.cleanupStaleGames();
        expect(svc.games.has(game.pin)).toBe(false);
    });

    test('keeps a fresh, populated game', () => {
        const game = svc.createGame('host-1', sampleQuiz());
        game.addPlayer('p1', 'Alice');
        svc.cleanupStaleGames();
        expect(svc.games.has(game.pin)).toBe(true);
    });
});

describe('GameSessionService — cleanupOrphanedGames', () => {
    test('deletes an empty lobby whose host socket is gone', () => {
        const io = makeIo();
        const game = svc.createGame('host-1', sampleQuiz());
        game.gameState = 'lobby';
        // host-1 not present in io.sockets.sockets → orphaned
        svc.cleanupOrphanedGames(io);
        expect(svc.games.has(game.pin)).toBe(false);
    });

    test('keeps an empty lobby whose host socket is still connected', () => {
        const io = makeIo();
        const game = svc.createGame('host-1', sampleQuiz());
        game.gameState = 'lobby';
        io.sockets.sockets.set('host-1', { id: 'host-1' });
        svc.cleanupOrphanedGames(io);
        expect(svc.games.has(game.pin)).toBe(true);
    });

    test('never touches a game in pending-migration', () => {
        const io = makeIo();
        const game = svc.createGame('host-1', sampleQuiz());
        svc.setPendingMigration(game, io); // detaches host, sets pending-migration
        svc.cleanupOrphanedGames(io);
        expect(svc.games.has(game.pin)).toBe(true);
        svc.clearMigrationTimer(game.pin);
    });
});

describe('GameSessionService — startGame', () => {
    test('rejects a start when the game is not in lobby', () => {
        const io = makeIo();
        const game = svc.createGame('host-1', sampleQuiz());
        game.gameState = 'question';
        svc.startGame(game, io);
        expect(mockLogger.warn).toHaveBeenCalled();
        expect(game.gameState).toBe('question'); // unchanged
    });

    test('emits game-started and advances to the first question after the start delay', () => {
        const io = makeIo();
        const game = svc.createGame('host-1', sampleQuiz());
        svc.startGame(game, io);

        expect(game.gameState).toBe('starting');
        expect(io.emit).toHaveBeenCalledWith('game-started', expect.objectContaining({
            gamePin: game.pin,
            questionCount: 2
        }));

        jest.advanceTimersByTime(CONFIG.TIMING.GAME_START_DELAY);
        expect(game.currentQuestion).toBe(0);
        expect(game.gameState).toBe('question');
    });
});

describe('GameSessionService — startQuestion', () => {
    test('sets question state, stamps start time, and arms the question timer', () => {
        const io = makeIo();
        const game = svc.createGame('host-1', sampleQuiz());
        game.currentQuestion = 0;
        svc.startQuestion(game, io);

        expect(game.gameState).toBe('question');
        expect(typeof game.questionStartTime).toBe('number');
        expect(game.questionTimer).not.toBeNull();
        expect(io.emit).toHaveBeenCalledWith('question-start', expect.objectContaining({
            questionNumber: 1,
            totalQuestions: 2
        }));
    });

    test('ends the game if currentQuestion runs off the end', () => {
        const io = makeIo();
        const game = svc.createGame('host-1', sampleQuiz());
        game.currentQuestion = 5; // beyond the 2 questions
        svc.startQuestion(game, io);
        expect(game.gameState).toBe('finished');
    });
});

describe('GameSessionService — handleQuestionTimeout', () => {
    test('is ignored when the game is no longer in the question state', () => {
        const io = makeIo();
        const game = svc.createGame('host-1', sampleQuiz());
        game.currentQuestion = 0;
        game.gameState = 'revealing';
        const question = game.quiz.questions[0];
        svc.handleQuestionTimeout(game, io, question);
        // No question-timeout emission when the guard trips.
        expect(io.emit).not.toHaveBeenCalledWith('question-timeout', expect.anything());
    });

    test('reveals the correct answer and begins advancing on a live timeout', () => {
        const io = makeIo();
        const game = svc.createGame('host-1', sampleQuiz());
        game.currentQuestion = 0;
        game.gameState = 'question';
        game.questionStartTime = Date.now();
        const question = game.quiz.questions[0];

        svc.handleQuestionTimeout(game, io, question);

        expect(game.gameState).toBe('revealing');
        expect(io.emit).toHaveBeenCalledWith('question-timeout', expect.objectContaining({
            correctAnswer: 1,
            correctOption: 'B'
        }));
        expect(game.isAdvancing).toBe(true); // advanceToNextQuestion was entered
    });

    // Must stay payload-compatible with the early-end path in
    // question-flow-service.buildCorrectAnswerData: the host reveal for ordering
    // needs the canonical index order, not just the joined display string.
    test('sends the correct order array for an ordering question', () => {
        const io = makeIo();
        const game = svc.createGame('host-1', sampleQuiz({
            questions: [{
                type: 'ordering',
                question: 'Sort these',
                options: ['First', 'Second', 'Third'],
                correctOrder: [2, 0, 1],
                timeLimit: 20
            }]
        }));
        game.currentQuestion = 0;
        game.gameState = 'question';
        game.questionStartTime = Date.now();

        svc.handleQuestionTimeout(game, io, game.quiz.questions[0]);

        expect(io.emit).toHaveBeenCalledWith('question-timeout', expect.objectContaining({
            questionType: 'ordering',
            correctOrder: [2, 0, 1]
        }));
    });
});

describe('GameSessionService — advanceToNextQuestion', () => {
    test('is a no-op once the game is finished', () => {
        const io = makeIo();
        const game = svc.createGame('host-1', sampleQuiz());
        game.gameState = 'finished';
        svc.advanceToNextQuestion(game, io);
        expect(game.isAdvancing).toBe(false);
    });

    test('is a no-op if an advance is already in flight', () => {
        const io = makeIo();
        const game = svc.createGame('host-1', sampleQuiz());
        game.isAdvancing = true;
        const timerBefore = game.advanceTimer;
        svc.advanceToNextQuestion(game, io);
        expect(game.advanceTimer).toBe(timerBefore); // no new timer armed
    });

    // The reveal window (answer + host statistics on screen) is deliberately
    // longer than the leaderboard dwell: a class needs time to discuss the
    // answer distribution before the leaderboard takes the screen.
    test('holds the reveal for ANSWER_REVEAL_MS, well past the leaderboard dwell', () => {
        const io = makeIo();
        const game = svc.createGame('host-1', sampleQuiz());
        game.manualAdvancement = true; // stop after the reveal to isolate the window

        svc.advanceToNextQuestion(game, io);

        jest.advanceTimersByTime(CONFIG.TIMING.LEADERBOARD_DISPLAY_TIME);
        expect(io.emit).not.toHaveBeenCalledWith('question-end', expect.anything());

        jest.advanceTimersByTime(ANSWER_REVEAL_MS - CONFIG.TIMING.LEADERBOARD_DISPLAY_TIME);
        expect(io.emit).toHaveBeenCalledWith('question-end', { showStatistics: true });
        expect(ANSWER_REVEAL_MS).toBeGreaterThanOrEqual(5000);
    });

    test('auto-advance shows the leaderboard after the reveal, then starts the next question', () => {
        const io = makeIo();
        const game = svc.createGame('host-1', sampleQuiz());
        game.manualAdvancement = false;
        const startQuestion = jest.spyOn(svc, 'startQuestion').mockImplementation(() => {});

        svc.advanceToNextQuestion(game, io);

        jest.advanceTimersByTime(ANSWER_REVEAL_MS);
        expect(io.emit).toHaveBeenCalledWith('show-leaderboard', expect.objectContaining({
            leaderboard: expect.any(Array)
        }));
        expect(startQuestion).not.toHaveBeenCalled();

        // Leaderboard dwell itself is unchanged.
        jest.advanceTimersByTime(CONFIG.TIMING.LEADERBOARD_DISPLAY_TIME);
        expect(startQuestion).toHaveBeenCalled();
        expect(game.isAdvancing).toBe(false);
    });
});

describe('GameSessionService — endGame', () => {
    test('marks the game finished, clears timers, and emits game-end after the delay', () => {
        const io = makeIo();
        const game = svc.createGame('host-1', sampleQuiz());
        jest.spyOn(game, 'saveResults').mockResolvedValue(undefined);
        game.addPlayer('p1', 'Alice');

        svc.endGame(game, io);

        expect(game.gameState).toBe('finished');
        expect(typeof game.endTime).toBe('string');
        expect(game.saveResults).toHaveBeenCalled();

        jest.advanceTimersByTime(1000);
        expect(io.emit).toHaveBeenCalledWith('game-end', expect.objectContaining({
            finalLeaderboard: expect.any(Array)
        }));
    });

    test('is idempotent — a second endGame call is ignored', () => {
        const io = makeIo();
        const game = svc.createGame('host-1', sampleQuiz());
        jest.spyOn(game, 'saveResults').mockResolvedValue(undefined);

        svc.endGame(game, io);
        game.saveResults.mockClear();
        svc.endGame(game, io); // already finished
        expect(game.saveResults).not.toHaveBeenCalled();
    });
});
