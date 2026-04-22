/**
 * Header controller: editor-breadcrumb sync, utility overflow menu,
 * theme/sound icon state. All DOM-optional (no-ops if nodes absent).
 */

const EDITOR_BREADCRUMB_TITLE = 'editor-breadcrumb-title';
const QUIZ_TITLE_INPUT = 'quiz-title';
const OVERFLOW_TOGGLE = 'utility-overflow-toggle';
const THEME_TOGGLE = 'theme-toggle';
const SOUND_TOGGLE = 'sound-toggle';

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
  } else {
    // Keep whatever translation text is already there (data-translate="header_untitled_quiz")
    // Re-write it to its translated value if empty, so we don't leave stale content.
    const fallback = titleEl.getAttribute('data-translate-fallback') || titleEl.textContent || 'Untitled quiz';
    titleEl.textContent = fallback;
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
