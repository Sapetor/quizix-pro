# Header redesign implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app header in `public/index.html` with the editorial paper/ink design from `design_handoff_landing/HEADER.md`: brand lockup, flat paper + hairline, 64px height, unified 18×18 SVG icons, contained toolbar, user-chip, minimal editor breadcrumb, and a unified responsive layout that deletes the duplicate mobile header.

**Architecture:** One new CSS file (`public/css/header.css`) imported into the bundle; one new small JS module (`public/js/ui/header-controller.js`) for breadcrumb sync, overflow-menu toggle, and theme/sound icon swap; markup replacement in `public/index.html`; orphaned mobile-header references cleaned out of 5 JS files. Dark mode uses the existing `[data-theme="dark"]` token mapping in `variables.css`. No new backend, no new socket events, no new dependencies.

**Tech Stack:** Vanilla ES6 modules, CSS custom properties, Jest for unit tests, jsdom for DOM test harness. Fraunces + Inter + JetBrains Mono (already loaded). Service-worker cache-busting via `CACHE_VERSION` in `public/sw.js`.

**Spec:** `docs/superpowers/specs/2026-04-22-header-redesign-design.md` (commit `5621cb8`).

---

## File structure

| File | Responsibility |
|---|---|
| `public/css/header.css` | **New.** All `.app-header`, `.brand`, `.iconbtn`, `.toolbar` (container only — toolbar-btn icons untouched), `.lang-pill`, `.user-chip`, `.editor-breadcrumb`, `.divider`, `.overflow-open` rules. Media queries for responsive reflow. No `!important`. |
| `public/js/ui/header-controller.js` | **New.** Initializes the editor breadcrumb sync (reads `#quiz-title` input), the overflow-menu toggle, and the theme/sound SVG swap. Exports `initHeaderController()`. |
| `public/index.html` | Header markup replaced (lines ~414–707). Inline DOMContentLoaded script updated to drop mobile-header icon init and emoji-based theme-icon logic. |
| `public/js/core/app.js` | Initializes `header-controller.js` during app startup. Remove `mobile-return-to-main` binding. |
| `public/js/ui/ui-manager.js` | At the 3 call sites that show/hide `#horizontal-toolbar`, also toggle `document.body.classList.toggle('has-editor-toolbar', visible)` and `#editor-breadcrumb[hidden]`. |
| `public/js/main.js` | Remove `mobile-language-selector-header` branch. |
| `public/js/utils/globals.js` | Remove `theme-toggle-mobile-header` and `mobile-return-to-main` references. |
| `public/js/utils/language-dropdown-manager.js` | Drop the two mobile-header dropdown branches (the desktop `#language-selector` now serves all widths). |
| `public/js/settings/settings-manager.js` | Drop `theme-toggle-mobile-header` and `sound-toggle-mobile-header` references. |
| `public/css/main.css` | `@import "header.css";` after `base.css`. |
| `public/css/base.css` | Remove `.desktop-title`, `header h1`, and any old header-wrapper rules that conflict with the new `.app-header`. |
| `public/css/layout.css` | Remove `.mobile-title`, `.mobile-header-controls` rules. |
| `public/css/components.css` | Remove `.theme-toggle`, `.sound-toggle`, `.font-size-control` rules **only if** they are exclusive to the old header (check usage; keep if shared with other screens). |
| `public/js/utils/translations/*.js` (9 files) | Add `header_editor` and `header_untitled_quiz` keys. |
| `public/sw.js` | Bump `CACHE_VERSION`. |
| `public/css/main.bundle.css` | Regenerated via `npm run build`. Do not edit by hand. |
| `tests/unit/header-controller.test.js` | **New.** Unit tests for `header-controller.js`. |

---

## Task 1: Add two translation keys to all 9 locale files

**Files:**
- Modify: `public/js/utils/translations/en.js`
- Modify: `public/js/utils/translations/es.js`
- Modify: `public/js/utils/translations/fr.js`
- Modify: `public/js/utils/translations/de.js`
- Modify: `public/js/utils/translations/it.js`
- Modify: `public/js/utils/translations/pt.js`
- Modify: `public/js/utils/translations/pl.js`
- Modify: `public/js/utils/translations/ja.js`
- Modify: `public/js/utils/translations/zh.js`

- [ ] **Step 1: Add keys to each file**

Each file is an ES module: `export default { key: 'value', ... }`. Add these two keys near other header-related entries (search for `auth_signin_short` to find a good anchor). Exact strings per locale:

| Locale | `header_editor` | `header_untitled_quiz` |
|---|---|---|
| en | `Editor` | `Untitled quiz` |
| es | `Editor` | `Quiz sin título` |
| fr | `Éditeur` | `Quiz sans titre` |
| de | `Editor` | `Quiz ohne Titel` |
| it | `Editor` | `Quiz senza titolo` |
| pt | `Editor` | `Quiz sem título` |
| pl | `Edytor` | `Quiz bez tytułu` |
| ja | `エディター` | `無題のクイズ` |
| zh | `编辑器` | `无标题测验` |

Insertion pattern (apply to each file):

```js
// Header contextual breadcrumb
header_editor: 'Editor',
header_untitled_quiz: 'Untitled quiz',
```

- [ ] **Step 2: Verify all 9 files contain both keys**

Run:
```bash
grep -l "header_editor" public/js/utils/translations/*.js | wc -l
grep -l "header_untitled_quiz" public/js/utils/translations/*.js | wc -l
```
Expected: `9` for each.

- [ ] **Step 3: Commit**

```bash
git add public/js/utils/translations/
git commit -m "feat(i18n): add header_editor and header_untitled_quiz keys"
```

---

## Task 2: Verify / extend dark-mode token mapping in variables.css

**Files:**
- Modify (if needed): `public/css/variables.css`

- [ ] **Step 1: Verify dark-mode mapping exists**

Run:
```bash
grep -n "data-theme=\"dark\"" public/css/variables.css
```

Check whether the dark-mode block remaps `--paper`, `--paper-2`, `--ink`, `--ink-2`, `--ink-3`, `--ink-4`, and `--rule-soft-light` to dark values. Read the file (around the matches) to confirm.

- [ ] **Step 2: If mapping is missing or incomplete, add this block**

