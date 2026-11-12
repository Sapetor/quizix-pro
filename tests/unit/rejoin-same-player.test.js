/**
 * A player who leaves or is dropped from a running game and joins again comes
 * back as the same player.
 *
 * leave-game during a running game deleted the roster entry: the leaver dropped
 * out of the results, and a following player-join created a new entry at score
 * 0 that could answer the current question again. A grace-period expiry kept a
 * reduced copy in removedPlayers, and a later join under the same name created a
 * second entry, so the results had two rows for one student.
 *
 * Real GameSessionService, PlayerManagementService, QuestionFlowService, Game and
 * socket handlers; fake sockets and io, rate limiting stubbed to allow.
 */

jest.mock('../../services/atomic-write', () => ({
    atomicWriteFile: jest.fn().mockResolvedValue(undefined)
}));

const crypto = require('crypto');
const { atomicWriteFile } = require('../../services/atomic-write');
const { GameSessionService } = require('../../services/game-session-service');
const { PlayerManagementService } = require('../../services/player-management-service');
const { QuestionFlowService } = require('../../services/question-flow-service');
const { registerPlayerEvents } = require('../../socket/player-events');
const { registerGameplayEvents } = require('../../socket/gameplay-events');
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
    questions: [
        { type: 'multiple-choice', question: 'Q1', options: ['A', 'B', 'C', 'D'], correctAnswer: 1, timeLimit: 60 },
        { type: 'multiple-choice', question: 'Q2', options: ['A', 'B', 'C', 'D'], correctAnswer: 1, timeLimit: 60 }
    ]
};

let ctx;

function setup(quiz = QUIZ) {
    jest.useFakeTimers();
    atomicWriteFile.mockClear();
    const logger = createFakeLogger();
    const gameSessionService = new GameSessionService(logger, CONFIG);
    const playerManagementService = new PlayerManagementService(logger, CONFIG);
    const questionFlowService = new QuestionFlowService(logger, gameSessionService);
    const io = createFakeIo();
    const options = {
        gameSessionService,
        playerManagementService,
        questionFlowService,
        checkRateLimit: () => true,
        logger
    };
    const game = gameSessionService.createGame('host-sock', quiz);
    const sockets = [];
    const connect = (id) => {
        const socket = createFakeSocket(id);
        registerPlayerEvents(io, socket, options);
        registerGameplayEvents(io, socket, options);
        io.sockets.sockets.set(id, socket);
        sockets.push(socket);
        return socket;
    };
    const join = (socket, name, deviceId) =>
        socket.handlers['player-join']({ pin: game.pin, name, ...(deviceId && { deviceId }) });
    const startQuestion = (index) => {
        game.currentQuestion = index;
        gameSessionService.startQuestion(game, io);
    };
    const answer = (socket, value) => {
        socket.handlers['submit-answer']({ answer: value, type: 'multiple-choice' });
        jest.advanceTimersByTime(150); // flush the coalesced answer count
    };
    const savedResults = async () => {
        await game.saveResults();
        expect(atomicWriteFile).toHaveBeenCalledTimes(1);
        return JSON.parse(atomicWriteFile.mock.calls[0][1]);
    };
    return { options, gameSessionService, playerManagementService, io, game, sockets, connect, join, startQuestion, answer, savedResults };
}

const last = (socket, event) => socket.emits.filter(e => e.event === event).pop()?.data;
const hostCount = (io) => io.toEmits.filter(e => e.room === 'host-sock' && e.event === 'answer-count-update').pop()?.data;
const rosterNames = (io, pin) => io.toEmits
    .filter(e => e.room === `game-${pin}` && e.event === 'player-list-update')
    .pop()?.data.players.map(p => p.name);

afterEach(() => {
    clearInterval(ctx.gameSessionService.cleanupInterval);
    jest.clearAllTimers();
    jest.useRealTimers();
});

