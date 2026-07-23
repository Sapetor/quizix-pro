/**
 * Game ↔ ScoringService Parity Tests
 *
 * Characterization tests that pin the server-side scoring behaviour of the
 * `Game` class against the centralized `ScoringService`. Written before the
 * game.js scoring forks were consolidated onto ScoringService; they must stay
 * green both before and after the refactor.
 *
 * Covers the three known duplications:
 *   1. Game.lockConsensus team-points block  ↔ ScoringService.calculateConsensusTeamPoints
 *   2. Game.getCorrectAnswerKey              ↔ ScoringService.getCorrectAnswerKey
 *   3. Game.getScoringInfoForQuestion mult.  ↔ ScoringService.getDifficultyMultiplier
 */

const { ScoringService } = require('../../services/scoring-service');
const { Game } = require('../../services/game');

const CONFIG = {
    SCORING: {
        BASE_POINTS: 100,
        MAX_BONUS_TIME: 10000,
        TIME_BONUS_DIVISOR: 10,
        DIFFICULTY_MULTIPLIERS: { easy: 1, medium: 2, hard: 3 },
        DEFAULT_NUMERIC_TOLERANCE: 0.1
    },
    TIMING: {
        DEFAULT_QUESTION_TIME: 20
    }
};

const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

function makeGame(quizOverrides = {}, scoringConfig = null) {
    const quiz = {
        title: 'Parity Test',
        consensusMode: true,
        consensusThreshold: '66',
        questions: [],
        ...quizOverrides
    };
    if (scoringConfig) quiz.scoringConfig = scoringConfig;
    return new Game('host-1', quiz, mockLogger, CONFIG);
}

// ─── Fork 2: getCorrectAnswerKey parity ─────────────────────────────────────

describe('Game.getCorrectAnswerKey ↔ ScoringService.getCorrectAnswerKey', () => {
    const game = makeGame();

    const questions = [
        // multiple-choice with correctIndex
        { type: 'multiple-choice', correctIndex: 2, correctAnswer: 9 },
        // multiple-choice with only correctAnswer (correctIndex undefined)
        { type: 'multiple-choice', correctAnswer: 3 },
        // multiple-correct with correctIndices
        { type: 'multiple-correct', correctIndices: [0, 2], correctAnswers: [1, 3] },
        // multiple-correct with only correctAnswers
        { type: 'multiple-correct', correctAnswers: [1, 3] },
        // multiple-correct with neither → []
        { type: 'multiple-correct' },
        // true-false
        { type: 'true-false', correctAnswer: true },
        // numeric
        { type: 'numeric', correctAnswer: 42 },
        // ordering with correctOrder
        { type: 'ordering', correctOrder: [2, 1, 0] },
        // ordering with none → []
        { type: 'ordering' },
        // missing type → defaults to multiple-choice branch
        { correctIndex: 1, correctAnswer: 5 },
        // unknown type → default branch returns correctAnswer
        { type: 'legendary', correctAnswer: 7 }
    ];

    questions.forEach((question, i) => {
        test(`case ${i}: type=${question.type ?? '(none)'} matches service`, () => {
            const expected = ScoringService.getCorrectAnswerKey(
                question,
                question.type || 'multiple-choice'
            );
            expect(game.getCorrectAnswerKey(question)).toEqual(expected);
        });
    });
});

// ─── Fork 3: getScoringInfoForQuestion difficulty multiplier parity ──────────