Insert after the `:root` block in `variables.css`:

```css
[data-theme="dark"] {
  --paper: #14130f;
  --paper-2: #1e1c17;
  --paper-3: #27241d;
  --ink: #f3ede0;
  --ink-2: #d8d0be;
  --ink-3: #a69e8b;
  --ink-4: #746d5e;
  --rule-soft-light: rgba(243, 237, 224, 0.14); /* paper-on-ink hairline */
}
```

If the mapping is already complete, skip this step.

- [ ] **Step 3: Commit (only if the file was modified)**

```bash
git add public/css/variables.css
git commit -m "chore(css): map editorial paper/ink tokens for dark theme"
```

---

## Task 3: Create `public/css/header.css`

**Files:**
- Create: `public/css/header.css`

- [ ] **Step 1: Create the file with the full stylesheet**

```css
/* =========================================================
   App header — editorial paper/ink, sticky, 64px (56 mobile)
   Tokens from variables.css. No !important.
   ========================================================= */

.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--paper);
  border-bottom: 1px solid var(--rule-soft-light);
  transition: background 300ms, border-color 300ms;
}

.app-header-inner {
  max-width: 1400px;
  margin: 0 auto;
  height: 64px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  position: relative; /* anchor for the utilities popover */
}

/* ----- Left cluster: brand + (editor breadcrumb) ----- */
.app-header-left {
  display: flex;
  align-items: center;
  gap: 20px;
  min-width: 0;
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-shrink: 0;
  text-decoration: none;
  color: inherit;
}

.brand-mark {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--paper);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 15px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transform: translateY(3px);
}

.brand-name {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 22px;
  letter-spacing: -0.02em;
  color: var(--ink);
}

.brand-tag {
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-3);
  padding: 3px 7px;
  border: 1px solid var(--rule-soft-light);
  border-radius: 4px;
  transform: translateY(-3px);
}

.editor-breadcrumb {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--ink-3);
  min-width: 0;
}
.editor-breadcrumb[hidden] { display: none; }
.editor-breadcrumb .chevron {
  flex-shrink: 0;
  color: var(--ink-3);
}
.editor-breadcrumb-separator {
  color: var(--ink-4);
}
.editor-breadcrumb-title {
  color: var(--ink);
  font-family: var(--font-display);
  font-style: italic;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 280px;
}

/* ----- Contained editor toolbar ----- */
.app-header .toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: var(--paper-2);
  border-radius: 10px;
  border: 1px solid var(--rule-soft-light);
}
.app-header .toolbar.hidden { display: none; }
.app-header .toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
}
.app-header .toolbar-group + .toolbar-group {
  margin-left: 4px;
  padding-left: 6px;
  border-left: 1px solid var(--rule-soft-light);
}
.app-header .toolbar-btn {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  color: var(--ink-2);
  background: none;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 150ms, color 150ms;
}
.app-header .toolbar-btn:hover {
  background: var(--paper);
  color: var(--ink);
}
.app-header .toolbar-btn .toolbar-icon {
  width: 16px;
  height: 16px;
  stroke-width: 2;
}

/* ----- Right cluster ----- */
.app-header-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.app-header-utilities {
  display: flex;
  align-items: center;
  gap: 2px;
}

.iconbtn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-2);
  background: none;
  border: none;
  cursor: pointer;
  transition: background 150ms, color 150ms;
  position: relative;
}
.iconbtn:hover {
  background: var(--paper-2);
  color: var(--ink);
}
.iconbtn svg {
  width: 18px;
  height: 18px;
  display: block;
}
.iconbtn.text-icon {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 16px;
  color: var(--ink-2);
}
.iconbtn.hidden { display: none; }

/* Theme/sound: two SVGs, one hidden at a time */
.iconbtn[data-icon-state="light"] .icon-moon { display: block; }
.iconbtn[data-icon-state="light"] .icon-sun { display: none; }
.iconbtn[data-icon-state="dark"] .icon-moon { display: none; }
.iconbtn[data-icon-state="dark"] .icon-sun { display: block; }
.iconbtn[data-icon-state="on"] .icon-sound-on { display: block; }
.iconbtn[data-icon-state="on"] .icon-sound-off { display: none; }
.iconbtn[data-icon-state="off"] .icon-sound-on { display: none; }
.iconbtn[data-icon-state="off"] .icon-sound-off { display: block; }

.divider {
  width: 1px;
  height: 20px;
  background: var(--rule-soft-light);
  margin: 0 4px;
  flex-shrink: 0;
}

/* ----- Language pill (wraps the existing #language-selector) ----- */
.app-header .language-selector {
  position: relative;
}
.app-header .lang-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink-2);
  padding: 7px 12px;
  border: 1px solid var(--rule-soft-light);
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  transition: border-color 200ms, color 200ms;
}
.app-header .lang-pill:hover {
  border-color: var(--ink);
  color: var(--ink);
}
.app-header .lang-pill .language-flag {
  font-size: 14px;
  line-height: 1;
}
.app-header .lang-pill .lang-chevron {
  width: 10px;
  height: 10px;
  opacity: 0.5;
}

/* Existing dropdown options popover — keep its behavior, refresh styling */
.app-header .language-dropdown-options {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  background: var(--paper);
  border: 1px solid var(--rule-soft-light);
  border-radius: 10px;
  padding: 4px;
  min-width: 160px;
  box-shadow: 0 10px 30px -10px rgba(26, 25, 22, 0.2);
  z-index: 110;
  display: none;
}
.app-header .language-selector.open .language-dropdown-options { display: block; }
.app-header .language-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  font-size: 13px;
  color: var(--ink-2);
  border-radius: 6px;
  cursor: pointer;
}
.app-header .language-option:hover {
  background: var(--paper-2);
  color: var(--ink);
}

/* ----- Primary "Create Lobby" CTA ----- */
.app-header #start-hosting-header-small.btn {
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 14px;
  padding: 9px 16px;
  border-radius: 999px;
  background: var(--accent-terracotta);
  color: #fff;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: background 200ms;
  white-space: nowrap;
}
.app-header #start-hosting-header-small.btn:hover {
  background: var(--accent-terracotta-deep);
}
.app-header #start-hosting-header-small.hidden { display: none; }

/* ----- User chip ----- */
.app-header .user-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px 5px 5px;
  border: 1px solid var(--rule-soft-light);
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  transition: border-color 200ms;
  font-family: var(--font-body);
}
.app-header .user-chip:hover { border-color: var(--ink); }
.app-header .user-chip-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--ink);
  color: var(--paper);
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.app-header .user-chip.anonymous .user-chip-avatar {
  background: var(--paper-2);
  color: var(--ink-3);
  border: 1px dashed var(--rule-soft-light);
}
.app-header .user-chip-name {
  font-size: 13px;
  color: var(--ink-2);
}

/* ----- Overflow collapse behavior ----- */
/* Default (wide + no editor toolbar): utilities inline, overflow toggle hidden */
.app-header #utility-overflow-toggle { display: none; }

/* Collapsed state 1: editor toolbar visible */
body.has-editor-toolbar .app-header .app-header-utilities { display: none; }
body.has-editor-toolbar .app-header #utility-overflow-toggle { display: inline-flex; }

/* Collapsed state 2: narrow viewport */
@media (max-width: 899px) {
  .app-header .app-header-utilities { display: none; }
  .app-header #utility-overflow-toggle { display: inline-flex; }
}

/* Popover reveal when the toggle is active */
.app-header.overflow-open .app-header-utilities {
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: absolute;
  right: 24px;
  top: calc(100% + 6px);
  background: var(--paper);
  border: 1px solid var(--rule-soft-light);
  border-radius: 10px;
  padding: 6px;
  box-shadow: 0 10px 30px -10px rgba(26, 25, 22, 0.2);
  z-index: 105;
}

/* ----- Responsive tightening ----- */
@media (max-width: 639px) {
  .app-header-inner {
    height: 56px;
    padding: 0 16px;
    gap: 12px;
  }
  .brand-tag { display: none; }
  .app-header .lang-pill .language-name { display: none; }
}

@media (max-width: 479px) {
  .brand-name { display: none; }
  .app-header .user-chip-name { display: none; }
  .app-header-right { gap: 4px; }
}

/* ----- Hide skip-link offset if our header replaces prior spacing ----- */
/* (Skip link styled elsewhere — keep default target offset behavior.)   */
```

