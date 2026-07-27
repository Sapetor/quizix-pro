/**
 * @jest-environment jsdom
 *
 * ModalFeedback — submission/result hand-off (public/js/utils/modal-feedback.js).
 *
 * The submission confirmation and the result share one overlay
 * (#feedback-modal-overlay). With few players the round ends ~1.1s after the
 * last answer, so rendering the confirmation immediately produced two different
 * modals flashing back-to-back in the same overlay.
 *
 * Invariant under test: the confirmation modal is either never rendered (a
 * result claimed the overlay first) or it holds the overlay long enough to be
 * read before the result replaces it.
 */

import { ModalFeedback, SUBMISSION_DEFER_MS, SUBMISSION_MIN_VISIBLE_MS } from '../../public/js/utils/modal-feedback.js';

function buildModalDom() {
    document.body.innerHTML = `
        <div id="feedback-modal-overlay">
            <div id="feedback-modal" class="feedback-modal">
                <div id="feedback-icon"></div>
                <div id="modal-feedback-text"></div>
                <div id="modal-score-display"></div>
                <div id="modal-explanation"></div>
                <div id="modal-player-answer"></div>
            </div>
        </div>
    `;
}

let mf;

beforeEach(() => {
    jest.useFakeTimers();
    buildModalDom();
    mf = new ModalFeedback();
});

afterEach(() => {
    mf.destroy();
    jest.clearAllTimers();
    jest.useRealTimers();
});

const modalClasses = () => document.getElementById('feedback-modal').className;
const isOverlayOpen = () => document.getElementById('feedback-modal-overlay').classList.contains('active');

describe('ModalFeedback — submission modal deferral', () => {
    test('renders the confirmation only after the defer window', () => {
        mf.showSubmission('Answer submitted: B');

        expect(isOverlayOpen()).toBe(false);

        jest.advanceTimersByTime(SUBMISSION_DEFER_MS);

        expect(isOverlayOpen()).toBe(true);
        expect(modalClasses()).toContain('submission');
        expect(document.getElementById('modal-feedback-text').textContent).toBe('Answer submitted: B');
    });

    test('a result inside the defer window replaces the confirmation entirely', () => {
        mf.showSubmission('Answer submitted: B');
        jest.advanceTimersByTime(SUBMISSION_DEFER_MS - 200);

        mf.showIncorrect('Incorrect!', 0, 4000);

        // Result is on screen immediately, styled as a result...
        expect(isOverlayOpen()).toBe(true);
        expect(modalClasses()).toContain('incorrect');
        expect(modalClasses()).not.toContain('submission');

        // ...and the cancelled confirmation never fires afterwards.
        jest.advanceTimersByTime(2000);
        expect(modalClasses()).not.toContain('submission');
    });

    test('a result arriving just after the confirmation waits out the minimum visible time', () => {
        mf.showSubmission('Answer submitted: B');
        jest.advanceTimersByTime(SUBMISSION_DEFER_MS);
        expect(modalClasses()).toContain('submission');

        jest.advanceTimersByTime(100);
        mf.showCorrect('Correct!', 100, 4000);

        // Still the confirmation — the result must not flash it away.
        expect(modalClasses()).toContain('submission');
        expect(modalClasses()).not.toContain('correct');

        jest.advanceTimersByTime(SUBMISSION_MIN_VISIBLE_MS - 100);
        expect(modalClasses()).toContain('correct');
        expect(modalClasses()).not.toContain('submission');
    });

    test('showPartial is gated by the same minimum visible time', () => {
        mf.showSubmission('Answer submitted: A, B');
        jest.advanceTimersByTime(SUBMISSION_DEFER_MS + 100);

        mf.showPartial('Partially Correct!', 50, 4000, null, 0.5);
        expect(modalClasses()).toContain('submission');

        jest.advanceTimersByTime(SUBMISSION_MIN_VISIBLE_MS);
        expect(modalClasses()).toContain('partial');
    });

    test('dismissing the confirmation does not swallow a result that is waiting on it', () => {
        mf.showSubmission('Answer submitted: B');
        jest.advanceTimersByTime(SUBMISSION_DEFER_MS);

        mf.showCorrect('Correct!', 100, 4000); // deferred behind the confirmation
        mf.hide();                             // player taps the overlay away

        jest.advanceTimersByTime(SUBMISSION_MIN_VISIBLE_MS);
        expect(isOverlayOpen()).toBe(true);
        expect(modalClasses()).toContain('correct');
    });

    test('clearContent cancels a deferred result so it cannot leak into the next question', () => {
        mf.showSubmission('Answer submitted: B');
        jest.advanceTimersByTime(SUBMISSION_DEFER_MS);
        mf.showCorrect('Correct!', 100, 4000);

        mf.hide();
        mf.clearContent(); // next question starts

        jest.advanceTimersByTime(SUBMISSION_MIN_VISIBLE_MS + 500);
        expect(isOverlayOpen()).toBe(false);
        expect(modalClasses()).not.toContain('correct');
    });

    test('clearContent cancels a pending confirmation so it cannot leak into the next question', () => {
        mf.showSubmission('Answer submitted: B');
        jest.advanceTimersByTime(200);

        mf.hide();
        mf.clearContent();

        jest.advanceTimersByTime(SUBMISSION_DEFER_MS + 500);
        expect(isOverlayOpen()).toBe(false);
        expect(modalClasses()).not.toContain('submission');
    });
});

describe('ModalFeedback — deterministic submission icon', () => {
    test('uses the same icon on every submission', () => {
        mf.showSubmission('Answer submitted: B');
        jest.advanceTimersByTime(SUBMISSION_DEFER_MS);
        const first = document.getElementById('feedback-icon').textContent;

        mf.hide();
        mf.clearContent();
        mf.showSubmission('Answer submitted: C');
        jest.advanceTimersByTime(SUBMISSION_DEFER_MS);

        expect(document.getElementById('feedback-icon').textContent).toBe(first);
        expect(first).not.toBe('');
    });
});
