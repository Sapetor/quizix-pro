/**
 * @jest-environment jsdom
 *
 * Behavioural tests for the post-game analytics core
 * (public/js/utils/results-viewer/results-analytics.js).
 *
 * Fixtures mirror the shapes actually present in results/*.json:
 *  - modern answers: [{ answer, isCorrect, points, timeMs, ... }]
 *  - legacy answers: [rawValue, ...] (48 player records in the corpus)
 *  - questions carrying correctAnswer | correctAnswers | correctOrder
 *
 * getTranslation() returns the key itself when no language pack is loaded, so
 * translated labels appear verbatim, which is stable to assert on.
 */

import {
    calculateQuestionAnalytics,
    getQuizSummaryStats,
    reconstructQuestionsFromResults
} from '../../public/js/utils/results-viewer/results-analytics.js';

import {
    resolveCorrectAnswerLabel,
    formatAnswerLabel,
    normalizeAnswerRecord
} from '../../public/js/utils/results-viewer/answer-format.js';

const MC_QUESTION = {
    questionNumber: 1,
    text: 'What is the capital of France?',
    type: 'multiple-choice',
    options: ['London', 'Paris', 'Berlin', 'Madrid'],
    correctAnswer: 1,
    difficulty: 'medium',
    concepts: []
};

const TF_QUESTION = {
    questionNumber: 2,
    text: 'The sky is blue',
    type: 'true-false',
    correctAnswer: true,
    difficulty: 'easy'
};

const ORDERING_QUESTION = {
    questionNumber: 3,
    text: 'Order the steps',
    type: 'ordering',
    options: ['Alpha', 'Beta', 'Gamma'],
    correctOrder: [2, 0, 1],
    difficulty: 'hard'
};

const MULTI_QUESTION = {
    questionNumber: 4,
    text: 'Pick the primes',
    type: 'multiple-correct',
    options: ['2', '4', '3', '9'],
    correctAnswers: [0, 2],
    difficulty: 'medium'
};

const UNANSWERED_QUESTION = {
    questionNumber: 5,
    text: 'Nobody reached this one',
    type: 'multiple-choice',
    options: ['Yes', 'No'],
    correctAnswer: 0,
    difficulty: 'easy'
};

/** Build a modern answer record. */
function ans(answer, isCorrect, timeMs = 5000, points = 100) {
    return { answer, isCorrect, points, timeMs, doublePointsUsed: false };
}

describe('formatAnswerLabel', () => {
    test('maps a multiple-choice index to its option text', () => {
        expect(formatAnswerLabel(1, MC_QUESTION)).toBe('Paris');
        expect(formatAnswerLabel(0, MC_QUESTION)).toBe('London');
    });

    test('keeps out-of-range indices legible instead of printing undefined', () => {
        expect(formatAnswerLabel(9, MC_QUESTION)).toBe('9');
    });

    test('renders an ordering answer as an option-text sequence', () => {
        expect(formatAnswerLabel([2, 0, 1], ORDERING_QUESTION)).toBe('Gamma → Alpha → Beta');
    });

    test('renders a multiple-correct answer as comma-separated option text', () => {
        expect(formatAnswerLabel([0, 2], MULTI_QUESTION)).toBe('2, 3');
    });

    test('falls back to the raw value when the question has no options', () => {
        expect(formatAnswerLabel(42, { type: 'numeric' })).toBe('42');
    });

    test('reports a missing answer without printing undefined/null', () => {
        expect(formatAnswerLabel(undefined, MC_QUESTION)).toBe('no_answer');
        expect(formatAnswerLabel(null, MC_QUESTION)).toBe('no_answer');
    });
});

describe('resolveCorrectAnswerLabel', () => {
    test('multiple-choice resolves through the option list', () => {
        expect(resolveCorrectAnswerLabel(MC_QUESTION)).toBe('Paris');
    });

    test('ordering resolves correctOrder, not the absent correctAnswer', () => {
        expect(resolveCorrectAnswerLabel(ORDERING_QUESTION)).toBe('Gamma → Alpha → Beta');
    });

    test('multiple-correct resolves correctAnswers, not the absent correctAnswer', () => {
        expect(resolveCorrectAnswerLabel(MULTI_QUESTION)).toBe('2, 3');
    });

    test('unknown correct answer degrades to an explicit label', () => {
        expect(resolveCorrectAnswerLabel({ type: 'multiple-choice' })).toBe('unknown');
    });
});