- [ ] **Step 2: Confirm file exists**

Run: `ls -la public/css/header.css && wc -l public/css/header.css`
Expected: file present, ~260 lines.

- [ ] **Step 3: Commit**

```bash
git add public/css/header.css
git commit -m "feat(css): add editorial app-header stylesheet"
```

---

## Task 4: Wire `header.css` into the bundle

**Files:**
- Modify: `public/css/main.css`

- [ ] **Step 1: Add the import**

Open `public/css/main.css`, find the existing `@import` list. Add `header.css` immediately after `base.css` (so its tokens resolve against base, but it loads before components/layout so later rules can still override scoped cases if needed):

```css
@import "base.css";
@import "header.css";          /* ← add this line */
@import "layout.css";
/* ...rest unchanged... */
```

- [ ] **Step 2: Verify the import is present**

Run: `grep -n "header.css" public/css/main.css`
Expected: one match inside the `@import` list, right after `base.css`.

- [ ] **Step 3: Commit**

```bash
git add public/css/main.css
git commit -m "chore(css): import header.css into the main bundle"
```

---

## Task 5: Create `public/js/ui/header-controller.js`

**Files:**
- Create: `public/js/ui/header-controller.js`

- [ ] **Step 1: Write the failing unit test first**

Create `tests/unit/header-controller.test.js`:

```js
/**
 * @jest-environment jsdom
 */

import {
  initHeaderController,
  syncEditorBreadcrumbTitle,
  setThemeIconState,
  setSoundIconState,
  openOverflowMenu,
  closeOverflowMenu
} from '../../public/js/ui/header-controller.js';

function buildHeaderDom() {
  document.body.innerHTML = `
    <header class="app-header">
      <div class="app-header-inner">
        <div class="app-header-left">
          <a class="brand" href="#"></a>
          <div class="editor-breadcrumb" id="editor-breadcrumb" hidden>
            <span class="editor-breadcrumb-title" id="editor-breadcrumb-title"
                  data-translate="header_untitled_quiz">Untitled quiz</span>
          </div>
        </div>
        <div class="app-header-right">
          <div class="app-header-utilities" id="app-header-utilities">
            <button id="theme-toggle" class="iconbtn" data-icon-state="light"></button>
            <button id="sound-toggle" class="iconbtn" data-icon-state="on"></button>
          </div>
          <button id="utility-overflow-toggle" class="iconbtn hidden"
                  aria-haspopup="true" aria-expanded="false"></button>
        </div>
      </div>
    </header>
    <input id="quiz-title" type="text" value="">
  `;
}

describe('header-controller', () => {
  beforeEach(() => buildHeaderDom());

  describe('syncEditorBreadcrumbTitle', () => {
    test('writes quiz-title input value into breadcrumb', () => {
      document.getElementById('quiz-title').value = 'Matemática 4° medio';
      syncEditorBreadcrumbTitle();
      expect(document.getElementById('editor-breadcrumb-title').textContent)
        .toBe('Matemática 4° medio');
    });

    test('falls back to translated placeholder when empty', () => {
      document.getElementById('quiz-title').value = '   ';
      syncEditorBreadcrumbTitle();
      const el = document.getElementById('editor-breadcrumb-title');
      // Placeholder is the existing textContent (set by i18n elsewhere)
      expect(el.textContent.length).toBeGreaterThan(0);
      expect(el.textContent).not.toBe('   ');
    });
  });

  describe('setThemeIconState', () => {
    test('flips data-icon-state on #theme-toggle', () => {
      setThemeIconState('dark');
      expect(document.getElementById('theme-toggle').dataset.iconState).toBe('dark');
      setThemeIconState('light');
      expect(document.getElementById('theme-toggle').dataset.iconState).toBe('light');
    });
  });

  describe('setSoundIconState', () => {
    test('flips data-icon-state on #sound-toggle', () => {
      setSoundIconState('off');
      expect(document.getElementById('sound-toggle').dataset.iconState).toBe('off');
    });
  });

  describe('overflow menu', () => {
    test('openOverflowMenu adds .overflow-open on header and sets aria-expanded', () => {
      openOverflowMenu();
      expect(document.querySelector('.app-header').classList.contains('overflow-open')).toBe(true);
      expect(document.getElementById('utility-overflow-toggle').getAttribute('aria-expanded')).toBe('true');
    });

    test('closeOverflowMenu removes the class and flips aria-expanded', () => {
      openOverflowMenu();
      closeOverflowMenu();
      expect(document.querySelector('.app-header').classList.contains('overflow-open')).toBe(false);
      expect(document.getElementById('utility-overflow-toggle').getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('initHeaderController', () => {
    test('binds toggle click to open/close overflow', () => {
      initHeaderController();
      const btn = document.getElementById('utility-overflow-toggle');
      btn.click();
      expect(document.querySelector('.app-header').classList.contains('overflow-open')).toBe(true);
      btn.click();
      expect(document.querySelector('.app-header').classList.contains('overflow-open')).toBe(false);
    });

    test('outside click closes an open menu', () => {
      initHeaderController();
      document.getElementById('utility-overflow-toggle').click();
      expect(document.querySelector('.app-header').classList.contains('overflow-open')).toBe(true);
      document.body.click();
      expect(document.querySelector('.app-header').classList.contains('overflow-open')).toBe(false);
    });

    test('Escape key closes an open menu', () => {
      initHeaderController();
      document.getElementById('utility-overflow-toggle').click();
      expect(document.querySelector('.app-header').classList.contains('overflow-open')).toBe(true);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(document.querySelector('.app-header').classList.contains('overflow-open')).toBe(false);
    });

    test('typing in #quiz-title live-updates the breadcrumb', () => {
      initHeaderController();
      const input = document.getElementById('quiz-title');
      input.value = 'Física I';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(document.getElementById('editor-breadcrumb-title').textContent).toBe('Física I');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/header-controller.test.js`
