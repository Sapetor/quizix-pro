/**
 * Question-form chrome for the desktop editor (Editor 2a, Stage C).
 *
 * Small behaviors behind the restyled form column, all driving the EXISTING
 * native inputs (the DOM is the model — extraction reads those inputs):
 *  - TIEMPO stepper ▲▼ buttons: adjust .question-time-limit and fire a native
 *    bubbling `change` (inline updateTimeLimit + sidebar listeners rely on it).
 *  - PUNTOS: read-only derived display (BASE_POINTS × difficulty multiplier,
 *    mirroring scoring-service — points are never stored per question).
 *  - Question-text live character count (display-only; no cap is enforced).
 *  - True/False cards: presentation over select.correct-answer (set + change).
 *  - Footer action bar: duplicate (extractQuestionData → addQuestionFromData,
 *    inserted after the current question), delete (proxies the active
 *    question's .btn-remove). Add lives in the question sidebar's footer.
 *
 * Desktop-only: initialized from ui-manager postHostScreenSetup() behind its
 * >=769px check, same as the question sidebar.
 */

import { dom } from '../utils/dom.js';
import { logger } from '../core/config.js';
import { BASE_POINTS, getDifficultyMultiplier } from '../utils/scoring-config.js';

const TIME_STEP_SECONDS = 5;

let initialized = false;

function getQuestionItems() {
    const container = dom.get('questions-container');
    return container ? Array.from(container.querySelectorAll('.question-item')) : [];
}

function getActiveItem() {
    const items = getQuestionItems();
    return items.find(item => item.classList.contains('active-question')) || items[0] || null;
}

function syncPointsDisplay(item) {
    const pointsEl = item.querySelector('.question-points-display');
    if (!pointsEl) return;
    const difficulty = item.querySelector('.question-difficulty')?.value || 'medium';
    pointsEl.textContent = String(Math.round(BASE_POINTS * getDifficultyMultiplier(difficulty)));
}

function syncCharCount(item) {
    const countEl = item.querySelector('.qt-count');
    if (!countEl) return;
    const text = item.querySelector('.question-text')?.value || '';
    countEl.textContent = String(text.length);
}

/** Re-derive every display-only field + the delete button's enabled state. */
function syncFormChrome() {
    const items = getQuestionItems();
    items.forEach(item => {
        syncPointsDisplay(item);
        syncCharCount(item);
    });
    const deleteBtn = dom.get('editor-delete-question');
    if (deleteBtn) deleteBtn.disabled = items.length <= 1;
}

function stepTimeLimit(stepBtn) {
    const input = stepBtn.closest('.qm-stepper')?.querySelector('.question-time-limit');
    if (!input) return;
    const step = parseInt(stepBtn.dataset.step, 10) || 0;
    const min = parseInt(input.min, 10) || 5;
    const max = parseInt(input.max, 10) || 300;
    const current = parseInt(input.value, 10);
    const base = isNaN(current) ? min : current;
    const next = Math.max(min, Math.min(max, base + step * TIME_STEP_SECONDS));
    if (next === current) return;
    input.value = next;
    // Native bubbling change: fires the inline updateTimeLimit clamp AND the
    // delegated sidebar/autosave listeners, exactly like a manual edit.
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

function selectTrueFalse(card) {
    const options = card.closest('.true-false-options');
    // Poll questions have no correct answer to mark
    if (options?.classList.contains('poll-mode')) return;
    const select = options?.querySelector('.correct-answer');
    if (!select) return;
    const value = card.dataset.tf === 'false' ? 'false' : 'true';
    if (select.value === value) return;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Duplicate the active question: serialize it through the same extraction the
 * save path uses, rebuild it through the load path, then move the copy to sit
 * right after the original and navigate to it.
 */
function duplicateActiveQuestion() {
    const quizManager = window.game?.quizManager;
    const container = dom.get('questions-container');
    const active = getActiveItem();
    if (!quizManager || !container || !active) return;

    const index = getQuestionItems().indexOf(active);
    const data = quizManager.extractQuestionData(active);
    if (!data) {
        // Nothing extractable (question has no text yet) — a copy of an empty
        // question IS an empty question, so the plain add path is equivalent.
        dom.get('toolbar-add-question')?.click();
        return;
    }

    quizManager.addQuestionFromData(data);
    const newItem = container.lastElementChild;
    if (!newItem || newItem === active) return;
    active.after(newItem);
    quizManager.updateQuestionsUI?.();

    document.dispatchEvent(new CustomEvent('questionAdded', {
        detail: { questionCount: container.children.length }
    }));
    if (window.showQuestion) {
        window.showQuestion(index + 1);
    }
    logger.debug(`Duplicated question ${index + 1}`);
}

function deleteActiveQuestion() {
    if (getQuestionItems().length <= 1) return;
    // Full inline-handler path (stopPropagation + removeQuestion + events).
    getActiveItem()?.querySelector('.btn-remove')?.click();
}

/** Initialize the Stage C form chrome. Idempotent (host screen re-entry). */
export function initEditorFormChrome() {
    if (initialized) {
        syncFormChrome();
        return;
    }
    initialized = true;

    // Delegated controls inside question items (items are created/destroyed
    // constantly — the document listener survives all of it).
    document.addEventListener('click', (event) => {
        if (!(event.target instanceof Element)) return;
        const stepBtn = event.target.closest('.qm-step');
        if (stepBtn) {
            event.preventDefault();
            stepTimeLimit(stepBtn);
            return;
        }
        const tfCard = event.target.closest('.tf-card');
        if (tfCard) {
            event.preventDefault();
            selectTrueFalse(tfCard);
        }
    });

    // Live character count (cheap per-item update on every keystroke).
    document.addEventListener('input', (event) => {
        if (event.target instanceof Element && event.target.matches('.question-text')) {
            const item = event.target.closest('.question-item');
            if (item) syncCharCount(item);
        }
    });

    // Derived PUNTOS follows the difficulty select.
    document.addEventListener('change', (event) => {
        if (!(event.target instanceof Element)) return;
        if (event.target.matches('.question-difficulty')) {
            const item = event.target.closest('.question-item');
            if (item) syncPointsDisplay(item);
            return;
        }
        // Poll mode greys out the correct-answer picker — there is nothing to pick.
        if (event.target.matches('.tf-poll')) {
            const options = event.target.closest('.true-false-options');
            options?.classList.toggle('poll-mode', event.target.checked);
        }
    });

    // Structural changes re-derive everything (incl. delete-enabled state).
    // questionShown is included because bulk-population paths
    // (populateQuizBuilder → addQuestionFromData) emit no add/load events but
    // always end on a showQuestion() call.
    ['questionAdded', 'questionRemoved', 'quizLoaded', 'questionShown'].forEach(evt => {
        document.addEventListener(evt, () => syncFormChrome());
    });

    // Footer action bar.
    dom.get('editor-duplicate-question')?.addEventListener('click', duplicateActiveQuestion);
    dom.get('editor-delete-question')?.addEventListener('click', deleteActiveQuestion);

    syncFormChrome();
}