describe('leave-game during a running game', () => {
    // (a)
    it.each([
        ['the same socket', 'p1'],
        ['a new socket', 'p1-new']
    ])('answer, leave, rejoin from the same device on %s: second answer refused, score kept, one results row', async (_label, rejoinId) => {
        ctx = setup();
        const { game, connect, join, startQuestion, answer, savedResults } = ctx;
        const device = crypto.randomUUID();
        const p1 = connect('p1');
        const p2 = connect('p2');
        join(p1, 'Al', device);
        join(p2, 'Bo', crypto.randomUUID());
        startQuestion(0);

        answer(p1, 1);
        const earned = game.players.get('p1').score;
        expect(earned).toBeGreaterThan(0);

        p1.handlers['leave-game']();
        const again = rejoinId === 'p1' ? p1 : connect(rejoinId);
        join(again, 'Al', device);

        expect(last(again, 'rejoin-success')).toMatchObject({ playerName: 'Al', score: earned });
        expect(last(again, 'question-start').alreadyAnswered).toBe(true);
        expect(game.players.get(rejoinId).score).toBe(earned);

        again.emits.length = 0;
        answer(again, 2);
        expect(last(again, 'answer-already-submitted')).toBeTruthy();
        expect(last(again, 'answer-submitted')).toBeUndefined();
        expect(game.players.get(rejoinId).score).toBe(earned);

        const rows = (await savedResults()).results.filter(r => r.name === 'Al');
        expect(rows).toEqual([expect.objectContaining({ name: 'Al', score: earned })]);
    });

    // (b) and requirement 6
    it('leave before answering, rejoin: exactly one answer accepted, and the leaver is out of the counts until resumed', () => {
        ctx = setup();
        const { game, io, connect, join, startQuestion, answer } = ctx;
        const device = crypto.randomUUID();
        const p1 = connect('p1');
        const p2 = connect('p2');
        join(p1, 'Al', device);
        join(p2, 'Bo');
        startQuestion(0);

        p1.handlers['leave-game']();
        jest.advanceTimersByTime(300);
        expect(hostCount(io)).toEqual({ answeredPlayers: 0, connectedPlayers: 1, totalPlayers: 1 });
        expect(rosterNames(io, game.pin)).toEqual(['Bo']);

        const again = connect('p1-new');
        join(again, 'Al', device);
        jest.advanceTimersByTime(300);
        expect(last(again, 'rejoin-success')).toMatchObject({ playerName: 'Al', score: 0 });
        expect(last(again, 'player-joined')).toBeUndefined();
        expect(last(again, 'question-start').alreadyAnswered).toBe(false);
        expect(hostCount(io)).toEqual({ answeredPlayers: 0, connectedPlayers: 2, totalPlayers: 2 });
        expect(rosterNames(io, game.pin).sort()).toEqual(['Al', 'Bo']);

        answer(again, 1);
        expect(last(again, 'answer-submitted')).toBeTruthy();
        const earned = game.players.get('p1-new').score;
        expect(earned).toBeGreaterThan(0);

        answer(again, 1);
        expect(again.emits.filter(e => e.event === 'answer-submitted')).toHaveLength(1);
        expect(last(again, 'answer-already-submitted')).toBeTruthy();
        expect(game.players.get('p1-new').score).toBe(earned);
        expect(game.players.size).toBe(2);
        expect(game.removedPlayers).toHaveLength(0);
    });

    // (h)
    it('a player who left mid-game and never returns appears once in the saved results with their score', async () => {
        ctx = setup();
        const { game, connect, join, startQuestion, answer, savedResults } = ctx;
        const p1 = connect('p1');
        const p2 = connect('p2');
        join(p1, 'Al', crypto.randomUUID());
        join(p2, 'Bo');
        startQuestion(0);
        answer(p1, 1);
        const earned = game.players.get('p1').score;

        p1.handlers['leave-game']();

        const rows = (await savedResults()).results;
        expect(rows.filter(r => r.name === 'Al')).toEqual([expect.objectContaining({ score: earned })]);
        expect(rows).toHaveLength(2);
    });

    // (g)
    it('a lobby leave still deletes the player and frees the name', () => {
        ctx = setup();
        const { game, connect, join } = ctx;
        const p1 = connect('p1');
        join(p1, 'Al', crypto.randomUUID());
        p1.handlers['leave-game']();

        expect(game.players.size).toBe(0);
        expect(game.removedPlayers).toHaveLength(0);

        const other = connect('other');
        join(other, 'al', crypto.randomUUID());
        expect(last(other, 'player-joined')).toMatchObject({ playerName: 'al' });
        expect(last(other, 'error')).toBeUndefined();
    });
});