Expected: FAIL — "Cannot find module '../../public/js/ui/header-controller.js'".

- [ ] **Step 3: Create the module**

Create `public/js/ui/header-controller.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/header-controller.test.js`
Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/header-controller.js tests/unit/header-controller.test.js
git commit -m "feat(ui): add header-controller with breadcrumb, overflow, and icon-state"
```

---

## Task 6: Replace the `<header>` block in `public/index.html`

**Files:**
- Modify: `public/index.html` (lines ~413–707, the `<header>...</header>` block immediately inside `<div class="container">`)

- [ ] **Step 1: Locate the exact block to replace**

Run:
```bash
grep -n "^        <header>\|^        </header>" public/index.html
```
Expected: two matches. Confirm the opening is around line 414 and the closing around line 707.

- [ ] **Step 2: Replace the block with this markup**

Use the Edit tool to replace from `        <header>` through `        </header>` (inclusive) with:

```html
        <header class="app-header" role="banner">
            <div class="app-header-inner">
                <div class="app-header-left">
                    <a href="#" class="brand" onclick="returnToMainFromHeader(); return false;" aria-label="Quizix Pro home">
                        <span class="brand-mark" aria-hidden="true">Q</span>
                        <span class="brand-name">Quizix</span>
                        <span class="brand-tag" aria-hidden="true">Pro</span>
                    </a>
                    <div class="editor-breadcrumb" id="editor-breadcrumb" hidden>
                        <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
                             aria-hidden="true">
                            <path d="M9 18l6-6-6-6"></path>
                        </svg>
                        <span data-translate="header_editor">Editor</span>
                        <span class="editor-breadcrumb-separator" aria-hidden="true">·</span>
                        <span class="editor-breadcrumb-title" id="editor-breadcrumb-title"
                              data-translate="header_untitled_quiz">Untitled quiz</span>
                    </div>
                </div>

                <!-- Horizontal Toolbar (shown only in host editing mode) -->
                <div class="horizontal-toolbar toolbar hidden" id="horizontal-toolbar" role="toolbar"
                     aria-label="Quiz editing tools">
                    <div class="toolbar-group" role="group" aria-label="Question management">
                        <button class="toolbar-btn" id="toolbar-add-question"
                                data-translate-title="add_question_tooltip" aria-label="Add question"
                                data-translate-aria-label="add_question_tooltip">
                            <svg class="toolbar-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24"
                                 fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                                 stroke-linejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                        </button>
                        <button class="toolbar-btn" id="toolbar-save" data-translate-title="save_quiz_tooltip"
                                aria-label="Save quiz" data-translate-aria-label="save_quiz_tooltip">
                            <svg class="toolbar-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24"
                                 fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                                 stroke-linejoin="round">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                <polyline points="7 3 7 8 15 8"></polyline>
                            </svg>
                        </button>
                        <button class="toolbar-btn" id="toolbar-load" data-translate-title="load_quiz_tooltip"
                                aria-label="Load quiz" data-translate-aria-label="load_quiz_tooltip">
                            <svg class="toolbar-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24"
                                 fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                                 stroke-linejoin="round">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                            </svg>
                        </button>
                    </div>
                    <div class="toolbar-group" role="group" aria-label="Tools">
                        <button class="toolbar-btn" id="toolbar-ai-gen" data-translate-title="ai_generator_tooltip"
                                aria-label="AI question generator" data-translate-aria-label="ai_generator_tooltip">
                            <svg class="toolbar-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24"
                                 fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                                 stroke-linejoin="round">
                                <path d="M12 8V4H8"></path>
                                <rect x="4" y="8" width="16" height="12" rx="2" ry="2"></rect>
                                <path d="M2 14h2"></path>
                                <path d="M20 14h2"></path>
                                <path d="M15 13v2"></path>
                                <path d="M9 13v2"></path>
                            </svg>
                        </button>
                        <button class="toolbar-btn" id="toolbar-settings" data-translate-title="quiz_settings_tooltip"
                                aria-label="Quiz settings" data-translate-aria-label="quiz_settings_tooltip"
                                onclick="openQuizSettingsModal()">
                            <svg class="toolbar-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24"
                                 fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                                 stroke-linejoin="round">
                                <circle cx="12" cy="12" r="3"></circle>
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                            </svg>
                        </button>
                        <button class="toolbar-btn" id="toolbar-import" data-translate-title="import_quiz_tooltip"
                                aria-label="Import quiz" data-translate-aria-label="import_quiz_tooltip">
                            <svg class="toolbar-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24"
                                 fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                                 stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                        </button>
                        <button class="toolbar-btn" id="toolbar-export" data-translate-title="export_quiz_tooltip"
                                aria-label="Export quiz" data-translate-aria-label="export_quiz_tooltip">
                            <svg class="toolbar-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24"
                                 fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                                 stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="17 8 12 3 7 8"></polyline>
                                <line x1="12" y1="3" x2="12" y2="15"></line>
                            </svg>
                        </button>
                        <button class="toolbar-btn" id="toolbar-results" data-translate-title="view_results_tooltip"
                                aria-label="View results" data-translate-aria-label="view_results_tooltip">
                            <svg class="toolbar-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24"
                                 fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                                 stroke-linejoin="round">
                                <line x1="18" y1="20" x2="18" y2="10"></line>
                                <line x1="12" y1="20" x2="12" y2="4"></line>
                                <line x1="6" y1="20" x2="6" y2="14"></line>
                            </svg>
                        </button>
                    </div>
                    <div class="toolbar-group" role="group" aria-label="Navigation">
                        <button class="toolbar-btn" id="toolbar-top" data-translate-title="back_to_top_tooltip"
                                aria-label="Back to top" data-translate-aria-label="back_to_top_tooltip">
                            <svg class="toolbar-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24"
                                 fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                                 stroke-linejoin="round">
                                <line x1="12" y1="19" x2="12" y2="5"></line>
                                <polyline points="5 12 12 5 19 12"></polyline>
                            </svg>
                        </button>
                        <button class="toolbar-btn" id="toolbar-bottom" data-translate-title="go_to_bottom_tooltip"
                                aria-label="Go to bottom" data-translate-aria-label="go_to_bottom_tooltip">
                            <svg class="toolbar-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24"
                                 fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                                 stroke-linejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <polyline points="19 12 12 19 5 12"></polyline>
                            </svg>
                        </button>
                    </div>
                </div>

                <div class="app-header-right">
                    <div class="app-header-utilities" id="app-header-utilities">
                        <button id="font-size-toggle" class="iconbtn text-icon"
                                data-translate-title="adjust_font_size_tooltip" aria-label="Adjust font size"
                                data-translate-aria-label="adjust_font_size_tooltip" onclick="toggleGlobalFontSize();">
                            <span id="font-size-icon" aria-hidden="true">A</span>
                        </button>
                        <button id="fullscreen-toggle" class="iconbtn"
                                data-translate-title="toggle_fullscreen_tooltip" aria-label="Toggle fullscreen"
                                data-translate-aria-label="toggle_fullscreen_tooltip" aria-pressed="false">
                            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5"></path>
                            </svg>
                        </button>
                        <button id="theme-toggle" class="iconbtn" data-icon-state="light"
                                data-translate-title="toggle_dark_mode_tooltip" aria-label="Toggle dark mode"
                                data-translate-aria-label="toggle_dark_mode_tooltip" aria-pressed="false">
                            <svg class="icon-moon" aria-hidden="true" viewBox="0 0 24 24" fill="none"
                                 stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path>
                            </svg>
                            <svg class="icon-sun" aria-hidden="true" viewBox="0 0 24 24" fill="none"
                                 stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="5"></circle>
                                <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"></path>
                            </svg>
                        </button>
                        <button id="sound-toggle" class="iconbtn" data-icon-state="on"
                                data-translate-title="toggle_sound_tooltip" aria-label="Toggle sound"
                                data-translate-aria-label="toggle_sound_tooltip" aria-pressed="true">
                            <svg class="icon-sound-on" aria-hidden="true" viewBox="0 0 24 24" fill="none"
                                 stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                                <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"></path>
                            </svg>
                            <svg class="icon-sound-off" aria-hidden="true" viewBox="0 0 24 24" fill="none"
                                 stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                                <line x1="22" y1="9" x2="16" y2="15"></line>
                                <line x1="16" y1="9" x2="22" y2="15"></line>
                            </svg>
                        </button>
                    </div>
                    <button id="utility-overflow-toggle" class="iconbtn" aria-haspopup="true" aria-expanded="false"
                            aria-controls="app-header-utilities" aria-label="More options">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="5" cy="12" r="1"></circle>
                            <circle cx="12" cy="12" r="1"></circle>
                            <circle cx="19" cy="12" r="1"></circle>
                        </svg>
                    </button>

                    <span class="divider" aria-hidden="true"></span>

                    <button id="desktop-return-to-main" class="iconbtn" hidden
                            data-translate-title="return_to_main" aria-label="Return to main menu"
                            data-translate-aria-label="return_to_main" onclick="returnToMainFromHeader()">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-7h4v7h4a1 1 0 001-1V10"></path>
                        </svg>
                    </button>

                    <!-- Language selector — reuses existing dropdown logic, new pill styling -->
                    <div class="language-selector" id="language-selector" data-onclick="toggleLanguageDropdown">
                        <button type="button" class="lang-pill">
                            <span class="language-flag">🇪🇸</span>
                            <span class="language-name">Español</span>
                            <svg class="lang-chevron" viewBox="0 0 10 10" aria-hidden="true">
                                <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"></path>
                            </svg>
                        </button>
                        <div class="language-dropdown-options" id="language-options">
                            <div class="language-option" data-value="es" onclick="selectLanguage('es', event)">
                                <span class="language-flag">🇪🇸</span>
                                <span class="language-name" data-translate="language_es">Español</span>
                            </div>
                            <div class="language-option" data-value="en" onclick="selectLanguage('en', event)">
                                <span class="language-flag">🇺🇸</span>
                                <span class="language-name" data-translate="language_en">English</span>
                            </div>
                            <div class="language-option" data-value="fr" onclick="selectLanguage('fr', event)">
                                <span class="language-flag">🇫🇷</span>
                                <span class="language-name" data-translate="language_fr">Français</span>
                            </div>
                            <div class="language-option" data-value="de" onclick="selectLanguage('de', event)">
                                <span class="language-flag">🇩🇪</span>
                                <span class="language-name" data-translate="language_de">Deutsch</span>
                            </div>
                            <div class="language-option" data-value="it" onclick="selectLanguage('it', event)">
                                <span class="language-flag">🇮🇹</span>
                                <span class="language-name" data-translate="language_it">Italiano</span>
                            </div>
                            <div class="language-option" data-value="pt" onclick="selectLanguage('pt', event)">
                                <span class="language-flag">🇵🇹</span>
                                <span class="language-name" data-translate="language_pt">Português</span>
                            </div>
                            <div class="language-option" data-value="pl" onclick="selectLanguage('pl', event)">
                                <span class="language-flag">🇵🇱</span>
                                <span class="language-name" data-translate="language_pl">Polski</span>
                            </div>
                            <div class="language-option" data-value="ja" onclick="selectLanguage('ja', event)">
                                <span class="language-flag">🇯🇵</span>
                                <span class="language-name" data-translate="language_ja">日本語</span>
                            </div>
                            <div class="language-option" data-value="zh" onclick="selectLanguage('zh', event)">
                                <span class="language-flag">🇨🇳</span>
                                <span class="language-name" data-translate="language_zh">中文</span>
                            </div>
                        </div>
                    </div>

                    <span class="divider" aria-hidden="true"></span>

                    <button id="start-hosting-header-small" class="btn hidden"
                            data-translate-title="start_quiz_tooltip">
                        <span data-translate="create_lobby">Create Lobby</span>
                        <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
                            <path d="M1 7h12M8 2l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8"
                                  stroke-linecap="round" stroke-linejoin="round"></path>
                        </svg>
                    </button>

                    <button id="user-chip" class="user-chip anonymous" type="button"
                            data-translate-title="auth_signin_tooltip" aria-label="Sign in to your account"
                            data-translate-aria-label="auth_signin_tooltip">
                        <span class="user-chip-avatar" aria-hidden="true">?</span>
                        <span class="user-chip-name" data-translate="auth_signin_short">Sign in</span>
                    </button>
                </div>
            </div>
        </header>