describe('calculateQuestionAnalytics — response counting', () => {
    const result = {
        questions: [MC_QUESTION, TF_QUESTION, ORDERING_QUESTION, MULTI_QUESTION, UNANSWERED_QUESTION],
        results: [
            {
                name: 'Ana',
                score: 400,
                answers: [
                    ans(1, true, 4000, 150),
                    ans(true, true, 2000, 120),
                    ans([2, 0, 1], true, 9000, 200),
                    ans([0, 2], true, 6000, 180)
                ]
            },
            {
                name: 'Ben',
                score: 100,
                answers: [
                    ans(0, false, 6000, 0),
                    ans(false, false, 3000, 0),
                    ans([0, 1, 2], false, 12000, 0),
                    ans([0, 1], false, 7000, 0)
                ]
            }
        ]
    };

    test('counts an index-0 answer as a response', () => {
        const analytics = calculateQuestionAnalytics(result);
        // Ben answered option 0 on Q1; a falsy-index answer must not be dropped.
        expect(analytics[0].totalResponses).toBe(2);
        expect(analytics[0].successRate).toBeCloseTo(50, 5);
    });

    test('a question nobody answered is marked unanswered and never flagged', () => {
        const analytics = calculateQuestionAnalytics(result);
        const unanswered = analytics[4];

        expect(unanswered.totalResponses).toBe(0);
        expect(unanswered.unanswered).toBe(true);
        expect(unanswered.isPotentiallyProblematic).toBe(false);
        expect(unanswered.problemFlags).toEqual([]);
    });

    test('records the correct-answer label per question type', () => {
        const analytics = calculateQuestionAnalytics(result);
        expect(analytics[0].correctAnswerLabel).toBe('Paris');
        expect(analytics[2].correctAnswerLabel).toBe('Gamma → Alpha → Beta');
        expect(analytics[3].correctAnswerLabel).toBe('2, 3');
    });

    test('keys wrong answers by option text, not by raw index', () => {
        const analytics = calculateQuestionAnalytics(result);
        expect(analytics[0].commonWrongAnswers).toEqual({ London: 1 });
        expect(analytics[2].commonWrongAnswers).toEqual({ 'Alpha → Beta → Gamma': 1 });
        expect(analytics[3].commonWrongAnswers).toEqual({ '2, 4': 1 });
    });
});

describe('normalizeAnswerRecord', () => {
    test('reads the verdict recorded during the game', () => {
        const record = normalizeAnswerRecord(ans(1, true, 4000, 150));
        expect(record).toEqual({ value: 1, isCorrect: true, points: 150, timeMs: 4000 });
    });

    test('an empty slot is not a response', () => {
        // Players who never reach a question leave a null slot.
        expect(normalizeAnswerRecord(null)).toBeNull();
        expect(normalizeAnswerRecord(undefined)).toBeNull();
    });

    test('a record without timing reports no timing rather than 0s', () => {
        const record = normalizeAnswerRecord({ answer: 1, isCorrect: true, points: 10 });
        expect(record.timeMs).toBeNull();
    });
});

describe('calculateQuestionAnalytics — records without timing', () => {
    const result = {
        questions: [MC_QUESTION],
        results: [
            { name: 'Ana', score: 0, answers: [{ answer: 1, isCorrect: true, points: 10 }] },
            { name: 'Ben', score: 0, answers: [{ answer: 0, isCorrect: false, points: 0 }] }
        ]
    };

    test('counts the responses but reports no average time', () => {
        const analytics = calculateQuestionAnalytics(result);

        expect(analytics[0].totalResponses).toBe(2);
        expect(analytics[0].correctResponses).toBe(1);
        expect(analytics[0].timedResponses).toBe(0);
        expect(analytics[0].averageTime).toBe(0);
    });

    test('does not raise timing-based review flags without timing data', () => {
        const analytics = calculateQuestionAnalytics(result);
        const types = analytics[0].problemFlags.map(f => f.type);
        expect(types).not.toContain('quick_wrong');
        expect(types).not.toContain('time_vs_success');
    });
});

