/**
 * Power-ups of a player entry created while a question is running.
 *
 * leave-game removes the entry, so a following player-join on the same socket
 * created a new one with unused power-ups. Repeating leave-game, player-join,
 * use-power-up moved questionEndsAt by 10 s per cycle and drew a new 50-50 each
 * time. An entry created during a question now gets extend-time and 50-50 from
 * the next question on.
 *
 * Real GameSessionService, PlayerManagementService, Game and socket handlers;
 * fake sockets and io, rate limiting stubbed to allow.
 */

jest.mock('../../services/atomic-write', () => ({
    atomicWriteFile: jest.fn().mockResolvedValue(undefined)
}));

const { GameSessionService } = require('../../services/game-session-service');
const { PlayerManagementService } = require('../../services/player-management-service');
const { registerPlayerEvents } = require('../../socket/player-events');
const { registerGameplayEvents } = require('../../socket/gameplay-events');
const { createFakeSocket, createFakeIo, createFakeLogger } = require('./helpers/socket-fakes');

const CONFIG = {
    TIMING: { DEFAULT_QUESTION_TIME: 20, LEADERBOARD_DISPLAY_TIME: 3000, GAME_START_DELAY: 3000, AUTO_ADVANCE_DELAY: 3000 },
    SCORING: {
        BASE_POINTS: 100, MAX_BONUS_TIME: 10000, TIME_BONUS_DIVISOR: 10,
        DIFFICULTY_MULTIPLIERS: { easy: 1, medium: 2, hard: 3 }, DEFAULT_NUMERIC_TOLERANCE: 0.1
    },
    LIMITS: { MAX_PLAYER_NAME_LENGTH: 20 }
};

function setup() {
    jest.useFakeTimers();
    const logger = createFakeLogger();
    const gameSessionService = new GameSessionService(logger, CONFIG);
    const playerManagementService = new PlayerManagementService(logger, CONFIG);
    const io = createFakeIo();
    const options = {
        gameSessionService,
        playerManagementService,
        questionFlowService: { handleAnswerSubmission: jest.fn(), buildCorrectAnswerData: jest.fn() },
        checkRateLimit: () => true,
        logger
    };
    const game = gameSessionService.createGame('host-sock', {
        title: 'T',
        powerUpsEnabled: true,
        questions: [
            { type: 'multiple-choice', question: 'Q1', options: ['A', 'B', 'C', 'D'], correctAnswer: 1, timeLimit: 20 },
            { type: 'multiple-choice', question: 'Q2', options: ['A', 'B', 'C', 'D'], correctAnswer: 1, timeLimit: 20 }
        ]
    });
    const connect = (id) => {
        const socket = createFakeSocket(id);
        registerPlayerEvents(io, socket, options);
        registerGameplayEvents(io, socket, options);
        return socket;
    };
    const startQuestion = (index) => {
        jest.advanceTimersByTime(1000);
        game.currentQuestion = index;
        gameSessionService.startQuestion(game, io);
    };
    return { gameSessionService, playerManagementService, io, game, connect, startQuestion };
}

const lastResult = (socket) => socket.emits.filter(e => e.event === 'power-up-result').pop().data;

function usePowerUp(socket, type) {
    socket.handlers['use-power-up']({ type });
    return lastResult(socket);
}

describe('power-ups of an entry created during a question', () => {
    let ctx;
    afterEach(() => {
        clearInterval(ctx.gameSessionService.cleanupInterval);
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it('a leave-game and player-join cycle on one socket gets no extend-time or 50-50 in the same question', () => {
        ctx = setup();
        const { game, connect, startQuestion } = ctx;
        const p1 = connect('p1');
        p1.handlers['player-join']({ pin: game.pin, name: 'Al' });
        startQuestion(0);

        expect(usePowerUp(p1, 'extend-time').success).toBe(true);
        expect(usePowerUp(p1, 'fifty-fifty').success).toBe(true);
        const endsAt = game.questionEndsAt;

        for (const name of ['Al2', 'Al3', 'Al4']) {
            p1.handlers['leave-game']();
            p1.handlers['player-join']({ pin: game.pin, name });
            expect(game.players.get('p1').name).toBe(name);

            const ext = usePowerUp(p1, 'extend-time');
            const fifty = usePowerUp(p1, 'fifty-fifty');
            expect(ext.success).toBe(false);
            expect(fifty.success).toBe(false);
            expect(fifty.hiddenOptions).toBeUndefined();
        }

        expect(game.questionEndsAt).toBe(endsAt);
        // Not consumed: the entry keeps them for the next question
        expect(game.players.get('p1').powerUps['extend-time'].used).toBe(false);
        expect(game.players.get('p1').powerUps['fifty-fifty'].used).toBe(false);
    });

    it('a late joiner gets extend-time and 50-50 from the next question', () => {
        ctx = setup();
        const { game, connect, startQuestion } = ctx;
        startQuestion(0);
        const late = connect('late');
        late.handlers['player-join']({ pin: game.pin, name: 'Late' });

        expect(usePowerUp(late, 'extend-time').success).toBe(false);
        expect(usePowerUp(late, 'fifty-fifty').success).toBe(false);
        // double-points only affects this entry's own score
        expect(usePowerUp(late, 'double-points').success).toBe(true);

        startQuestion(1);
        const endsAt = game.questionEndsAt;
        expect(usePowerUp(late, 'extend-time').success).toBe(true);
        expect(usePowerUp(late, 'fifty-fifty').success).toBe(true);
        expect(game.questionEndsAt).toBe(endsAt + 10000);
    });

    it('a player who joined in the lobby can use them in the first question', () => {
        ctx = setup();
        const { game, connect, startQuestion } = ctx;
        const p1 = connect('p1');
        p1.handlers['player-join']({ pin: game.pin, name: 'Al' });
        startQuestion(0);

        expect(usePowerUp(p1, 'extend-time').success).toBe(true);
        expect(usePowerUp(p1, 'fifty-fifty').success).toBe(true);
    });

    it('the restriction does not carry into a rematch', () => {
        ctx = setup();
        const { game, connect, startQuestion } = ctx;
        startQuestion(0);
        const late = connect('late');
        late.handlers['player-join']({ pin: game.pin, name: 'Late' });
        expect(usePowerUp(late, 'extend-time').success).toBe(false);

        game.gameState = 'finished';
        game.reset();
        startQuestion(0);

        expect(usePowerUp(late, 'extend-time').success).toBe(true);
        expect(usePowerUp(late, 'fifty-fifty').success).toBe(true);
    });
});