describe('power-up state of a resumed player', () => {
    it('keeps a used power-up used, and the resume sends game-started before question-start', () => {
        ctx = setup({ ...QUIZ, powerUpsEnabled: true });
        const { game, connect, join, startQuestion } = ctx;
        const device = crypto.randomUUID();
        const p1 = connect('p1');
        const p2 = connect('p2');
        join(p1, 'Al', device);
        join(p2, 'Bo');
        startQuestion(0);

        p1.handlers['use-power-up']({ type: 'fifty-fifty' });
        expect(last(p1, 'power-up-result').success).toBe(true);
        p1.handlers['leave-game']();

        const again = connect('p1-new');
        join(again, 'Al', device);
        const order = again.emits.map(e => e.event);
        expect(order).toContain('game-started');
        expect(order.indexOf('game-started')).toBeLessThan(order.indexOf('question-start'));
        expect(last(again, 'game-started')).toMatchObject({ powerUpsEnabled: true });

        again.handlers['use-power-up']({ type: 'fifty-fifty' });
        expect(last(again, 'power-up-result').success).toBe(false);
        expect(game.players.get('p1-new').powerUps['fifty-fifty'].used).toBe(true);
    });

    // The client resets its power-up bar on leave and game-started shows every
    // power-up as available; rejoin-success carries the player's own state.
    it('rejoin-success carries the player\'s own power-up state, double-points still active', () => {
        ctx = setup({ ...QUIZ, powerUpsEnabled: true });
        const { connect, join, startQuestion } = ctx;
        const device = crypto.randomUUID();
        const p1 = connect('p1');
        const p2 = connect('p2');
        join(p1, 'Al', device);
        join(p2, 'Bo');
        startQuestion(0);
        p1.handlers['use-power-up']({ type: 'extend-time' });
        p1.handlers['use-power-up']({ type: 'double-points' });
        p1.handlers['leave-game']();

        const again = connect('p1-new');
        join(again, 'Al', device);
        expect(last(again, 'rejoin-success').powerUps).toEqual({
            'fifty-fifty': { available: true, used: false },
            'extend-time': { available: false, used: true },
            'double-points': { available: false, used: true, active: true }
        });
    });

    // The stock client extends its countdown on click, before the server answers.
    it('a refused extend-time re-sends the unchanged remaining time', () => {
        ctx = setup({ ...QUIZ, powerUpsEnabled: true });
        const { game, connect, join, startQuestion } = ctx;
        const p1 = connect('p1');
        join(p1, 'Al');
        startQuestion(0);
        p1.handlers['use-power-up']({ type: 'extend-time' });
        expect(last(p1, 'power-up-result').success).toBe(true);
        jest.advanceTimersByTime(2000);
        p1.emits.length = 0;

        p1.handlers['use-power-up']({ type: 'extend-time' });
        expect(last(p1, 'power-up-result')).toMatchObject({ success: false, messageKey: 'error_powerup_already_used' });
        expect(last(p1, 'time-sync')).toEqual({ remainingMs: game.questionEndsAt - Date.now() });
    });
});

