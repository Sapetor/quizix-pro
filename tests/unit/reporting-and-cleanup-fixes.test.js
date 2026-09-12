/**
 * Regressions for the reporting / teardown / bounds defects.
 *
 *  - Answer statistics were counted in each player's shuffled coordinate space,
 *    so with randomizeAnswers on the host chart aggregated incomparable indices.
 *  - The migration timeout deleted the game but left the players' grace timers,
 *    their global-registry entries and the host session behind forever.
 *  - submit-answer bounded neither the numeric value nor the array length.
 *  - Numeric scoring read a config key that does not exist and turned an
 *    explicit tolerance of 0 into 0.1.
 */

const { Game } = require('../../services/game');
const { ScoringService } = require('../../services/scoring-service');
const { GameSessionService } = require('../../services/game-session-service');
const { PlayerManagementService } = require('../../services/player-management-service');
const { validateSocketEvent } = require('../../services/validation-schemas');

const CONFIG = {
    SCORING: {
        BASE_POINTS: 100,
        MAX_BONUS_TIME: 10000,
        TIME_BONUS_DIVISOR: 10,
        DIFFICULTY_MULTIPLIERS: { easy: 1, medium: 2, hard: 3 },
        DEFAULT_TOLERANCE: 0.1
    },
    TIMING: { DEFAULT_QUESTION_TIME: 20, LEADERBOARD_DISPLAY_TIME: 3000, GAME_START_DELAY: 3000 },
    LIMITS: { MAX_PLAYER_NAME_LENGTH: 20 }
};

const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('answer statistics use canonical option order', () => {
    it('counts two differently-shuffled players on the same option', () => {
        const game = new Game('host-1', {
            title: 'T',
            randomizeAnswers: true,
            questions: [{ type: 'multiple-choice', question: 'Q', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 }]
        }, mockLogger, CONFIG, { MAX_PLAYERS_PER_GAME: 200 });

        game.addPlayer('p1', 'Al');
        game.addPlayer('p2', 'Bo');
        game.currentQuestion = 0;
        game.questionStartTime = Date.now();

        // Both players click the tile showing option 'C' (canonical index 2), but
        // their shuffles put it at different positions.
        game.answerMappings.set('p1', [2, 0, 1, 3]); // shuffled 0 -> canonical 2
        game.answerMappings.set('p2', [1, 3, 2, 0]); // shuffled 2 -> canonical 2
        game.submitAnswer('p1', 0, 'multiple-choice');
        game.submitAnswer('p2', 2, 'multiple-choice');

        const stats = game.getAnswerStatistics();

        expect(stats.answeredPlayers).toBe(2);
        expect(stats.answerCounts[2]).toBe(2);
        expect(stats.answerCounts[0]).toBe(0);
    });

    it('keeps the raw clicked index alongside the translated one', () => {
        const game = new Game('host-1', {
            title: 'T',
            randomizeAnswers: true,
            questions: [{ type: 'multiple-choice', question: 'Q', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 }]
        }, mockLogger, CONFIG, { MAX_PLAYERS_PER_GAME: 200 });

        game.addPlayer('p1', 'Al');
        game.currentQuestion = 0;
        game.questionStartTime = Date.now();
        game.answerMappings.set('p1', [2, 0, 1, 3]);
        game.submitAnswer('p1', 0, 'multiple-choice');

        expect(game.players.get('p1').answers[0]).toMatchObject({ answer: 0, translatedAnswer: 2 });
    });
});

describe('migration timeout releases players and the host session', () => {
    let svc;
    let pms;

    beforeEach(() => {
        jest.useFakeTimers();
        svc = new GameSessionService(mockLogger, CONFIG);
        pms = new PlayerManagementService(mockLogger, CONFIG);
    });

    afterEach(() => {
        svc.stopPeriodicCleanup();
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it('clears grace timers, the global registry and the session when the window closes', () => {
        const io = { to: jest.fn(() => ({ emit: jest.fn() })), sockets: { sockets: new Map() } };
        const game = svc.createGame('host-1', {
            title: 'T',
            questions: [{ type: 'true-false', question: 'Q', correctAnswer: true }]
        });
        game.gameState = 'question';
        game.players.set('p1', { id: 'p1', name: 'Al', score: 10, answers: [], sessionToken: 'tok-1' });
        pms.players.set('p1', { gamePin: game.pin, name: 'Al' });
        pms.disconnectTimers.set('tok-1', setTimeout(() => {}, 5 * 60 * 1000));

        const session = pms.createOrGetSession('host-1');
        session.currentGamePin = game.pin;
        pms.registerDevice(session.hostSessionId, 'dev-1', 'Al', 'p1');

        svc.setPendingMigration(game, io, (expired) => {
            pms.releaseGamePlayers(expired);
            const s = pms.getSessionByHostSocket('host-1');
            if (s) pms.destroySession(s.hostSessionId);
        });

        jest.advanceTimersByTime(120000);

        expect(svc.getGame(game.pin)).toBeUndefined();
        expect(pms.players.size).toBe(0);
        expect(pms.disconnectTimers.size).toBe(0);
        expect(pms.hostSessions.size).toBe(0);
        expect(pms.deviceToSession.size).toBe(0);
    });
});

describe('submit-answer payload bounds', () => {
    it('rejects an oversized answer array', () => {
        expect(validateSocketEvent('submit-answer', { answer: Array(101).fill(0) }).valid).toBe(false);
        expect(validateSocketEvent('submit-answer', { answer: Array(100).fill(0) }).valid).toBe(true);
    });

    it('rejects an out-of-range or non-integer numeric answer', () => {
        expect(validateSocketEvent('submit-answer', { answer: 1001 }).valid).toBe(false);
        expect(validateSocketEvent('submit-answer', { answer: -1 }).valid).toBe(false);
        expect(validateSocketEvent('submit-answer', { answer: 1.5 }).valid).toBe(false);
        expect(validateSocketEvent('submit-answer', { answer: 3 }).valid).toBe(true);
    });
});

describe('numeric tolerance', () => {
    function score(question, answer) {
        return ScoringService.calculateScore({
            answer,
            question,
            questionType: 'numeric',
            questionStartTime: Date.now(),
            config: CONFIG
        });
    }

    it('honours an explicit tolerance of 0 instead of substituting the default', () => {
        const question = { type: 'numeric', correctAnswer: 10, tolerance: 0, difficulty: 'medium' };
        expect(score(question, 10).isCorrect).toBe(true);
        expect(score(question, 10.5).isCorrect).toBe(false);
    });

    it('reads DEFAULT_TOLERANCE for a question with no tolerance', () => {
        const question = { type: 'numeric', correctAnswer: 10, difficulty: 'medium' };
        const wide = { SCORING: { ...CONFIG.SCORING, DEFAULT_TOLERANCE: 5 } };

        const result = ScoringService.calculateScore({
            answer: 13,
            question,
            questionType: 'numeric',
            questionStartTime: Date.now(),
            config: wide
        });

        expect(result.isCorrect).toBe(true);
    });
});
