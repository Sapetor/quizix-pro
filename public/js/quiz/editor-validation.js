/**
 * Live editor validation + autosave stamp (Editor 2a, Stage D).
 *
 * ONE validation pass over the live `.question-item` DOM feeds FIVE surfaces
 * via the `editorValidationChanged` CustomEvent:
 *   1. amber validation strip (#editor-validation-strip, dismissible — the
 *      dismissal holds until the SET of warnings changes),
 *   2. sidebar row badges (question-sidebar.js reads getEditorWarnings() at
 *      render time and re-applies on the event),
 *   3. inline option errors on the active question (red border + helper line),
 *   4. ESTADO DEL QUIZ card (#quiz-status-card),
 *   5. footer warnings pill (#editor-warnings-pill).
 *
 * The rules MIRROR save-time semantics (QuizManager.validateQuestions over
 * extracted data): extraction drops empty-text questions entirely and filters
 * empty options, so the real editor-time error conditions are:
 *   - question text empty                       → 'no_text'
 *   - MC/multi: fewer than 2 non-empty options  → 'too_few_options'
 *   - MC/multi: no correct option checked       → 'no_correct'
 *   - MC/multi: a checked correct option empty  → 'correct_empty'
 *   - numeric: empty/NaN answer                 → 'no_numeric'
 * Warnings never hard-block Crear Sala/save — the existing save-time
 * validation stays authoritative.
 *
 * Also owns the header autosave stamp (#save-status): "Guardando…" on
 * `editorAutosavePending` (scheduleAutoSave), "GUARDADO HH:MM" on
 * `editorAutosaveDone` (autoSaveQuiz, incl. after confirmSave) and on
 * `quizLoaded` (a freshly loaded quiz IS its saved state).
 *
 * Desktop-only: initialized from ui-manager postHostScreenSetup() behind its
 * >=769px check, like the sidebar and form chrome.
 */

import { dom, debounce } from '../utils/dom.js';
import { translationManager } from '../utils/translation-manager.js';

const VALIDATION_DEBOUNCE_MS = 400;

// code → translation key for the short per-question label
// ("P04 · sin respuesta correcta" forms)
const CODE_LABELS = {
    no_text: 'val_no_text',
    no_correct: 'val_no_correct',
    correct_empty: 'val_correct_empty',
    too_few_options: 'val_too_few_options',
    no_numeric: 'val_no_numeric'
};

let initialized = false;
let latestWarnings = [];
let dismissedSignature = null;

function t(key, params = []) {
    return translationManager.getTranslationSync(key, params);
}

function getQuestionItems() {
    const container = dom.get('questions-container');
    return container ? Array.from(container.querySelectorAll('.question-item')) : [];
}

function questionTag(index) {
    return `P${String(index + 1).padStart(2, '0')}`;
}

/**
 * Validate a single choice question (multiple-choice / multiple-correct).
 * Pushes warnings; badOptionIndices collects option positions (data-option)
 * that should get the inline error treatment.
 */
function validateChoiceQuestion(item, type, index, warnings) {
    const containerClass = type === 'multiple-correct'
        ? '.multiple-correct-options'
        : '.multiple-choice-options';
    const optionsContainer = item.querySelector(containerClass);
    if (!optionsContainer) return;

    const optionInputs = Array.from(optionsContainer.querySelectorAll('.option'));
    const nonEmpty = optionInputs.filter(opt => opt.value.trim());

    if (nonEmpty.length < 2) {
        // Save-time: empty options are filtered, then validateQuestionType
        // rejects <2 options. Inline errors mark the empty rows to fill.
        const badOptionIndices = optionInputs
            .map((opt, i) => (opt.value.trim() ? -1 : i))
            .filter(i => i !== -1);
        warnings.push({
            questionIndex: index,
            code: 'too_few_options',
            message: t('val_too_few_options'),
            badOptionIndices
        });
    }

    const checked = Array.from(optionsContainer.querySelectorAll('.correct-option:checked'));
    if (checked.length === 0) {
        warnings.push({
            questionIndex: index,
            code: 'no_correct',
            message: t('val_no_correct')
        });
        return;
    }

    // A checked correct option with empty text: extraction silently filters it
    // (MC falls back to option 0, multi drops it) — surface it as an error.
    const emptyChecked = checked.filter(input => {
        const wrapper = input.closest('.option-wrapper');
        const optInput = wrapper?.querySelector('.option');
        return optInput && !optInput.value.trim();
    });
    if (emptyChecked.length > 0) {
        warnings.push({
            questionIndex: index,
            code: 'correct_empty',
            message: t('val_correct_empty'),
            badOptionIndices: emptyChecked.map(input => parseInt(input.dataset.option, 10))
        });
    }
}