describe('player cap on resume', () => {
    it('a removed player cannot resume into a roster that is already full', () => {
        ctx = setup();
        const { game, connect, join, startQuestion } = ctx;
        game.limits = { ...game.limits, MAX_PLAYERS_PER_GAME: 2 }; // copy: the limits object is shared
        const device = crypto.randomUUID();
        const p1 = connect('p1');
        const p2 = connect('p2');
        join(p1, 'Al', device);
        join(p2, 'Bo');
        startQuestion(0);
        p1.handlers['leave-game']();

        const p3 = connect('p3');
        join(p3, 'Cy');
        expect(game.players.size).toBe(2);

        const again = connect('p1-new');
        join(again, 'Al', device);
        expect(last(again, 'error')).toMatchObject({ messageKey: 'error_game_full' });
        expect(last(again, 'rejoin-success')).toBeUndefined();
        expect(game.players.size).toBe(2);
        expect(game.removedPlayers.map(p => p.name)).toEqual(['Al']);
    });
});

describe('grace timer from a finished game', () => {
    it('fires in the rematch lobby without reserving the name', () => {
        ctx = setup();
        const { options, gameSessionService, game, io, connect, join, startQuestion } = ctx;
        // Game events only: the fake socket keeps one handler per event name.
        const host = createFakeSocket('host-sock');
        registerGameEvents(io, host, options);
        const p1 = connect('p1');
        const p2 = connect('p2');
        join(p1, 'Al', crypto.randomUUID());
        join(p2, 'Bo');
        startQuestion(0);
        p1.handlers['disconnect']();

        game.resultsSaved = true; // no results write leaking into the next test
        gameSessionService.endGame(game, io);
        host.handlers['rematch-game']();
        expect(game.gameState).toBe('lobby');

        jest.advanceTimersByTime(2 * 60 * 1000 + 1000);
        expect(game.removedPlayers).toHaveLength(0);
        expect([...game.players.values()].map(p => p.name)).toEqual(['Bo']);

        const other = connect('other');
        join(other, 'Al', crypto.randomUUID());
        expect(last(other, 'player-joined')).toMatchObject({ playerName: 'Al' });
    });
});

describe('grace-period expiry', () => {
    // (c)
    it('disconnect, grace expiry, rejoin by device id: one results row with the earned score', async () => {
        ctx = setup();
        const { game, connect, join, startQuestion, answer, savedResults } = ctx;
        const device = crypto.randomUUID();
        const p1 = connect('p1');
        const p2 = connect('p2');
        join(p1, 'Al', device);
        join(p2, 'Bo');
        startQuestion(0);
        answer(p1, 1);
        const earned = game.players.get('p1').score;

        p1.handlers['disconnect']();
        jest.advanceTimersByTime(2 * 60 * 1000 + 1000);
        expect(game.players.has('p1')).toBe(false);

        // The question timed out during the grace period; the game is on the reveal.
        expect(game.gameState).toBe('revealing');
        const again = connect('p1-new');
        join(again, 'Al', device);

        expect(last(again, 'rejoin-success')).toMatchObject({ playerName: 'Al', score: earned });
        expect(game.players.get('p1-new').score).toBe(earned);

        const rows = (await savedResults()).results.filter(r => r.name === 'Al');
        expect(rows).toEqual([expect.objectContaining({ score: earned })]);
    });
});

