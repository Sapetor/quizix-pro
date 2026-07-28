/**
 * Question-list sidebar + preview-column chrome for the desktop editor
 * (Editor 2a, Stage B).
 *
 * Fills the Stage A `<nav id="question-sidebar">` placeholder with one row per
 * `.question-item` (index, type glyph, truncated text, time, warning slot for
 * Stage D), keeps the active row in sync with `.active-question`, and owns the
 * small preview-column extras the mock adds: the timer chip and the
 * "pts · difficulty · concepts" meta line.
 *
 * The DOM is the model here (no question array exists): every render re-reads
 * the live `.question-item` nodes. Desktop-only — initialized from
 * ui-manager's postHostScreenSetup() behind its >=769px check.
 */

import { dom, escapeHtml, debounce } from '../utils/dom.js';
import { resolveTimeLimit } from '../utils/question-utils.js';
import { translationManager } from '../utils/translation-manager.js';
import { BASE_POINTS, getDifficultyMultiplier } from '../utils/scoring-config.js';
import { getEditorWarnings } from '../quiz/editor-validation.js';

// Question type -> glyph modifier (colors live in app-screens.css, Stage B
// section, on the shared option ramp: mc blue, tf green, num purple, ord amber)
const TYPE_GLYPHS = {
    'multiple-choice': 'mc',
    'multiple-correct': 'mc',
    'true-false': 'tf',
    'numeric': 'num',
    'ordering': 'ord'
};

// Editable fields whose changes should re-render the sidebar / preview meta
const REFRESH_FIELDS = [
    '.question-text',
    '.question-time-limit',
    '.question-type',
    '.question-difficulty',
    '#global-time-limit',
    '#use-global-time'
].join(', ');

let initialized = false;

function getQuestionItems() {
    const container = dom.get('questions-container');
    return container ? Array.from(container.querySelectorAll('.question-item')) : [];
}

/** Effective time limit in seconds (shared with the save path). */
const getTimeLimitSeconds = resolveTimeLimit;

function buildRowHTML(item, index, warnedIndices) {
    const type = item.querySelector('.question-type')?.value || 'multiple-choice';
    const text = (item.querySelector('.question-text')?.value || '').trim();
    const isActive = item.classList.contains('active-question');
    const hasWarning = warnedIndices.has(index);
    const glyph = TYPE_GLYPHS[type] || 'mc';
    const rowClasses = [
        'qs-row',
        isActive ? 'qs-row--active' : '',
        text ? '' : 'qs-row--empty',
        hasWarning ? 'qs-row--warn' : ''
    ].filter(Boolean).join(' ');
    const label = text
        ? `<span class="qs-row-text">${escapeHtml(text)}</span>`
        : '<span class="qs-row-text qs-row-text--empty" data-translate="qs_no_text">Sin texto</span>';
    return `<button type="button" class="${rowClasses}" data-index="${index}">` +
        `<span class="qs-row-index ed-mono">${String(index + 1).padStart(2, '0')}</span>` +
        `<span class="qs-glyph qs-glyph--${glyph}" aria-hidden="true"></span>` +
        label +
        `<span class="qs-row-time ed-mono">${getTimeLimitSeconds(item)}s</span>` +
        `<span class="qs-warning ed-mono${hasWarning ? '' : ' hidden'}" aria-hidden="true">${hasWarning ? '!' : ''}</span>` +
        '</button>';
}

/** Question indices that currently carry validation warnings (Stage D). */
function getWarnedIndices() {
    return new Set(getEditorWarnings().map(w => w.questionIndex));
}

/**
 * Re-apply warning badges in place after `editorValidationChanged` (the
 * sidebar wholesale-replaces its innerHTML on render, so badges are ALSO
 * derived inside buildRowHTML — this path covers validation-only changes).
 */
function applyWarningBadges() {
    const sidebar = dom.get('question-sidebar');
    if (!sidebar) return;
    const rows = sidebar.querySelectorAll('.qs-row');
    const warned = getWarnedIndices();
    rows.forEach((row, i) => {
        const hasWarning = warned.has(i);
        row.classList.toggle('qs-row--warn', hasWarning);
        const badge = row.querySelector('.qs-warning');
        if (badge) {
            badge.classList.toggle('hidden', !hasWarning);
            badge.textContent = hasWarning ? '!' : '';
        }
    });
}