describe('getQuizSummaryStats', () => {
    const answered = {
        questionNumber: 1,
        text: 'Answered',
        successRate: 80,
        averageTime: 5,
        totalResponses: 5,
        timedResponses: 5,
        unanswered: false,
        isPotentiallyProblematic: false
    };
    const alsoAnswered = { ...answered, questionNumber: 2, text: 'Also', successRate: 40 };
    const skipped = {
        questionNumber: 3,
        text: 'Skipped',
        successRate: 0,
        averageTime: 0,
        totalResponses: 0,
        timedResponses: 0,
        unanswered: true,
        isPotentiallyProblematic: false
    };

    test('excludes unanswered questions from the averages', () => {
        const summary = getQuizSummaryStats([answered, alsoAnswered, skipped]);
        expect(summary.avgSuccessRate).toBeCloseTo(60, 5);
        expect(summary.avgTime).toBeCloseTo(5, 5);
        expect(summary.answeredQuestions).toBe(2);
        expect(summary.totalQuestions).toBe(3);
    });

    test('excludes unanswered questions from hardest/easiest', () => {
        const summary = getQuizSummaryStats([answered, alsoAnswered, skipped]);
        expect(summary.hardestQuestion.number).toBe(2);
        expect(summary.easiestQuestion.number).toBe(1);
    });

    test('an all-unanswered quiz yields no hardest/easiest instead of crashing', () => {
        const summary = getQuizSummaryStats([skipped]);
        expect(summary.hardestQuestion).toBeNull();
        expect(summary.easiestQuestion).toBeNull();
        expect(summary.avgSuccessRate).toBe(0);
    });
});

describe('client/server answer formatting parity', () => {
    // answer-format.js (browser, ESM) and ResultsService (server, CommonJS)
    // format the same saved answers for the modal and for CSV export. They
    // cannot share a module across the two runtimes, so this pins them together.
    // Only cases with no translated text are compared: the "missing answer"
    // placeholder is a translation key on the client and a literal on the server.
    const { ResultsService } = require('../../services/results-service.js');
    const service = new ResultsService({ debug() {}, info() {}, error() {}, warn() {} });

    const cases = [
        ['multiple-choice index', 1, MC_QUESTION],
        ['out-of-range index', 9, MC_QUESTION],
        ['ordering sequence', [2, 0, 1], ORDERING_QUESTION],
        ['multiple-correct set', [0, 2], MULTI_QUESTION],
        ['numeric literal', 42, { type: 'numeric' }]
    ];

    test.each(cases)('%s formats identically on both sides', (_label, value, question) => {
        expect(formatAnswerLabel(value, question)).toBe(service._formatAnswerValue(value, question));
    });

    test.each([
        ['multiple-choice', MC_QUESTION],
        ['ordering', ORDERING_QUESTION],
        ['multiple-correct', MULTI_QUESTION]
    ])('%s correct answer resolves identically on both sides', (_label, question) => {
        expect(resolveCorrectAnswerLabel(question)).toBe(service._formatCorrectAnswer(question));
    });
});

describe('reconstructQuestionsFromResults', () => {
    const results = [
        { name: 'Ana', answers: [ans('Paris', true, 3000, 120), ans('Rome', false, 4000, 0)] },
        { name: 'Ben', answers: [ans('Lyon', false, 5000, 0), ans('Berlin', true, 2000, 140)] }
    ];

    test('infers each correct answer from the graded answer records', () => {
        const questions = reconstructQuestionsFromResults(results);
        expect(questions).toHaveLength(2);
        expect(questions[0].correctAnswer).toBe('Paris');
        expect(questions[1].correctAnswer).toBe('Berlin');
        expect(questions[0].reconstructed).toBe(true);
    });

    test('returns an empty list when there is nothing to reconstruct from', () => {
        expect(reconstructQuestionsFromResults([])).toEqual([]);
        expect(reconstructQuestionsFromResults(null)).toEqual([]);
    });
});