```

- [ ] **Step 3: Verify the old mobile-header blocks are gone**

Run:
```bash
grep -c "mobile-title\|mobile-header-controls\|theme-toggle-mobile-header\|sound-toggle-mobile-header\|mobile-language-selector-header\|mobile-return-to-main" public/index.html
```
Expected: `0`.

- [ ] **Step 4: Verify preserved IDs still exist**

Run:
```bash
for id in font-size-toggle fullscreen-toggle theme-toggle sound-toggle user-chip start-hosting-header-small desktop-return-to-main horizontal-toolbar language-selector toolbar-add-question toolbar-save toolbar-load toolbar-ai-gen toolbar-settings toolbar-import toolbar-export toolbar-results toolbar-top toolbar-bottom; do
  grep -q "id=\"$id\"" public/index.html && echo "OK: $id" || echo "MISSING: $id"
done
```
Expected: every line says `OK: ...`.

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "feat(html): replace header with unified editorial layout"
```

---

## Task 7: Update the inline DOMContentLoaded script in `index.html`

**Files:**
- Modify: `public/index.html` (inline `<script>` around line 90–250)

- [ ] **Step 1: Find the theme-icon emoji block**

Run:
```bash
grep -n "theme-toggle-mobile-header\|const themeToggleButtons\|fontIcon\|const emoji" public/index.html
```
Locate the DOMContentLoaded block that builds `themeToggleButtons` from `theme-toggle` and `theme-toggle-mobile-header`. This block lives in the inline `<script>` inside `<head>` (around line 142–195).