function renderSidebar() {
    const sidebar = dom.get('question-sidebar');
    if (!sidebar) return;

    const items = getQuestionItems();
    const totalSeconds = items.reduce((sum, item) => sum + getTimeLimitSeconds(item), 0);
    const minutes = Math.round(totalSeconds / 60);
    const warnedIndices = getWarnedIndices();
    const rows = items.map((item, i) => buildRowHTML(item, i, warnedIndices)).join('');

    sidebar.innerHTML =
        '<div class="qs-header">' +
        '<span class="qs-header-label ed-mono" data-translate="questions_total">Preguntas</span>' +
        `<span class="qs-header-count ed-mono">${items.length} · ${minutes} <span data-translate="minutes_short">MIN</span></span>` +
        '</div>' +
        `<div class="qs-rows">${rows}</div>` +
        '<div class="qs-footer">' +
        '<button type="button" class="qs-add-btn" id="sidebar-add-question">+ <span data-translate="add_question">Añadir pregunta</span></button>' +
        '</div>';

    translationManager.translateContainer(sidebar);
    updatePreviewExtras();
}

/** Cheap active-row resync (pagination changed, list itself unchanged). */
function syncActiveRow() {
    const sidebar = dom.get('question-sidebar');
    if (!sidebar) return;
    const rows = sidebar.querySelectorAll('.qs-row');
    const items = getQuestionItems();
    if (rows.length !== items.length) {
        renderSidebar();
        return;
    }
    items.forEach((item, i) => {
        rows[i].classList.toggle('qs-row--active', item.classList.contains('active-question'));
    });
    updatePreviewExtras();
}

/**
 * Preview-column extras: timer chip in the student card header and the
 * "1000 PTS · MEDIO · concepts" meta line, both derived from the active
 * question. Points = BASE_POINTS × difficulty multiplier (derived, never
 * stored — mirrors scoring-service).
 */
function updatePreviewExtras() {
    const timerEl = dom.get('preview-timer-split');
    const metaEl = dom.get('preview-meta-split');
    if (!timerEl && !metaEl) return;

    const items = getQuestionItems();
    const active = items.find(item => item.classList.contains('active-question')) || items[0];
    if (!active) {
        if (timerEl) timerEl.textContent = '';
        if (metaEl) metaEl.textContent = '';
        return;
    }

    if (timerEl) timerEl.textContent = `${getTimeLimitSeconds(active)}s`;

    if (metaEl) {
        const difficulty = active.querySelector('.question-difficulty')?.value || 'medium';
        const points = Math.round(BASE_POINTS * getDifficultyMultiplier(difficulty));
        const diffLabel = translationManager.getTranslationSync(difficulty) || difficulty;
        const concepts = Array.from(active.querySelectorAll('.concept-tag'))
            .map(tag => tag.dataset.concept || '')
            .filter(Boolean);
        const parts = [`${points} PTS`, diffLabel];
        if (concepts.length > 0) parts.push(concepts.join(', '));
        metaEl.textContent = parts.join(' · ');
    }
}

/**
 * Initialize the sidebar + preview chrome. Idempotent: repeat calls (host
 * screen re-entry) only re-render.
 */
export function initQuestionSidebar() {
    if (initialized) {
        renderSidebar();
        return;
    }
    const sidebar = dom.get('question-sidebar');
    if (!sidebar) return;
    initialized = true;

    // Delegated clicks: rows navigate, footer button proxies the add action
    sidebar.addEventListener('click', (event) => {
        if (event.target.closest('#sidebar-add-question')) {
            dom.get('toolbar-add-question')?.click();
            return;
        }
        const row = event.target.closest('.qs-row');
        if (row && window.showQuestion) {
            window.showQuestion(parseInt(row.dataset.index, 10));
        }
    });

    // Structural changes → full re-render
    ['questionAdded', 'questionRemoved', 'quizLoaded'].forEach(evt => {
        document.addEventListener(evt, () => renderSidebar());
    });
    // Pagination change (globals.js updatePaginationUI dispatches this)
    document.addEventListener('questionShown', syncActiveRow);
    // Validation result changed (editor-validation.js, Stage D) → re-badge
    document.addEventListener('editorValidationChanged', applyWarningBadges);

    // Text/time/type edits → debounced re-render
    const debouncedRender = debounce(renderSidebar, 300);
    ['input', 'change'].forEach(evt => {
        document.addEventListener(evt, (event) => {
            if (event.target instanceof Element && event.target.matches(REFRESH_FIELDS)) {
                debouncedRender();
            }
        });
    });

    renderSidebar();
}