describe('Game.getScoringInfoForQuestion ↔ ScoringService.getDifficultyMultiplier', () => {
    const scenarios = [
        { name: 'easy default', difficulty: 'easy', scoringConfig: null },
        { name: 'medium default', difficulty: 'medium', scoringConfig: null },
        { name: 'hard default', difficulty: 'hard', scoringConfig: null },
        { name: 'missing difficulty', difficulty: undefined, scoringConfig: null },
        { name: 'invalid difficulty', difficulty: 'legendary', scoringConfig: null },
        {
            name: 'full custom override',
            difficulty: 'easy',
            scoringConfig: { difficultyMultipliers: { easy: 5, medium: 10, hard: 15 } }
        },
        {
            name: 'partial custom (falls back to default)',
            difficulty: 'hard',
            scoringConfig: { difficultyMultipliers: { easy: 9 } }
        },
        {
            name: 'custom with invalid difficulty (falls back to 2)',
            difficulty: 'legendary',
            scoringConfig: { difficultyMultipliers: { easy: 9 } }
        }
    ];

    scenarios.forEach(({ name, difficulty, scoringConfig }) => {
        test(name, () => {
            const game = makeGame({}, scoringConfig);
            const question = { type: 'multiple-choice', difficulty };
            const info = game.getScoringInfoForQuestion(question);

            const expectedMult = ScoringService.getDifficultyMultiplier(
                difficulty,
                CONFIG.SCORING.DIFFICULTY_MULTIPLIERS,
                scoringConfig?.difficultyMultipliers
            );

            expect(info.difficultyMultiplier).toBe(expectedMult);
            expect(info.basePoints).toBe(CONFIG.SCORING.BASE_POINTS * expectedMult);
        });
    });
});

// ─── Fork 1: lockConsensus team points parity ───────────────────────────────

describe('Game.lockConsensus team points ↔ ScoringService.calculateConsensusTeamPoints', () => {
    const cases = [
        // Unanimous correct, each difficulty
        { name: 'unanimous correct, easy', difficulty: 'easy', correctIndex: 1, proposals: [1, 1] },
        { name: 'unanimous correct, medium', difficulty: 'medium', correctIndex: 1, proposals: [1, 1] },
        { name: 'unanimous correct, hard', difficulty: 'hard', correctIndex: 1, proposals: [1, 1] },
        { name: 'unanimous correct, missing difficulty', difficulty: undefined, correctIndex: 1, proposals: [1, 1] },
        // 75% correct (3 of 4) → 1.2x
        { name: '75% correct, medium', difficulty: 'medium', correctIndex: 1, proposals: [1, 1, 1, 0] },
        // 66% correct (2 of 3) → threshold met, <75 → 1.0x
        { name: '~66% correct, hard', difficulty: 'hard', correctIndex: 1, proposals: [1, 1, 0] },
        // consensus reached but on WRONG answer → 0
        { name: 'unanimous wrong, medium', difficulty: 'medium', correctIndex: 1, proposals: [0, 0] },
        // no consensus (below threshold) → 0
        { name: 'no consensus, medium', difficulty: 'medium', correctIndex: 1, proposals: [0, 1, 2] }
    ];

    cases.forEach(({ name, difficulty, correctIndex, proposals }) => {
        test(name, () => {
            const game = makeGame({
                questions: [
                    { type: 'multiple-choice', options: ['A', 'B', 'C', 'D'], correctIndex, difficulty, timeLimit: 20 }
                ]
            });
            proposals.forEach((_, idx) => game.addPlayer(`p${idx}`, `Player${idx}`));
            game.currentQuestion = 0;
            game.gameState = 'question';
            proposals.forEach((answer, idx) => game.submitProposal(`p${idx}`, answer));

            const result = game.lockConsensus();

            const expectedPoints = ScoringService.calculateConsensusTeamPoints({
                isCorrect: result.isCorrect,
                consensusPercent: result.percentage,
                difficulty,
                config: CONFIG
            });

            expect(result.teamPoints).toBe(expectedPoints);
        });
    });

    test('teamScore accumulates the same points lockConsensus returns', () => {
        const game = makeGame({
            questions: [
                { type: 'multiple-choice', options: ['A', 'B'], correctIndex: 0, difficulty: 'hard', timeLimit: 20 }
            ]
        });
        game.addPlayer('a', 'A');
        game.addPlayer('b', 'B');
        game.currentQuestion = 0;
        game.gameState = 'question';
        game.submitProposal('a', 0);
        game.submitProposal('b', 0);

        const result = game.lockConsensus();
        // hard=3 → base=300, unanimous → 1.5x → 450
        expect(result.teamPoints).toBe(450);
        expect(game.teamScore).toBe(450);
        expect(result.totalTeamScore).toBe(450);
    });
});
