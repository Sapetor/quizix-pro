/**
 * @jest-environment jsdom
 */

/**
 * Reordering questions from the editor sidebar.
 *
 * The editor has no question array — the DOM is the model (see
 * question-sidebar.js). So a reorder is a node move inside
 * #questions-container, and every derived view re-reads document order.
 *
 * The two things worth testing hard:
 *  1. dropGapToFinalIndex — the classic off-by-one. A drop "gap" is measured
 *     against the list WITH the dragged row still in it; the final index is
 *     measured against the list WITHOUT it.
 *  2. moveQuestion — that it moves the right node, renumbers, keeps the user
 *     editing the question they dragged, and (critically) schedules an
 *     autosave, since a node move fires no `input` event.
 */

import {
    moveQuestion,
    dropGapToFinalIndex
} from '../../public/js/ui/question-sidebar.js';
import { dom } from '../../public/js/utils/dom.js';

function buildEditorDom(count = 4) {
    const questions = Array.from({ length: count }, (_, i) => `
        <div class="question-item${i === 0 ? ' active-question' : ''}" data-question="${i}">
            <h3><span data-translate="question">Question</span> ${i + 1}</h3>
            <button class="btn-remove"></button>
            <input class="question-text" value="Q${i}">
            <select class="question-type"><option value="multiple-choice" selected>mc</option></select>
            <select class="question-difficulty"><option value="medium" selected>m</option></select>
            <input class="question-time-limit" value="${30 + i}">
        </div>`).join('');

    document.body.innerHTML = `
        <nav class="question-sidebar" id="question-sidebar"></nav>
        <div id="questions-container">${questions}</div>
    `;
}

/** Current question order, read the way every consumer reads it. */
function order() {
    return Array.from(document.querySelectorAll('#questions-container .question-item'))
        .map(el => el.querySelector('.question-text').value);
}

let scheduleAutoSave;
let updateQuestionsUI;
let shown;

beforeEach(() => {
    buildEditorDom();
    // dom.get caches by id; the fixture replaces body every test, so without
    // this the module would hold a detached #questions-container.
    dom.clearCache();
    scheduleAutoSave = jest.fn();
    updateQuestionsUI = jest.fn();
    shown = [];
    window.game = { quizManager: { scheduleAutoSave, updateQuestionsUI } };
    window.showQuestion = jest.fn(i => shown.push(i));
});

afterEach(() => {
    delete window.game;
    delete window.showQuestion;
});

describe('dropGapToFinalIndex', () => {
    // Dragging DOWN: the gap index counts the dragged row itself, so the
    // final index is one less.
    test('gap below the dragged row loses one slot', () => {
        expect(dropGapToFinalIndex(3, 0)).toBe(2);
        expect(dropGapToFinalIndex(4, 1)).toBe(3);
    });

    // Dragging UP: nothing has shifted above the row, so the gap IS the index.
    test('gap above the dragged row is unchanged', () => {
        expect(dropGapToFinalIndex(0, 3)).toBe(0);
        expect(dropGapToFinalIndex(1, 2)).toBe(1);
    });

    // Both gaps that touch the row itself mean "stay put".
    test('the two no-op gaps both resolve to the original index', () => {
        expect(dropGapToFinalIndex(2, 2)).toBe(2);
        expect(dropGapToFinalIndex(3, 2)).toBe(2);
    });
});

describe('moveQuestion', () => {
    test('moves a question down to the requested final index', () => {
        moveQuestion(0, 2);
        expect(order()).toEqual(['Q1', 'Q2', 'Q0', 'Q3']);
    });

    test('moves a question up to the requested final index', () => {
        moveQuestion(3, 0);
        expect(order()).toEqual(['Q3', 'Q0', 'Q1', 'Q2']);
    });

    test('moving to the last index appends', () => {
        moveQuestion(1, 3);
        expect(order()).toEqual(['Q0', 'Q2', 'Q3', 'Q1']);
    });

    test('renumbers and schedules an autosave (a node move fires no input)', () => {
        moveQuestion(0, 2);
        expect(updateQuestionsUI).toHaveBeenCalled();
        expect(scheduleAutoSave).toHaveBeenCalled();
    });

    test('keeps the user editing the question they moved', () => {
        moveQuestion(0, 2);
        expect(shown).toEqual([2]);
    });

    test('a no-op move changes nothing and does not autosave', () => {
        moveQuestion(2, 2);
        expect(order()).toEqual(['Q0', 'Q1', 'Q2', 'Q3']);
        expect(scheduleAutoSave).not.toHaveBeenCalled();
    });

    test('out-of-range indices are ignored', () => {
        moveQuestion(-1, 2);
        moveQuestion(0, 99);
        moveQuestion(9, 0);
        expect(order()).toEqual(['Q0', 'Q1', 'Q2', 'Q3']);
        expect(scheduleAutoSave).not.toHaveBeenCalled();
    });

    test('preserves live DOM state rather than re-creating nodes', () => {
        // A reorder must not clone/rebuild questions: that would drop the
        // radio-group names and any unsaved field state.
        const moved = document.querySelectorAll('.question-item')[0];
        moved.querySelector('.question-text').value = 'edited in place';
        moveQuestion(0, 3);
        const after = document.querySelectorAll('.question-item')[3];
        expect(after).toBe(moved);
        expect(after.querySelector('.question-text').value).toBe('edited in place');
    });
});