describe('names of removed players stay taken', () => {
    // (d)
    it('a different device joining with a removed player\'s name is refused', () => {
        ctx = setup();
        const { game, connect, join, startQuestion } = ctx;
        const p1 = connect('p1');
        join(p1, 'Al', crypto.randomUUID());
        startQuestion(0);
        p1.handlers['leave-game']();

        const other = connect('other');
        join(other, 'AL', crypto.randomUUID());
        expect(last(other, 'error')).toMatchObject({ messageKey: 'error_name_already_taken' });

        const noDevice = connect('no-device');
        join(noDevice, 'al');
        expect(last(noDevice, 'error')).toMatchObject({ messageKey: 'error_name_already_taken' });

        expect(game.players.size).toBe(0);
        expect(game.removedPlayers).toHaveLength(1);
    });

    it('a join without a device id resumes a removed record that has none, by name', () => {
        ctx = setup();
        const { game, connect, join, startQuestion, answer } = ctx;
        const p1 = connect('p1');
        const p2 = connect('p2');
        join(p1, 'Al');
        join(p2, 'Bo');
        startQuestion(0);
        answer(p1, 1);
        const earned = game.players.get('p1').score;
        p1.handlers['leave-game']();

        const again = connect('p1-new');
        join(again, 'al');
        expect(last(again, 'rejoin-success')).toMatchObject({ playerName: 'Al', score: earned });
        expect(game.removedPlayers).toHaveLength(0);
    });

    // (e) Name changes are lobby-only and removedPlayers is empty in a live lobby
    // (a lobby leave deletes, reset() clears), so the state is constructed here.
    it('a name change to a removed player\'s name is refused', () => {
        ctx = setup();
        const { game, connect, join } = ctx;
        const p2 = connect('p2');
        join(p2, 'Bo');
        game.removedPlayers.push({ id: 'gone', name: 'Al', score: 0, answers: [], disconnected: true, removedAt: Date.now() });

        p2.handlers['player-change-name']({ newName: 'al' });
        expect(last(p2, 'error')).toMatchObject({ messageKey: 'error_name_already_taken' });
        expect(game.players.get('p2').name).toBe('Bo');
    });
});

describe('session token and device id stay on the server', () => {
    // (f)
    it('are absent from roster, leaderboard, game-end, host rejoin payloads and the saved results', async () => {
        ctx = setup();
        const { gameSessionService, game, io, sockets, connect, join, startQuestion, answer, savedResults } = ctx;
        const devices = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
        const p1 = connect('p1');
        const p2 = connect('p2');
        const p3 = connect('p3');
        join(p1, 'Al', devices[0]);
        join(p2, 'Bo', devices[1]);
        join(p3, 'Cy', devices[2]);
        startQuestion(0);
        answer(p1, 1);
        answer(p2, 1);

        p1.handlers['leave-game']();           // removed, never returns
        p2.handlers['disconnect']();           // removed after the grace period
        jest.advanceTimersByTime(2 * 60 * 1000 + 1000);
        expect(game.removedPlayers.map(p => p.name).sort()).toEqual(['Al', 'Bo']);

        const tokens = [...game.players.values(), ...game.removedPlayers].map(p => p.sessionToken);
        expect(tokens.every(Boolean)).toBe(true);
        const secrets = [...tokens, ...devices];

        const host = connect('host-new');
        host.handlers['host-rejoin']({ pin: game.pin, token: game.hostToken });
        expect(last(host, 'host-rejoin-success')).toBeTruthy();

        // Saved first, so endGame finds resultsSaved set and does not write again.
        game.updateLeaderboard();
        const resultsJson = JSON.stringify(await savedResults());
        gameSessionService.endGame(game, io);
        jest.advanceTimersByTime(1500);
        expect(io.toEmits.some(e => e.event === 'game-end')).toBe(true);
        expect(io.toEmits.some(e => e.event === 'player-list-update')).toBe(true);
        expect(game.leaderboard.map(p => p.name).sort()).toEqual(['Al', 'Bo', 'Cy']);

        // A player's own player-joined / rejoin-success carries its own token by design.
        const ownTokenEvents = new Set(['player-joined', 'rejoin-success']);
        const outbound = [
            ...io.toEmits,
            ...io.emits,
            ...sockets.flatMap(s => s.emits.filter(e => !ownTokenEvents.has(e.event)))
        ];
        const outboundJson = JSON.stringify(outbound);
        const leaderboardJson = JSON.stringify(game.leaderboard);

        for (const secret of secrets) {
            expect(outboundJson).not.toContain(secret);
            expect(leaderboardJson).not.toContain(secret);
            expect(resultsJson).not.toContain(secret);
        }
    });
});
