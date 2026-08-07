/**
 * Header controller: editor-breadcrumb sync, utility overflow menu,
 * theme/sound icon state. All DOM-optional (no-ops if nodes absent).
 */

import { translationManager } from '../utils/translation-manager.js';

const EDITOR_BREADCRUMB_TITLE = 'editor-breadcrumb-title';
const QUIZ_TITLE_INPUT = 'quiz-title';
const OVERFLOW_TOGGLE = 'utility-overflow-toggle';
const THEME_TOGGLE = 'theme-toggle';
const SOUND_TOGGLE = 'sound-toggle';
const MUTE_STUDENTS_BTN_SELECTOR = '.mute-students-btn';

function el(id) {
  return document.getElementById(id);
}

function header() {
  return document.querySelector('.app-header');
}

export function syncEditorBreadcrumbTitle() {
  const titleEl = el(EDITOR_BREADCRUMB_TITLE);
  const input = el(QUIZ_TITLE_INPUT);
  if (!titleEl || !input) return;

  const value = (input.value || '').trim();
  if (value) {
    titleEl.textContent = value;
    // JS owns the text now: the translation sweep must not reset it to the
    // data-translate="header_untitled_quiz" placeholder on a language switch.
    titleEl.setAttribute('data-translate-dynamic', 'true');
  } else {
    // Genuinely untitled: hand the element back to the sweep and write the
    // placeholder in the current language.
    titleEl.removeAttribute('data-translate-dynamic');
    const key = titleEl.getAttribute('data-translate');
    const translated = key ? translationManager.getTranslationSync(key) : '';
    titleEl.textContent = (translated && translated !== key) ? translated : 'Untitled quiz';
  }
}

export function setThemeIconState(state) {
  const btn = el(THEME_TOGGLE);
  if (!btn) return;
  btn.dataset.iconState = state;  // 'light' | 'dark'
}

export function setSoundIconState(state) {
  const btn = el(SOUND_TOGGLE);
  if (!btn) return;
  btn.dataset.iconState = state;  // 'on' | 'off'
}

/**
 * Render the host's "mute all students" toggle in the header live-game cluster.
 * (The header stays visible through gameplay, so this is the only instance; a
 * second in-question copy existed only while .game-state-playing hid the header.)
 *
 * Only the label span's text is rewritten — the two inline SVGs are siblings and
 * are swapped by data-icon-state, so they are never destroyed. The label keeps a
 * data-translate attribute so a language switch re-renders the correct string.
 *
 * @param {boolean} muted - whether players are currently force-muted
 */
export function setMuteStudentsState(muted) {
  const key = muted ? 'unmute_all_students' : 'mute_all_students';
  const fallback = muted ? 'Unmute students' : 'Mute students';
  const text = translationManager.getTranslationSync(key) || fallback;

  document.querySelectorAll(MUTE_STUDENTS_BTN_SELECTOR).forEach(btn => {
    btn.dataset.iconState = muted ? 'off' : 'on';
    btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    btn.setAttribute('data-translate-title', key);
    btn.setAttribute('data-translate-aria-label', key);
    btn.setAttribute('aria-label', text);
    btn.title = text;

    const label = btn.querySelector('.mute-students-btn-label');
    if (label) {
      label.setAttribute('data-translate', key);
      label.textContent = text;
    }
  });
}

/**
 * Whether the host toggle currently reads as "players muted".
 */
export function isMuteStudentsActive() {
  const btn = document.querySelector(MUTE_STUDENTS_BTN_SELECTOR);
  return btn?.getAttribute('aria-pressed') === 'true';
}

export function openOverflowMenu() {
  const h = header();
  const toggle = el(OVERFLOW_TOGGLE);
  if (!h || !toggle) return;
  h.classList.add('overflow-open');
  toggle.setAttribute('aria-expanded', 'true');
}

export function closeOverflowMenu() {
  const h = header();
  const toggle = el(OVERFLOW_TOGGLE);
  if (!h || !toggle) return;
  h.classList.remove('overflow-open');
  toggle.setAttribute('aria-expanded', 'false');
}

function isOverflowOpen() {
  const h = header();
  return !!(h && h.classList.contains('overflow-open'));
}

function bindOverflowToggle() {
  const toggle = el(OVERFLOW_TOGGLE);
  if (!toggle) return;
  toggle.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (isOverflowOpen()) closeOverflowMenu();
    else openOverflowMenu();
  });

  document.addEventListener('click', (ev) => {
    if (!isOverflowOpen()) return;
    const utilities = document.getElementById('app-header-utilities');
    if (utilities && utilities.contains(ev.target)) return;
    if (toggle.contains(ev.target)) return;
    closeOverflowMenu();
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && isOverflowOpen()) {
      closeOverflowMenu();
      toggle.focus();
    }
  });
}

function bindBreadcrumbSync() {
  const input = el(QUIZ_TITLE_INPUT);
  if (!input) return;
  input.addEventListener('input', syncEditorBreadcrumbTitle);
  // Programmatic title changes (load / import / autosave restore) fire no
  // 'input' — re-sync on the loaded event too.
  document.addEventListener('quizLoaded', syncEditorBreadcrumbTitle);
  syncEditorBreadcrumbTitle();
}

function bindThemeObserver() {
  const html = document.documentElement;
  const pick = () =>
    setThemeIconState(html.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  pick();
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.attributeName === 'data-theme') {
        pick();
        return;
      }
    }
  });
  observer.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
}

export function initHeaderController() {
  bindOverflowToggle();
  bindBreadcrumbSync();
  bindThemeObserver();
}