- [ ] **Step 2: Replace that block**

Find this code (use Edit tool, match exactly):

```js
                // Initialize theme toggles (desktop and mobile)
                const themeToggleButtons = [
                    document.getElementById('theme-toggle'),
                    document.getElementById('theme-toggle-mobile-header')
                ].filter(button => button !== null);

                const fontIcon = document.getElementById('font-size-icon');

                themeToggleButtons.forEach(button => {
                    const iconSpan = button.querySelector('.control-icon');
                    const emoji = initialTheme === 'dark' ? '🌙' : '☀️';

                    if (iconSpan) {
                        iconSpan.textContent = emoji;
                    } else {
                        button.textContent = emoji;
                    }
                });
```

Replace with:

```js
                // Initialize theme icon state (SVG swap is driven by data-icon-state)
                const themeToggle = document.getElementById('theme-toggle');
                if (themeToggle) {
                    themeToggle.dataset.iconState = initialTheme === 'dark' ? 'dark' : 'light';
                    themeToggle.setAttribute('aria-pressed', initialTheme === 'dark' ? 'true' : 'false');
                }

                const fontIcon = document.getElementById('font-size-icon');
```

- [ ] **Step 3: Also find the mobile language pre-set block**

Look for `document.querySelectorAll('.language-dropdown-selected')`. It iterates over both the desktop and mobile language dropdowns. Since the mobile dropdown is gone, the same `querySelectorAll` will now return only one match — no code change needed, but verify:

```bash
grep -n "language-dropdown-selected" public/index.html
```
Expected: one match inside the inline script (the loop), plus occurrences inside `#language-selector`. The loop still works correctly.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "chore(html): drop mobile-header theme-toggle from inline init"
```

---

## Task 8: Wire `body.has-editor-toolbar` and breadcrumb visibility in `ui-manager.js`

**Files:**
- Modify: `public/js/ui/ui-manager.js` at 3 call sites that toggle `#horizontal-toolbar`

- [ ] **Step 1: Add a small helper near the top of the file**

Read `public/js/ui/ui-manager.js` and identify the top of the file (after imports). Add this helper function right after the imports:

```js
function setEditorHeaderState(visible) {
    document.body.classList.toggle('has-editor-toolbar', visible);
    const breadcrumb = document.getElementById('editor-breadcrumb');
    if (breadcrumb) {
        if (visible) breadcrumb.removeAttribute('hidden');
        else breadcrumb.setAttribute('hidden', '');
    }
    // Keep the breadcrumb title in sync whenever the editor becomes visible
    if (visible && window.headerController && typeof window.headerController.sync === 'function') {
        window.headerController.sync();
    }
}
```

- [ ] **Step 2: Call `setEditorHeaderState(true)` and `(false)` alongside each toolbar show/hide**

At line 121 (already found via grep), the pattern looks like:

```js
const horizontalToolbar = dom.get('horizontal-toolbar');
// ...
if (horizontalToolbar) {
    horizontalToolbar.classList.add('hidden');
    horizontalToolbar.classList.remove('visible-flex');
}
```

For **every** place the toolbar is **hidden** (add `hidden`, remove `visible-flex`), add `setEditorHeaderState(false);` on the next line.

For **every** place the toolbar is **shown** (remove `hidden`, add `visible-flex`), add `setEditorHeaderState(true);` on the next line.

Use the Edit tool on each of the 3 call sites (121, 324, 388). Read context with 10 lines around each before editing.

- [ ] **Step 3: Run the existing test suite to confirm no regression**

Run: `npx jest --testPathIgnorePatterns=e2e`
Expected: pre-existing tests pass (or fail with the same pre-existing failures as main).

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/ui-manager.js
git commit -m "feat(ui): toggle body.has-editor-toolbar with horizontal toolbar visibility"
```

---

## Task 9: Initialize `header-controller.js` in the app bootstrap

**Files:**
- Modify: `public/js/core/app.js`

- [ ] **Step 1: Add the import near other ui imports**

Open `public/js/core/app.js`. Find the import block at the top. Add:

```js
import { initHeaderController, syncEditorBreadcrumbTitle, setSoundIconState } from '../ui/header-controller.js';
```

- [ ] **Step 2: Call `initHeaderController()` during app startup**

Find the app initialization entry point (likely an `init()`, `start()`, or `async function main()` method on an exported App/QuizApp class, or a top-level `document.addEventListener('DOMContentLoaded', ...)` handler). Add at the end of the init sequence:

```js
initHeaderController();
// Expose a minimal handle so ui-manager can call sync() on editor open
window.headerController = { sync: syncEditorBreadcrumbTitle };
```

- [ ] **Step 3: Remove the old `mobile-return-to-main` binding**

At line 388 (per the grep from Task 0), find:

```js
bindElement('mobile-return-to-main', 'click', () => this.resetAndReturnToMenu());
```

Remove this line. The `#desktop-return-to-main` button in the new header already has `onclick="returnToMainFromHeader()"` inline.

- [ ] **Step 4: Commit**

```bash
git add public/js/core/app.js
git commit -m "feat(app): initialize header-controller and drop mobile-return-to-main"
```

---

## Task 10: Clean up orphaned mobile-header references in other JS modules

**Files:**
- Modify: `public/js/main.js`
- Modify: `public/js/utils/globals.js`
- Modify: `public/js/utils/language-dropdown-manager.js`
- Modify: `public/js/settings/settings-manager.js`

The removed DOM IDs are: `theme-toggle-mobile-header`, `sound-toggle-mobile-header`, `mobile-language-selector-header`, `mobile-return-to-main`. Any `getElementById` / `dom.get` / hardcoded list entry for these needs to go.

- [ ] **Step 1: Clean up `public/js/main.js:33`**

Find:
```js
const mobileHeaderDropdown = document.getElementById('mobile-language-selector-header');
```
and the block that uses it. Remove the variable declaration and any subsequent branch that operates on `mobileHeaderDropdown` (should be a small `if (mobileHeaderDropdown) { ... }` block). Read 15 lines around line 33 before editing.

- [ ] **Step 2: Clean up `public/js/utils/globals.js` at lines 720 and 781**

Line 720 region: an array of button IDs including `'theme-toggle-mobile-header'`. Remove the string entry. Read context first.

Line 781 region: `const mobileReturnButton = dom.get('mobile-return-to-main');` and its use. Remove the declaration and any branch that uses it.

- [ ] **Step 3: Clean up `public/js/utils/language-dropdown-manager.js` at lines 122, 196, 234**

Lines 122 and 196 each declare `const mobileHeaderDropdown = document.getElementById('mobile-language-selector-header');` followed by a block operating on it. Remove the declaration and the whole block.

Line 234: `const allDropdownIds = ['language-selector', 'mobile-language-selector-header', 'mobile-language-selector'];`. Remove the `'mobile-language-selector-header'` entry. If `'mobile-language-selector'` is also unused elsewhere, leave it alone (scope of this plan = only `-header` IDs).

- [ ] **Step 4: Clean up `public/js/settings/settings-manager.js`**

Lines 97, 355, 461, 526, 538 — each does `dom.get('theme-toggle-mobile-header')` or `dom.get('sound-toggle-mobile-header')` inside a `.filter()` chain or a branch. Remove the entry from each array / delete the branch. Read context at each site first.

- [ ] **Step 5: Grep to confirm every mobile-header ID is gone from JS**

Run:
```bash
grep -rn "theme-toggle-mobile-header\|sound-toggle-mobile-header\|mobile-language-selector-header\|mobile-return-to-main" public/js/
```
Expected: no matches.

- [ ] **Step 6: Run the test suite**

Run: `npx jest --testPathIgnorePatterns=e2e`
Expected: all non-e2e tests pass (same baseline as before this PR).

- [ ] **Step 7: Commit**

```bash
git add public/js/
git commit -m "chore(js): remove references to deleted mobile-header elements"
```

---

## Task 11: Remove legacy header CSS from base.css / layout.css / components.css

**Files:**
- Modify: `public/css/base.css`
- Modify: `public/css/layout.css`
- Modify: `public/css/components.css`

- [ ] **Step 1: Find candidate rules in each file**

Run:
```bash
grep -n "\.desktop-title\|^header\|\.mobile-title\|\.mobile-header-controls\|\.header-controls\|\.font-size-control" public/css/base.css public/css/layout.css public/css/components.css
```

- [ ] **Step 2: Review each match and delete rules specific to the old header**

For each match, read the containing rule-block and decide:
- **Delete** if it targets `.desktop-title`, `header h1`, `.mobile-title`, `.mobile-header-controls`, `.header-controls` (the outer wrapper — our new wrapper is `.app-header-right`), or styles the old glass/blur/shadow on `header`.
- **Keep** if it targets something generic still used elsewhere (e.g., `.theme-toggle` as a utility class applied to non-header buttons — grep before deleting).

Before each delete, confirm the class isn't used outside the header:
```bash
grep -rn "class=\"[^\"]*\.CLASS_NAME" public/  # replace CLASS_NAME
```