/**
 * Validate the live editor DOM. Pure read — no side effects.
 * @returns {Array<{questionIndex: number, code: string, message: string, badOptionIndices?: number[]}>}
 */
export function validateEditorState() {
    const warnings = [];

    getQuestionItems().forEach((item, index) => {
        const text = item.querySelector('.question-text')?.value?.trim();
        if (!text) {
            // Extraction returns null for empty-text questions — every other
            // check is moot until the question exists (mirrors save path).
            warnings.push({ questionIndex: index, code: 'no_text', message: t('val_no_text') });
            return;
        }

        const type = item.querySelector('.question-type')?.value || 'multiple-choice';
        if (type === 'multiple-choice' || type === 'multiple-correct') {
            validateChoiceQuestion(item, type, index, warnings);
        } else if (type === 'numeric') {
            const raw = item.querySelector('.numeric-answer')?.value?.trim();
            if (!raw || isNaN(parseFloat(raw))) {
                warnings.push({ questionIndex: index, code: 'no_numeric', message: t('val_no_numeric') });
            }
        }
    });

    return warnings;
}

/** Latest validation result — question-sidebar reads this at render time. */
export function getEditorWarnings() {
    return latestWarnings;
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

function distinctQuestionIndices(warnings) {
    return [...new Set(warnings.map(w => w.questionIndex))].sort((a, b) => a - b);
}

function warningsSignature(warnings) {
    return warnings.map(w => `${w.questionIndex}:${w.code}`).sort().join('|');
}

function goToQuestion(index) {
    if (typeof window.showQuestion === 'function') {
        window.showQuestion(index);
    }
}

/** Amber strip above the editor grid: count + mono summary + go-to + dismiss. */
function updateStrip(warnings) {
    const strip = dom.get('editor-validation-strip');
    if (!strip) return;

    if (warnings.length === 0) {
        strip.classList.add('hidden');
        dismissedSignature = null;
        return;
    }

    const signature = warningsSignature(warnings);
    if (signature === dismissedSignature) {
        strip.classList.add('hidden');
        return;
    }
    // A different warning set voids the previous dismissal.
    if (dismissedSignature !== null && signature !== dismissedSignature) {
        dismissedSignature = null;
    }

    const indices = distinctQuestionIndices(warnings);
    const text = indices.length === 1
        ? t('val_strip_one')
        : t('val_strip_many', [indices.length]);
    const summary = warnings
        .map(w => `${questionTag(w.questionIndex)} ${w.message}`)
        .join(' · ');

    strip.querySelector('.evs-text').textContent = text;
    strip.querySelector('.evs-summary').textContent = summary;
    strip.classList.remove('hidden');
}

/** ESTADO DEL QUIZ card in the preview column. */
function updateStatusCard(warnings) {
    const card = dom.get('quiz-status-card');
    if (!card) return;

    const total = getQuestionItems().length;
    const warned = distinctQuestionIndices(warnings);
    const ready = total - warned.length;

    const readyLine = ready > 0
        ? '<div class="qsc-line">' +
          '<span class="qsc-icon qsc-icon--ok ed-mono" aria-hidden="true">✓</span>' +
          `<span>${ready === 1 ? t('val_ready_one') : t('val_ready_many', [ready])}</span>` +
          '</div>'
        : '';
    const warnLines = warnings.map(w =>
        `<button type="button" class="qsc-line qsc-line--warn" data-index="${w.questionIndex}">` +
        '<span class="qsc-icon qsc-icon--warn ed-mono" aria-hidden="true">!</span>' +
        `<span>${questionTag(w.questionIndex)} ${w.message}</span>` +
        '</button>'
    ).join('');

    card.innerHTML =
        `<span class="qsc-title ed-mono">${t('quiz_status_title')}</span>` +
        readyLine + warnLines;
}

/** Footer "N avisos · ver" pill. */
function updateWarningsPill(warnings) {
    const pill = dom.get('editor-warnings-pill');
    if (!pill) return;

    if (warnings.length === 0) {
        // textContent = '' (no whitespace) so the :empty { display:none } holds.
        pill.textContent = '';
        return;
    }
    const label = warnings.length === 1 ? t('val_pill_one') : t('val_pill_many', [warnings.length]);
    pill.innerHTML = `<span class="ewp-dot" aria-hidden="true"></span>${label}`;
}

/**
 * Inline option errors on the ACTIVE question: 1.5px red border on offending
 * rows + indented helper line inserted as a sibling after the row (Stage C
 * rows are position:relative 52px flex rows — a sibling note keeps the row
 * geometry and every extraction selector intact).
 */
function updateOptionErrors(warnings) {
    const container = dom.get('questions-container');
    if (!container) return;

    // Clear previous pass everywhere (cheap: a handful of nodes).
    container.querySelectorAll('.option-wrapper--error').forEach(el => {
        el.classList.remove('option-wrapper--error');
    });
    container.querySelectorAll('.opt-error-note').forEach(el => el.remove());

    const items = getQuestionItems();
    const active = items.find(item => item.classList.contains('active-question'));
    if (!active) return;
    const activeIndex = items.indexOf(active);

    const badIndices = new Set();
    warnings.forEach(w => {
        if (w.questionIndex === activeIndex && w.badOptionIndices) {
            w.badOptionIndices.forEach(i => badIndices.add(i));
        }
    });
    if (badIndices.size === 0) return;

    const type = active.querySelector('.question-type')?.value || 'multiple-choice';
    const containerClass = type === 'multiple-correct'
        ? '.multiple-correct-options'
        : '.multiple-choice-options';
    const optionsContainer = active.querySelector(containerClass);
    if (!optionsContainer) return;

    badIndices.forEach(optionIndex => {
        const wrapper = optionsContainer.querySelector(`.option-wrapper[data-option="${optionIndex}"]`);
        if (!wrapper) return;
        wrapper.classList.add('option-wrapper--error');
        const note = document.createElement('div');
        note.className = 'opt-error-note';
        note.textContent = t('val_option_empty_helper');
        wrapper.after(note);
    });
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function runValidation() {
    latestWarnings = validateEditorState();

    updateStrip(latestWarnings);
    updateStatusCard(latestWarnings);
    updateWarningsPill(latestWarnings);
    updateOptionErrors(latestWarnings);

    document.dispatchEvent(new CustomEvent('editorValidationChanged', {
        detail: { warnings: latestWarnings }
    }));
}

// ---------------------------------------------------------------------------
// Autosave stamp (#save-status in the app header)
// ---------------------------------------------------------------------------

function setSaveStatusSaved() {
    const el = dom.get('save-status');
    if (!el) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    el.textContent = `${t('editor_saved')} ${hh}:${mm}`;
}

function initSaveStatus() {
    document.addEventListener('editorAutosavePending', () => {
        const el = dom.get('save-status');
        if (el) el.textContent = t('editor_saving');
    });
    document.addEventListener('editorAutosaveDone', setSaveStatusSaved);
    // A loaded quiz is by definition its saved state.
    document.addEventListener('quizLoaded', setSaveStatusSaved);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize validation surfaces + autosave stamp. Idempotent. */
export function initEditorValidation() {
    if (initialized) {
        runValidation();
        return;
    }
    initialized = true;

    // Strip controls (static skeleton lives in index.html).
    dom.get('evs-goto')?.addEventListener('click', () => {
        const indices = distinctQuestionIndices(latestWarnings);
        if (indices.length > 0) goToQuestion(indices[0]);
    });
    dom.get('evs-dismiss')?.addEventListener('click', () => {
        dismissedSignature = warningsSignature(latestWarnings);
        dom.get('editor-validation-strip')?.classList.add('hidden');
    });

    // Status card lines navigate (delegated: card innerHTML is re-rendered).
    dom.get('quiz-status-card')?.addEventListener('click', (event) => {
        const line = event.target.closest('.qsc-line--warn');
        if (line) goToQuestion(parseInt(line.dataset.index, 10));
    });

    // Footer pill navigates to the first offending question.
    dom.get('editor-warnings-pill')?.addEventListener('click', () => {
        const indices = distinctQuestionIndices(latestWarnings);
        if (indices.length > 0) goToQuestion(indices[0]);
    });

    // Edits inside the questions container → debounced re-run.
    const debouncedRun = debounce(runValidation, VALIDATION_DEBOUNCE_MS);
    ['input', 'change'].forEach(evt => {
        document.addEventListener(evt, (event) => {
            if (event.target instanceof Element && event.target.closest('#questions-container')) {
                debouncedRun();
            }
        });
    });

    // Structural changes / navigation → immediate re-run. questionShown also
    // covers populateQuizBuilder paths (no add events, trailing showQuestion)
    // and re-anchors the inline option errors to the newly active question.
    ['questionAdded', 'questionRemoved', 'quizLoaded', 'questionShown'].forEach(evt => {
        document.addEventListener(evt, () => runValidation());
    });

    initSaveStatus();
    runValidation();
}
