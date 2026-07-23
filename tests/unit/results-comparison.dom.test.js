/**
 * @jest-environment jsdom
 *
 * Characterization tests for the comparison modal builders extracted from
 * results-viewer.js into results-viewer/results-comparison.js. These pin the
 * moved HTML shape (rows, checked-state, escaping, trend formatting) so the
 * mechanical extraction stays behaviour-preserving.
 *
 * getTranslation() returns the key itself when no language pack is loaded, so
 * translated labels appear verbatim (e.g. "compare_btn"), which is stable.
 */

import {
    createComparisonSelectorModal,
    createSessionSelectorModal,
    createComparisonResultsModal
} from '../../public/js/utils/results-viewer/results-comparison.js';

describe('createComparisonSelectorModal', () => {
    const quizzes = [
        { title: 'Algebra', sessionCount: 3, totalParticipants: 42 },
        { title: 'Geometry', sessionCount: 2, totalParticipants: 30 }
    ];

    test('renders one row per quiz with meta and compare button', () => {
        const modal = createComparisonSelectorModal(quizzes);
        expect(modal.id).toBe('comparison-selector-modal');
        expect(modal.className).toBe('modal-overlay');

        const items = modal.querySelectorAll('.comparison-quiz-item');
        expect(items).toHaveLength(2);

        const first = items[0];
        expect(first.dataset.quizTitle).toBe('Algebra');
        expect(first.querySelector('.quiz-title').textContent).toBe('Algebra');
        expect(first.querySelector('.quiz-meta').textContent)
            .toContain('3 compare_sessions_count | 42 compare_total_participants');
        expect(first.querySelector('.compare-btn')).not.toBeNull();
    });

    test('escapes quiz titles in both attribute and text', () => {
        const modal = createComparisonSelectorModal([
            { title: '<img src=x onerror=alert(1)>', sessionCount: 1, totalParticipants: 5 }
        ]);
        // No live <img> element injected via the title
        expect(modal.querySelector('img')).toBeNull();
        expect(modal.innerHTML).toContain('&lt;img');
    });
});

describe('createSessionSelectorModal', () => {
    const quiz = {
        sessions: [
            { filename: 's1.json', saved: '2026-01-01', gamePin: '111', participantCount: 4 },
            { filename: 's2.json', saved: '2026-01-02', gamePin: '222', participantCount: 5 },
            { filename: 's3.json', saved: '2026-01-03', gamePin: '333', participantCount: 6 },
            { filename: 's4.json', saved: '2026-01-04', gamePin: '444', participantCount: 7 }
        ]
    };

    test('renders a checkbox per session, first three pre-checked', () => {
        const modal = createSessionSelectorModal('Algebra', quiz);
        expect(modal.id).toBe('session-selector-modal');

        const boxes = modal.querySelectorAll('input[type="checkbox"]');
        expect(boxes).toHaveLength(4);
        expect(boxes[0].checked).toBe(true);
        expect(boxes[1].checked).toBe(true);
        expect(boxes[2].checked).toBe(true);
        expect(boxes[3].checked).toBe(false);
        expect(boxes[0].value).toBe('s1.json');

        expect(modal.querySelector('#run-comparison-btn')).not.toBeNull();
    });

    test('falls back to results length then 0 for participant count', () => {
        const modal = createSessionSelectorModal('Q', {
            sessions: [
                { filename: 'a.json', saved: '2026-01-01', gamePin: '1', results: [{}, {}] },
                { filename: 'b.json', saved: '2026-01-02', gamePin: '2' }
            ]
        });
        const metas = modal.querySelectorAll('.session-meta');
        expect(metas[0].textContent).toContain('2 ');
        expect(metas[1].textContent).toContain('0 ');
    });
});

describe('createComparisonResultsModal', () => {
    const base = {
        sessionCount: 3,
        averageParticipants: 12,
        overallTrend: 4.25,
        mostImproved: { questionNumber: 2, trend: 8.4 },
        mostDeclined: { questionNumber: 5, trend: -3.1 }
    };

    test('improving trend shows up arrow and formatted insights', () => {
        const modal = createComparisonResultsModal('Algebra', { ...base, trendDirection: 'improving' });
        expect(modal.id).toBe('comparison-results-modal');
        expect(modal.innerHTML).toContain('📈');

        const insights = modal.querySelector('.comparison-insights');
        expect(insights.textContent).toContain('Q2 (+8.4%)');
        expect(insights.textContent).toContain('Q5 (-3.1%)');
        // trend value formatted with sign + one decimal
        expect(modal.innerHTML).toContain('(+4.3%)');
    });

    test('declining trend shows down arrow', () => {
        const modal = createComparisonResultsModal('Q', { ...base, trendDirection: 'declining' });
        expect(modal.innerHTML).toContain('📉');
    });

    test('stable trend with no insights shows fallback message', () => {
        const modal = createComparisonResultsModal('Q', {
            sessionCount: 1,
            averageParticipants: 3,
            overallTrend: 0,
            trendDirection: 'stable',
            mostImproved: null,
            mostDeclined: null
        });
        expect(modal.innerHTML).toContain('➡️');
        expect(modal.querySelector('.comparison-insights').textContent)
            .toContain('compare_stable_performance');
    });

    test('escapes the quiz title in the header', () => {
        const modal = createComparisonResultsModal('<b>x</b>', { ...base, trendDirection: 'stable' });
        expect(modal.querySelector('.modal-header b')).toBeNull();
        expect(modal.innerHTML).toContain('&lt;b&gt;x&lt;/b&gt;');
    });

    test('exposes chart canvas and export button for facade wiring', () => {
        const modal = createComparisonResultsModal('Q', { ...base, trendDirection: 'improving' });
        expect(modal.querySelector('#comparison-chart')).not.toBeNull();
        expect(modal.querySelector('#export-comparison-pdf')).not.toBeNull();
        expect(modal.querySelectorAll('[data-action="close-comparison"]')).toHaveLength(2);
    });
});
