/**
 * @jest-environment jsdom
 *
 * DOM behaviour of the analytics modal builders: what an educator actually sees
 * for unanswered questions, index-based answers, and tab switching while a
 * second modal is open.
 *
 * getTranslation() returns the key itself when no language pack is loaded.
 */

import {
    calculateQuestionAnalytics,
    getQuizSummaryStats,
    createAnalyticsModal,
    createQuestionDrilldownModal,
    switchAnalyticsTab
} from '../../public/js/utils/results-viewer/results-analytics.js';

const QUESTION = {
    questionNumber: 1,
    text: 'What is the capital of France?',
    type: 'multiple-choice',
    options: ['London', 'Paris', 'Berlin', 'Madrid'],
    correctAnswer: 1,
    difficulty: 'medium'
};

const UNANSWERED = {
    questionNumber: 2,
    text: 'Never reached',
    type: 'multiple-choice',
    options: ['Yes', 'No'],
    correctAnswer: 0,
    difficulty: 'easy'
};

const RESULT = {
    filename: 'results_123456_1704067200000.json',
    quizTitle: 'Geography',
    questions: [QUESTION, UNANSWERED],
    results: [
        { name: 'Ana', score: 100, answers: [{ answer: 1, isCorrect: true, points: 100, timeMs: 4000 }] },
        { name: 'Ben', score: 0, answers: [{ answer: 0, isCorrect: false, points: 0, timeMs: 6000 }] }
    ]
};

afterEach(() => {
    document.body.innerHTML = '';
});

describe('createAnalyticsModal', () => {
    function build(result = RESULT) {
        const analytics = calculateQuestionAnalytics(result);
        const summary = getQuizSummaryStats(analytics);
        return createAnalyticsModal(result, analytics, summary);
    }

    test('marks the unanswered question instead of showing 0.0%', () => {
        const modal = build();
        const items = modal.querySelectorAll('.question-analytics-item');

        expect(items).toHaveLength(2);
        expect(items[0].querySelector('.success-rate').textContent).toBe('50.0%');

        const skipped = items[1];
        expect(skipped.classList.contains('unanswered')).toBe(true);
        expect(skipped.querySelector('.success-rate').textContent).toBe('analytics_unanswered');
        expect(skipped.textContent).not.toContain('0.0%');
    });

    test('the unanswered question is not counted as needing review', () => {
        const analytics = calculateQuestionAnalytics(RESULT);
        const summary = getQuizSummaryStats(analytics);
        const modal = createAnalyticsModal(RESULT, analytics, summary);

        const reviewCard = [...modal.querySelectorAll('.stat-card')]
            .find(card => card.textContent.includes('analytics_questions_need_review'));
        expect(reviewCard.querySelector('.stat-value').textContent).toBe('0');
    });

    test('renders without a hardest/easiest question when nothing was answered', () => {
        const emptyResult = {
            ...RESULT,
            results: [{ name: 'Ana', score: 0, answers: [] }]
        };
        const analytics = calculateQuestionAnalytics(emptyResult);
        const summary = getQuizSummaryStats(analytics);

        // The previous build read summary.hardestQuestion.number unconditionally.
        expect(() => createAnalyticsModal(emptyResult, analytics, summary)).not.toThrow();
    });

    test('escapes the quiz title', () => {
        const modal = build({ ...RESULT, quizTitle: '<img src=x onerror=alert(1)>' });
        expect(modal.querySelector('img')).toBeNull();
        expect(modal.innerHTML).toContain('&lt;img');
    });
});

describe('switchAnalyticsTab', () => {
    test('does not deactivate tab panels belonging to another modal', () => {
        const analytics = calculateQuestionAnalytics(RESULT);
        const summary = getQuizSummaryStats(analytics);
        const modal = createAnalyticsModal(RESULT, analytics, summary);
        document.body.appendChild(modal);

        // A second, unrelated modal that also uses .tab-content
        const other = document.createElement('div');
        other.className = 'modal-overlay';
        other.innerHTML = '<div class="tab-content active" id="other-tab">other</div>';
        document.body.appendChild(other);

        const questionsBtn = [...modal.querySelectorAll('.analytics-tabs .tab-btn')]
            .find(btn => btn.dataset.tab === 'questions');
        questionsBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
        switchAnalyticsTab({ currentTarget: questionsBtn }, 'questions');

        expect(modal.querySelector('#questions-tab').classList.contains('active')).toBe(true);
        expect(modal.querySelector('#overview-tab').classList.contains('active')).toBe(false);
        expect(other.querySelector('#other-tab').classList.contains('active')).toBe(true);
    });
});

describe('createQuestionDrilldownModal', () => {
    test('shows option text and flags the correct row', () => {
        const analytics = calculateQuestionAnalytics(RESULT);
        const playerAnswers = RESULT.results.map(p => p.answers[0]);
        const modal = createQuestionDrilldownModal(analytics[0], QUESTION, playerAnswers);

        const rows = [...modal.querySelectorAll('.answer-dist-row')];
        const labels = rows.map(r => r.querySelector('.answer-text').textContent);
        expect(labels).toEqual(expect.arrayContaining(['Paris', 'London']));
        expect(labels).not.toContain('1');

        const parisRow = rows.find(r => r.querySelector('.answer-text').textContent === 'Paris');
        expect(parisRow.querySelector('.answer-text').classList.contains('correct')).toBe(true);
        expect(parisRow.querySelector('.answer-bar').classList.contains('correct')).toBe(true);

        const londonRow = rows.find(r => r.querySelector('.answer-text').textContent === 'London');
        expect(londonRow.querySelector('.answer-bar').classList.contains('incorrect')).toBe(true);
    });

    test('names the correct answer for an ordering question', () => {
        const orderingQuestion = {
            questionNumber: 1,
            text: 'Order these',
            type: 'ordering',
            options: ['Alpha', 'Beta', 'Gamma'],
            correctOrder: [2, 0, 1]
        };
        const result = {
            questions: [orderingQuestion],
            results: [{ name: 'Ana', answers: [{ answer: [0, 1, 2], isCorrect: false, points: 0, timeMs: 9000 }] }]
        };
        const analytics = calculateQuestionAnalytics(result);
        const modal = createQuestionDrilldownModal(
            analytics[0], orderingQuestion, [result.results[0].answers[0]]
        );

        expect(modal.querySelector('.drilldown-correct-value').textContent)
            .toBe('Gamma → Alpha → Beta');
        expect(modal.querySelector('.answer-text').textContent).toBe('Alpha → Beta → Gamma');
    });

    test('omits the time distribution when no answer carries timing', () => {
        const untimed = { answer: 1, isCorrect: true, points: 10 };
        const untimedResult = {
            questions: [QUESTION],
            results: [{ name: 'Ana', answers: [untimed] }]
        };
        const analytics = calculateQuestionAnalytics(untimedResult);
        const modal = createQuestionDrilldownModal(analytics[0], QUESTION, [untimed]);

        expect(modal.textContent).not.toContain('analytics_response_time_dist');
        expect(modal.querySelector('.answer-text').textContent).toBe('Paris');
    });
});
