/**
 * End Round (host force-end) in consensus mode must lock consensus first,
 * so the round's team points are awarded exactly as the Lock Consensus
 * button would award them. Uses a real Game so the award comes from
 * Game.lockConsensus, not a mock.
 */

jest.mock('../../services/atomic-write', () => ({
    atomicWriteFile: jest.fn().mockResolvedValue(undefined)
}));

const { Game } = require('../../services/game');
const { QuestionFlowService } = require('../../services/question-flow-service');

const CONFIG = {
    SCORING: {
        BASE_POINTS: 100,
        MAX_BONUS_TIME: 10000,
        TIME_BONUS_DIVISOR: 10,
        DIFFICULTY_MULTIPLIERS: { easy: 1, medium: 2, hard: 3 },
        DEFAULT_NUMERIC_TOLERANCE: 0.1
    },
    TIMING: { DEFAULT_QUESTION_TIME: 20 }
};

const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

function consensusGame() {
    const game = new Game('host-1', {
        title: 'Consensus Quiz',
        consensusMode: true,
        consensusThreshold: '66',
        questions: [{
            type: 'multiple-choice',
            options: ['A', 'B', 'C', 'D'],
            correctAnswer: 1,
            correctIndex: 1,
            difficulty: 'easy',
            timeLimit: 20
        }]
    }, logger, CONFIG, { MAX_PLAYERS_PER_GAME: 200 });
    game.currentQuestion = 0;
    game.gameState = 'question';
    game.addPlayer('p1', 'A');
    game.addPlayer('p2', 'B');
    game.submitProposal('p1', 1);
    game.submitProposal('p2', 1);
    return game;
}

function createIO() {
    const io = { emit: jest.fn() };
    io.to = jest.fn(() => io);
    return io;
}

function emitted(io, event) {
    return io.emit.mock.calls.filter(([name]) => name === event);
}

describe('End Round in consensus mode', () => {
    let service;

    beforeEach(() => {
        jest.useFakeTimers();
        service = new QuestionFlowService(logger, { advanceToNextQuestion: jest.fn() });
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    test('host End Round locks consensus and awards team points', () => {
        const game = consensusGame();
        const expectedPoints = consensusGame().lockConsensus().teamPoints;
        expect(expectedPoints).toBeGreaterThan(0);
        const io = createIO();

        service.endQuestionEarly(game, io, 'host');

        expect(game.consensusLocked).toBe(true);
        expect(game.teamScore).toBe(expectedPoints);
        expect(emitted(io, 'consensus-reached')).toHaveLength(1);
        expect(emitted(io, 'team-score-update')).toHaveLength(1);
        expect(emitted(io, 'team-score-update')[0][1]).toEqual(expect.objectContaining({
            teamScore: expectedPoints,
            questionPoints: expectedPoints,
            isCorrect: true
        }));

        // Lock is announced before the answer reveal
        jest.advanceTimersByTime(1000);
        const names = io.emit.mock.calls.map(([name]) => name);
        expect(names.indexOf('consensus-reached')).toBeLessThan(names.indexOf('question-timeout'));
    });

    test('host End Round after Lock Consensus does not award twice', () => {
        const game = consensusGame();
        const io = createIO();
        const first = game.lockConsensus();
        const scoreAfterLock = game.teamScore;
        expect(first.teamPoints).toBeGreaterThan(0);

        service.endQuestionEarly(game, io, 'host');
        jest.advanceTimersByTime(1000);

        expect(game.teamScore).toBe(scoreAfterLock);
        expect(emitted(io, 'consensus-reached')).toHaveLength(0);
        expect(emitted(io, 'team-score-update')).toHaveLength(0);
    });

    test('a duplicate End Round call does not award twice', () => {
        const game = consensusGame();
        const io = createIO();

        service.endQuestionEarly(game, io, 'host');
        const scoreAfterFirst = game.teamScore;
        service.endQuestionEarly(game, io, 'host');
        jest.advanceTimersByTime(1000);

        expect(game.teamScore).toBe(scoreAfterFirst);
        expect(emitted(io, 'consensus-reached')).toHaveLength(1);
    });

    test('all-answered early end in consensus mode does not lock consensus', () => {
        const game = consensusGame();
        const io = createIO();

        service.endQuestionEarly(game, io);
        jest.advanceTimersByTime(1000);

        expect(game.consensusLocked).toBe(false);
        expect(game.teamScore).toBe(0);
        expect(emitted(io, 'consensus-reached')).toHaveLength(0);
        expect(emitted(io, 'question-timeout')).toHaveLength(1);
    });

    test('End Round outside consensus mode emits no consensus events', () => {
        const game = consensusGame();
        game.isConsensusMode = false;
        const io = createIO();

        service.endQuestionEarly(game, io, 'host');
        jest.advanceTimersByTime(1000);

        expect(game.teamScore).toBe(0);
        expect(emitted(io, 'consensus-reached')).toHaveLength(0);
        expect(emitted(io, 'question-timeout')).toHaveLength(1);
    });
});