- [ ] **Step 3: Re-grep to confirm dead rules are gone**

```bash
grep -n "\.desktop-title\|\.mobile-title\|\.mobile-header-controls" public/css/base.css public/css/layout.css public/css/components.css
```
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add public/css/
git commit -m "chore(css): remove legacy header rules superseded by header.css"
```

---

## Task 12: Rebuild bundle and bump service-worker cache

**Files:**
- Regenerate: `public/css/main.bundle.css`
- Modify: `public/sw.js`

- [ ] **Step 1: Rebuild the CSS bundle**

Run: `npm run build`
Expected: exits 0, regenerates `public/css/main.bundle.css` with the new header rules. Confirm with:
```bash
grep -c "app-header-inner\|brand-mark" public/css/main.bundle.css
```
Expected: >= 2.

- [ ] **Step 2: Bump `CACHE_VERSION` in sw.js**

Open `public/sw.js`, find the line near the top:
```js
const CACHE_VERSION = 'v<something>';
```

Change the value to a new unique string, e.g. `'v20260422-header-redesign'`.

- [ ] **Step 3: Bump the HTML preload version query string**

In `public/index.html`, the main bundle is loaded as:
```html
<link rel="stylesheet" href="css/main.bundle.css?v=49">
```
Bump `?v=49` to `?v=50` (and similarly for any other `?v=49` on `js/main.js`, `js/core/app.js`, `js/utils/translation-manager.js` — keep them consistent).

Run: `grep -n "?v=" public/index.html` to see all versioned URLs.

- [ ] **Step 4: Commit**

```bash
git add public/css/main.bundle.css public/sw.js public/index.html
git commit -m "chore: rebuild bundle and bump cache version for header redesign"
```

---

## Task 13: Manual smoke test against the acceptance criteria

**Files:** none modified; produces a checklist reflecting actual results.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
In a fresh incognito browser window (to dodge the old service-worker cache), open the app URL (typically `http://localhost:3000`). Hard refresh.

- [ ] **Step 2: Walk the acceptance criteria**

For each of the 12 criteria from the spec, verify in-browser and tick or file:

- [ ] AC1: Header renders at 64px (inspect `.app-header-inner` → `height: 64px`); flat `var(--paper)` bg; 1px hairline bottom border; no blur/shadow.
- [ ] AC2: Brand lockup shows (Q mark + Fraunces "Quizix" + "PRO" pill). Click → returns to main menu.
- [ ] AC3: Four utility buttons (font-size "A" / fullscreen / theme / sound) render as the specified SVGs. Click theme → SVG swaps moon ↔ sun. Click sound → speaker ↔ muted.
- [ ] AC4: Click "Host a Game" or open the editor → breadcrumb "Editor · *<quiz title>*" appears in the left cluster; utility buttons collapse into `···`; "Create Lobby" CTA is visible on the right. Typing in the quiz title input live-updates the breadcrumb.
- [ ] AC5: Resize browser below 900px → utility buttons collapse into overflow menu even without editor mode.
- [ ] AC6: Resize below 640px → brand-tag "PRO" hidden, language shows flag only, header height 56px.
- [ ] AC7: Resize below 480px → brand-name "Quizix" hidden (Q mark only), user-chip shows avatar only.
- [ ] AC8: Click each existing handler to confirm it still fires: theme toggle, sound toggle, font-size cycle, fullscreen, language selection (dropdown opens, switching language retranslates page), start-hosting, user-chip (opens sign-in modal), every toolbar-btn.
- [ ] AC9: Toggle dark mode → header, brand mark, user chip, toolbar, overflow menu all switch to ink palette with readable contrast.
- [ ] AC10: `npm run build` exit 0 (done in Task 12); hard refresh in incognito shows new header.
- [ ] AC11: On a real mobile (or DevTools device mode, e.g. iPhone 12 Pro): no horizontal scroll, no clipped content, tap targets remain >= 36×36.
- [ ] AC12: `console` clean (no errors on load); landing page (`.lp-*` sections below the header) still renders unchanged.

- [ ] **Step 3: Fix any criterion that fails**

For each failure, make a targeted edit, commit with a message starting `fix(header): ...`, and re-verify that one criterion.

- [ ] **Step 4: Final-state commit**

If no fixes were needed, skip. Otherwise this was covered by step 3 commits.

---

## Self-review

**Spec coverage:** Every spec section has a task:
- "Files touched" table → Tasks 1 (translations), 3 (new header.css), 4 (wire into bundle), 5 (header-controller.js + tests), 6 (index.html markup), 7 (inline init), 8 (ui-manager.js toggle), 9 (core/app.js init), 10 (orphaned mobile refs), 11 (legacy CSS cleanup), 12 (bundle + cache), plus Task 2 for the optional variables.css dark-map check.
- DOM structure → Task 6.
- Responsive behavior → Task 3 (CSS) + Task 13 (verify).
- Interactions → Task 5 (unit tests + implementation).
- CSS approach → Task 3.
- Translations → Task 1.
- Risks → mitigations are called out in the tasks (grep-before-delete in 10/11, cache bump in 12, dark mapping in 2, selector verification via Task 5 tests).
- Acceptance criteria → Task 13 walkthrough.

**Placeholder scan:** No `TBD`, no "add appropriate error handling", no "write tests for the above" without actual test code — Task 5 has a full test file. Task 11's "Delete if ..." list is a decision rule, not a placeholder: the rule itself is the action.

**Type consistency:** Exported function names are stable across tasks — `initHeaderController`, `syncEditorBreadcrumbTitle`, `setThemeIconState`, `setSoundIconState`, `openOverflowMenu`, `closeOverflowMenu`. The `window.headerController.sync` handle defined in Task 9 is consumed by Task 8's `setEditorHeaderState`. CSS class names (`app-header`, `app-header-inner`, `app-header-left`, `app-header-right`, `app-header-utilities`, `brand`, `brand-mark`, `brand-name`, `brand-tag`, `iconbtn`, `divider`, `lang-pill`, `user-chip`, `toolbar`, `editor-breadcrumb`, `overflow-open`, `has-editor-toolbar`) match between the stylesheet (Task 3), the markup (Task 6), the controller tests (Task 5), and the body-toggle helper (Task 8).

Plan saved; ready for execution.
