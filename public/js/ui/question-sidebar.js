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

// Drag-to-reorder state. `renderSuppressed` freezes the list for the duration
// of a gesture; `swallowNextClick` stops the click that follows a real drag
// from also navigating.
const DRAG_THRESHOLD_PX = 5;
let drag = null;
let renderSuppressed = false;
let swallowNextClick = false;

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
    return `<button type="button" class="${rowClasses}" data-index="${index}" ` +
        'aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown">' +
        `<span class="qs-row-index ed-mono">${String(index + 1).padStart(2, '0')}</span>` +
        `<span class="qs-glyph qs-glyph--${glyph}" aria-hidden="true"></span>` +
        label +
        `<span class="qs-row-time ed-mono">${getTimeLimitSeconds(item)}s</span>` +
        `<span class="qs-warning ed-mono${hasWarning ? '' : ' hidden'}" aria-hidden="true">${hasWarning ? '!' : ''}</span>` +
        '<span class="qs-grip" aria-hidden="true"></span>' +
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
    // A drag reads live row rects; re-rendering underneath it (a debounced
    // edit, a validation pass) would swap the nodes mid-gesture.
    if (renderSuppressed) return;

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
 * Convert a drop "gap" into a final index.
 *
 * The gap is measured against the list WITH the dragged row still in it
 * (0..n, "insert before row g"), but the final index is measured against the
 * list WITHOUT it. Everything below the row therefore shifts up one slot.
 * Both gaps that touch the row itself (g === from, g === from + 1) mean
 * "stay put" and collapse to `from`.
 */
export function dropGapToFinalIndex(gap, fromIndex) {
    return gap > fromIndex ? gap - 1 : gap;
}

/**
 * Move the question at `fromIndex` to `toIndex`.
 *
 * The DOM is the model, so this is literally a node move — no array to keep
 * in sync, and the live nodes (with their radio-group names and any unsaved
 * field state) are preserved rather than rebuilt.
 *
 * @returns {boolean} whether anything actually moved
 */
export function moveQuestion(fromIndex, toIndex) {
    const container = dom.get('questions-container');
    if (!container) return false;

    const items = getQuestionItems();
    const valid = (i) => Number.isInteger(i) && i >= 0 && i < items.length;
    if (!valid(fromIndex) || !valid(toIndex) || fromIndex === toIndex) return false;

    const node = items[fromIndex];
    const rest = items.filter((_, i) => i !== fromIndex);
    // rest[toIndex] === undefined when moving to the end → insertBefore(node,
    // null) appends, which is exactly what we want.
    container.insertBefore(node, rest[toIndex] || null);

    // Renumber data-question + headings, then keep the user on the question
    // they just moved. showQuestion re-syncs the preview and re-runs
    // validation via its questionShown event.
    window.game?.quizManager?.updateQuestionsUI?.();
    window.showQuestion?.(toIndex);

    // A node move fires no `input`, and autosave only listens for input
    // inside .question-item — without this the reorder is silently lost.
    window.game?.quizManager?.scheduleAutoSave?.();

    renderSidebar();
    return true;
}

/** Rendered sidebar rows, in display order. */
function getRowElements() {
    const sidebar = dom.get('question-sidebar');
    return sidebar ? Array.from(sidebar.querySelectorAll('.qs-row')) : [];
}

/** Insertion gap (0..n) under the pointer, from the live row rects. */
function gapFromPointerY(clientY) {
    const rows = getRowElements();
    for (let i = 0; i < rows.length; i++) {
        const rect = rows[i].getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) return i;
    }
    return rows.length;
}

/** Position the drop line. Absolutely positioned, so it never shifts rows. */
function showDropIndicator(gap) {
    const rowsWrap = dom.get('question-sidebar')?.querySelector('.qs-rows');
    if (!rowsWrap) return;

    let indicator = rowsWrap.querySelector('.qs-drop-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'qs-drop-indicator';
        rowsWrap.appendChild(indicator);
    }

    const rows = getRowElements();
    const last = rows[rows.length - 1];
    indicator.style.top = gap < rows.length
        ? `${rows[gap].offsetTop}px`
        : `${last ? last.offsetTop + last.offsetHeight : 0}px`;
}

function endDrag(commit, clientY) {
    if (!drag) return;
    const { row, fromIndex, active, pointerId } = drag;
    const sidebar = dom.get('question-sidebar');

    if (active) {
        row.classList.remove('qs-row--dragging');
        sidebar?.classList.remove('qs-dragging');
        sidebar?.querySelector('.qs-drop-indicator')?.remove();
        if (sidebar?.hasPointerCapture?.(pointerId)) {
            sidebar.releasePointerCapture(pointerId);
        }
    }

    const gap = active && commit ? gapFromPointerY(clientY) : null;
    drag = null;
    renderSuppressed = false;
    if (!active) return;

    // The click that follows a real drag must not also navigate.
    swallowNextClick = true;
    if (!(commit && moveQuestion(fromIndex, dropGapToFinalIndex(gap, fromIndex)))) {
        renderSidebar();
    }
}

function bindReorder(sidebar) {
    sidebar.addEventListener('pointerdown', (event) => {
        // A fresh gesture can never be the click we owed from the last one.
        swallowNextClick = false;

        const row = event.target.closest('.qs-row');
        if (!row) return;

        // Touch and pen may only drag from the grip: the finger has to stay
        // free to scroll the list and to tap a row to navigate. A mouse can
        // drag from anywhere on the row (a plain click still navigates,
        // because the drag needs DRAG_THRESHOLD_PX of travel to start).
        if (event.pointerType !== 'mouse' && !event.target.closest('.qs-grip')) return;

        drag = {
            pointerId: event.pointerId,
            startY: event.clientY,
            fromIndex: getRowElements().indexOf(row),
            row,
            active: false
        };
    });

    sidebar.addEventListener('pointermove', (event) => {
        if (!drag || event.pointerId !== drag.pointerId) return;

        if (!drag.active) {
            if (Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD_PX) return;
            drag.active = true;
            renderSuppressed = true;
            drag.row.classList.add('qs-row--dragging');
            sidebar.classList.add('qs-dragging');
            sidebar.setPointerCapture?.(drag.pointerId);
        }

        event.preventDefault();
        showDropIndicator(gapFromPointerY(event.clientY));
    });

    sidebar.addEventListener('pointerup', (event) => {
        if (drag && event.pointerId === drag.pointerId) endDrag(true, event.clientY);
    });
    sidebar.addEventListener('pointercancel', (event) => {
        if (drag && event.pointerId === drag.pointerId) endDrag(false, event.clientY);
    });

    // Keyboard equivalent: the rows are buttons, so they already focus.
    sidebar.addEventListener('keydown', (event) => {
        if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;

        const row = event.target.closest?.('.qs-row');
        if (!row) return;

        const rows = getRowElements();
        const from = rows.indexOf(row);
        const to = event.key === 'ArrowUp' ? from - 1 : from + 1;
        if (from < 0 || to < 0 || to >= rows.length) return;

        event.preventDefault();
        if (moveQuestion(from, to)) getRowElements()[to]?.focus();
    });
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
        if (swallowNextClick) {
            swallowNextClick = false;
            return;
        }
        if (event.target.closest('#sidebar-add-question')) {
            dom.get('toolbar-add-question')?.click();
            return;
        }
        const row = event.target.closest('.qs-row');
        if (row && window.showQuestion) {
            window.showQuestion(parseInt(row.dataset.index, 10));
        }
    });

    bindReorder(sidebar);

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
