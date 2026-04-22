# Header redesign — design spec

**Date:** 2026-04-22
**Status:** Draft, awaiting user review
**Source design:** `design_handoff_landing/HEADER.md` + `design_handoff_landing/Header.html`

## Goal

Replace the current `<header>` in `public/index.html` with the editorial paper/ink design from the handoff. The landing page redesign already shipped; the header still carries the old indigo/glass vocabulary and needs to match.

## Scope

In scope:
- Replace header markup and CSS to match the handoff's visual vocabulary: brand lockup (Q mark + Fraunces "Quizix" + "PRO" pill), flat `var(--paper)` + 1px hairline bottom, 64px height, unified 18×18 SVG icon set (stroke 1.8), `.iconbtn` pills, contained `.toolbar` with group dividers, `.user-chip` styling, `.lang` pill.
- Add a minimal editor contextual state: when `#horizontal-toolbar` is visible, also show a breadcrumb "`Editor · <quiz title>`" in the left cluster.
- Collapse the 4 utility icons (font-size, fullscreen, theme, sound) into a `···` overflow menu when the toolbar is visible *or* the viewport is narrower than 900px.
- Unified responsive layout — one DOM tree, media-query reflow. Delete the existing duplicate `.mobile-title` / `.mobile-header-controls` trees.
- Swap the emoji theme icon for moon/sun SVGs, and the emoji sound icon for speaker-on/off SVGs.

Out of scope (deferred):
- Connection-status pill wired to Socket.IO ping.
- Live-game contextual state (PIN + player count + Q/N + timer in the middle, Pausar/Terminar juego on the right).
- Landing page (already shipped).

## Files touched

| File | Change |
|---|---|
| `public/index.html` | Replace `<header>` block at lines 414–707 (~290 lines) with ~110-line unified structure. Update DOMContentLoaded script at ~line 152 to drop mobile-header icon init and swap theme-icon logic from emoji to SVG class toggle. |
| `public/css/header.css` | **New.** ~220 lines. All header styles, no `!important`. |
| `public/css/main.css` | Add `@import "header.css";` after `variables.css` / `base.css`. |
| `public/css/base.css` | Remove rules targeting `.desktop-title`, `header h1`, legacy header glass/blur/shadow. |
| `public/css/layout.css` | Remove `.mobile-title` / `.mobile-header-controls` rules. |
| `public/css/components.css` | Remove `.theme-toggle`, `.sound-toggle`, `.font-size-control` rules if scoped to the old header (keep if reused elsewhere — verify). |
| `public/js/ui/header-controller.js` | **New small module.** Editor-breadcrumb title sync; overflow-menu open/close (click + outside-click + Esc); theme/sound SVG swap on state change. |
| `public/js/core/app.js` (or wherever `main.js` initialization chain runs) | Import and initialize `header-controller.js`. |
| `public/js/utils/translations/*.js` (9 files) | Add `header_editor` and `header_untitled_quiz` keys. |
| `public/sw.js` | Bump `CACHE_VERSION`. |
| `package.json` scripts — none; just run `npm run build`. |

## DOM structure

```html
<header class="app-header" role="banner">
  <div class="app-header-inner">
    <div class="app-header-left">
      <a class="brand" href="#" aria-label="Quizix Pro home">
        <span class="brand-mark">Q</span>
        <span class="brand-name">Quizix</span>
        <span class="brand-tag">Pro</span>
      </a>
      <div class="editor-breadcrumb" id="editor-breadcrumb" hidden>
        <svg class="chevron" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 18l6-6-6-6"/>
        </svg>
        <span data-translate="header_editor">Editor</span>
        <span class="editor-breadcrumb-separator">·</span>
        <span class="editor-breadcrumb-title" id="editor-breadcrumb-title"
              data-translate="header_untitled_quiz">Untitled quiz</span>
      </div>
    </div>

    <!-- Editor toolbar: existing markup reused, container restyled -->
    <div class="toolbar hidden" id="horizontal-toolbar" role="toolbar" aria-label="Quiz editing tools">
      <div class="toolbar-group" role="group"> ... toolbar-btn × 3 ... </div>
      <div class="toolbar-group" role="group"> ... toolbar-btn × 5 ... </div>
      <div class="toolbar-group" role="group"> ... toolbar-btn × 2 ... </div>
    </div>

    <div class="app-header-right">
      <div class="app-header-utilities" id="app-header-utilities">
        <button id="font-size-toggle" class="iconbtn text-icon"
                data-translate-title="adjust_font_size_tooltip"
                aria-label="Adjust font size" onclick="toggleGlobalFontSize()">
          <span id="font-size-icon">A</span>
        </button>
        <button id="fullscreen-toggle" class="iconbtn"
                data-translate-title="toggle_fullscreen_tooltip"
                aria-label="Toggle fullscreen" aria-pressed="false">
          <svg width="18" height="18" viewBox="0 0 24 24" ...>
            <path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5"/>
          </svg>
        </button>
        <button id="theme-toggle" class="iconbtn" data-icon-state="light"
                data-translate-title="toggle_dark_mode_tooltip"
                aria-label="Toggle dark mode" aria-pressed="false">
          <svg class="icon-moon" ...><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
          <svg class="icon-sun" hidden ...><circle cx="12" cy="12" r="5"/><path d="..."/></svg>
        </button>
        <button id="sound-toggle" class="iconbtn" data-icon-state="on"
                data-translate-title="toggle_sound_tooltip"
                aria-label="Toggle sound" aria-pressed="true">
          <svg class="icon-sound-on" ...>...</svg>
          <svg class="icon-sound-off" hidden ...>...</svg>
        </button>
      </div>
      <button id="utility-overflow-toggle" class="iconbtn hidden"
              aria-haspopup="true" aria-expanded="false"
              aria-controls="app-header-utilities"
              aria-label="More options">
        <svg width="18" height="18" viewBox="0 0 24 24" ...>
          <circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>
        </svg>
      </button>

      <span class="divider" aria-hidden="true"></span>

      <button id="desktop-return-to-main" class="iconbtn" hidden
              data-translate-title="return_to_main" aria-label="Return to main menu"
              onclick="returnToMainFromHeader()">
        <svg width="18" height="18" ...><path d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-7h4v7h4a1 1 0 001-1V10"/></svg>
      </button>

      <!-- Language pill — reuses existing #language-selector dropdown structure, restyled -->
      <div class="language-selector" id="language-selector"
           data-onclick="toggleLanguageDropdown">
        <button class="lang-pill" type="button">
          <span class="language-flag">🇪🇸</span>
          <span class="language-name">Español</span>
          <svg class="lang-chevron" width="10" height="10" viewBox="0 0 10 10">
            <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </button>
        <div class="language-dropdown-options" id="language-options">
          ...existing 9 language-option entries unchanged...
        </div>
      </div>

      <span class="divider" aria-hidden="true"></span>

      <button id="start-hosting-header-small" class="btn-primary hidden"
              data-translate-title="start_quiz_tooltip">
        <span data-translate="create_lobby">Create Lobby</span>
        <svg width="12" height="12" ...><path d="M1 7h12M8 2l5 5-5 5"/></svg>
      </button>

      <button id="user-chip" class="user-chip anonymous" type="button"
              data-translate-title="auth_signin_tooltip"
              aria-label="Sign in to your account"
              data-translate-aria-label="auth_signin_tooltip">
        <span class="user-chip-avatar" aria-hidden="true">?</span>
        <span class="user-chip-name" data-translate="auth_signin_short">Sign in</span>
      </button>
    </div>
  </div>
</header>
```

### Preserved IDs / event bindings

All existing event listeners continue to work because these IDs are preserved:
`font-size-toggle`, `fullscreen-toggle`, `theme-toggle`, `sound-toggle`, `user-chip`, `start-hosting-header-small`, `desktop-return-to-main`, `horizontal-toolbar` plus its 12 toolbar-btn child IDs (`toolbar-add-question`, `toolbar-save`, `toolbar-load`, `toolbar-ai-gen`, `toolbar-settings`, `toolbar-import`, `toolbar-export`, `toolbar-results`, `toolbar-top`, `toolbar-bottom`), `language-selector`.

### Removed markup

- `<h1 class="desktop-title">` (replaced by brand lockup)
- `<div class="mobile-title">` and all its children
- `<div class="mobile-header-controls">` including `mobile-return-to-main`, `mobile-language-selector-header`, `theme-toggle-mobile-header`, `sound-toggle-mobile-header`
- Separate `<div class="language-selector mobile-lang mobile-header">` (the desktop `#language-selector` now serves all widths)
- The outer `<div class="header-controls">` wrapper (replaced by `.app-header-right`)
- `<div class="font-size-control">` wrapper (font-size button becomes a plain `.iconbtn.text-icon`)

## Responsive behavior

One DOM tree; layout adapts via media queries and a `body` class:

| Condition | Effect |
|---|---|
| `body.has-editor-toolbar` (set by the same toggler that un-hides `#horizontal-toolbar`) | `.app-header-utilities` gets `hidden`; `#utility-overflow-toggle` shown. `.editor-breadcrumb` shown. |
| `@media (max-width: 899px)` | Same collapse to overflow menu as above, regardless of toolbar state. |
| `@media (max-width: 639px)` | `.brand-tag` hidden. Language pill shows flag only (`.language-name` hidden). Header height 56px. Inner padding `0 16px`. |
| `@media (max-width: 479px)` | `.brand-name` hidden (only Q mark). `.user-chip-name` hidden (avatar only). Toolbar groups stack or wrap. |

The overflow menu is the `.app-header-utilities` container itself, re-styled as a popover when collapsed. There is no separate menu element. Two states:

- **Inline** (default, wide screens, no editor toolbar): `.app-header-utilities` is a `display: flex` row inline with the rest of `.app-header-right`. `#utility-overflow-toggle` has `hidden`.
- **Collapsed** (editor toolbar visible OR viewport < 900px): `.app-header-utilities` gets `hidden` by default. `#utility-overflow-toggle` loses `hidden` and takes the 4 buttons' slot. On click it toggles a `.overflow-open` class on `.app-header` (and `aria-expanded` on the toggle); CSS rules then un-hide `.app-header-utilities` AND absolutely position it as a vertical popover:

    ```css
    .app-header.overflow-open .app-header-utilities {
      display: flex; flex-direction: column; gap: 2px;
      position: absolute; right: 24px; top: calc(100% + 6px);
      background: var(--paper); border: 1px solid var(--rule-soft-light);
      border-radius: 10px; padding: 6px;
      box-shadow: 0 10px 30px -10px rgba(26,25,22,0.2);
    }
    ```

This avoids moving DOM nodes (no `appendChild`) and keeps the 4 buttons as a single element whose event bindings never change.

## Interactions

1. **Brand click** — `href="#"` + `onclick="returnToMainFromHeader()"` (existing global).
2. **Editor breadcrumb title** — `header-controller.js` finds the quiz-title input (verify exact selector during implementation; candidate: `input#quiz-title` in the editor screen), binds `input` event, writes `.value.trim() || <translation of header_untitled_quiz>` into `#editor-breadcrumb-title`. Also runs once on screen-switch-to-editor.
3. **Editor-mode toggle** — wherever the app currently adds/removes `.hidden` from `#horizontal-toolbar`, also toggle `body.has-editor-toolbar` and show/hide `#editor-breadcrumb`.
4. **Overflow menu** — click `#utility-overflow-toggle`:
   - toggle `aria-expanded` on the toggle button;
   - toggle `.overflow-open` on the `.app-header` element (CSS reveals `.app-header-utilities` as an absolutely-positioned popover);
   - while open, document-level `click` listener closes on outside click;
   - `keydown` listener closes on Esc and restores focus to the toggle.
5. **Theme swap** — after the existing click handler flips `[data-theme]`, `header-controller.js` observes via `MutationObserver` on `documentElement` (or patches the handler) and swaps `hidden` between `#theme-toggle .icon-moon` and `.icon-sun`. Updates `data-icon-state` attribute so CSS can respond too.
6. **Sound swap** — same pattern, reading the sound state from its existing source of truth (localStorage key or global).
7. **Font-size** — unchanged behavior; the existing code already rewrites `#font-size-icon` text.
8. **Language pill** — existing `toggleLanguageDropdown` continues to work. The wrapper just gets new styles.

## CSS approach

- All new rules live in `public/css/header.css`.
- No `!important`; no inline styles for dynamic state (use classes and `[hidden]`).
- Tokens: `var(--paper)`, `var(--paper-2)`, `var(--ink)`, `var(--ink-2/3/4)`, `var(--rule-soft-light)` / `var(--rule-soft-dark)`, `var(--accent-terracotta)` / `-deep`, `var(--font-display)`, `var(--font-body)`, `var(--font-mono)`. All already exist in `variables.css`.
- Dark mode: confirm `variables.css` dark branch under `[data-theme="dark"]` remaps the editorial tokens (`--paper`, `--ink`, etc.) to the ink palette. If it doesn't, add the 8-line mapping during implementation.
- Heights: 64px desktop, 56px mobile. Sticky `top: 0`, `z-index: 100`. `background: var(--paper); border-bottom: 1px solid var(--rule-soft-light);` in light, equivalent dark variable in dark.

Sample (abridged) new CSS:

```css
.app-header {
  position: sticky; top: 0; z-index: 100;
  background: var(--paper);
  border-bottom: 1px solid var(--rule-soft-light);
}
[data-theme="dark"] .app-header {
  border-bottom-color: var(--rule-soft-dark);
}
.app-header-inner {
  max-width: 1400px; margin: 0 auto;
  height: 64px; padding: 0 24px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 24px;
}
.app-header-left { display: flex; align-items: center; gap: 20px; min-width: 0; }
.app-header-right { display: flex; align-items: center; gap: 6px; }
.brand { display: flex; align-items: baseline; gap: 10px; flex-shrink: 0; text-decoration: none; }
.brand-mark {
  width: 28px; height: 28px; border-radius: 999px;
  background: var(--ink); color: var(--paper);
  font-family: var(--font-display); font-weight: 600; font-size: 15px;
  display: inline-flex; align-items: center; justify-content: center;
  transform: translateY(3px);
}
.brand-name { font-family: var(--font-display); font-weight: 500; font-size: 22px; letter-spacing: -0.02em; color: var(--ink); }
.brand-tag {
  font-family: var(--font-body); font-size: 10px; font-weight: 500;
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-3);
  padding: 3px 7px; border: 1px solid var(--rule-soft-light); border-radius: 4px;
  transform: translateY(-3px);
}
.iconbtn {
  width: 36px; height: 36px; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--ink-2); background: none; border: none; cursor: pointer;
  transition: background 150ms, color 150ms;
}
.iconbtn:hover { background: var(--paper-2); color: var(--ink); }
.iconbtn.text-icon { font-family: var(--font-display); font-weight: 500; font-size: 16px; }
.divider { width: 1px; height: 20px; background: var(--rule-soft-light); margin: 0 4px; }
.toolbar {
  display: flex; align-items: center; gap: 2px; padding: 3px;
  background: var(--paper-2); border-radius: 10px;
  border: 1px solid var(--rule-soft-light);
}
.toolbar-group { display: flex; gap: 2px; }
.toolbar-group + .toolbar-group {
  margin-left: 4px; padding-left: 6px;
  border-left: 1px solid var(--rule-soft-light);
}
.lang-pill {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 13px; color: var(--ink-2);
  padding: 7px 12px; border: 1px solid var(--rule-soft-light); border-radius: 999px;
  background: transparent; cursor: pointer;
  transition: border-color 200ms, color 200ms;
}
.lang-pill:hover { border-color: var(--ink); color: var(--ink); }
.user-chip {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 5px 12px 5px 5px;
  border: 1px solid var(--rule-soft-light); border-radius: 999px;
  background: transparent; cursor: pointer;
  transition: border-color 200ms;
}
.user-chip:hover { border-color: var(--ink); }
.user-chip-avatar {
  width: 26px; height: 26px; border-radius: 50%;
  background: var(--ink); color: var(--paper);
  font-family: var(--font-display); font-weight: 500; font-size: 12px;
  display: inline-flex; align-items: center; justify-content: center;
}
.user-chip.anonymous .user-chip-avatar {
  background: var(--paper-2); color: var(--ink-3);
  border: 1px dashed var(--rule-soft-light);
}
.editor-breadcrumb {
  display: flex; align-items: center; gap: 10px;
  font-size: 13px; color: var(--ink-3); min-width: 0;
}
.editor-breadcrumb[hidden] { display: none; }
.editor-breadcrumb-title {
  color: var(--ink); font-family: var(--font-display); font-style: italic;
  font-size: 15px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.app-header-right { position: relative; }  /* anchor for the popover */

/* Collapsed state: either editor toolbar visible OR viewport < 900px */
@media (max-width: 899px) {
  .app-header-utilities { display: none; }
  #utility-overflow-toggle { display: inline-flex; }
}
body.has-editor-toolbar .app-header-utilities { display: none; }
body.has-editor-toolbar #utility-overflow-toggle { display: inline-flex; }

/* Popover reveal when toggle is active */
.app-header.overflow-open .app-header-utilities {
  display: flex; flex-direction: column; gap: 2px;
  position: absolute; right: 24px; top: calc(100% + 6px);
  background: var(--paper); border: 1px solid var(--rule-soft-light);
  border-radius: 10px; padding: 6px;
  box-shadow: 0 10px 30px -10px rgba(26,25,22,0.2);
  z-index: 101;
}
[data-theme="dark"] .app-header.overflow-open .app-header-utilities {
  border-color: var(--rule-soft-dark);
}
@media (max-width: 639px) {
  .app-header-inner { height: 56px; padding: 0 16px; }
  .brand-tag { display: none; }
  .language-name { display: none; }
}
@media (max-width: 479px) {
  .brand-name { display: none; }
  .user-chip-name { display: none; }
}
```

## Translations

Add to all 9 files in `public/js/utils/translations/`:

```js
header_editor: "Editor",           // every language uses the same word "Editor" in the handoff, verify per-locale; Spanish: "Editor"
header_untitled_quiz: "Untitled quiz",  // localize per file (es: "Quiz sin título", etc.)
```

Existing keys are preserved on the same DOM nodes: `app_title`, `create_lobby`, `toggle_dark_mode_tooltip`, `toggle_sound_tooltip`, `toggle_fullscreen_tooltip`, `adjust_font_size_tooltip`, `return_to_main`, `auth_signin_tooltip`, `auth_signin_short`, and all toolbar-btn `*_tooltip` keys.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Deleting mobile-title / mobile-header-controls breaks a JS module that queries them | Grep before removal for `mobile-title`, `mobile-header-controls`, `mobile-language-selector-header`, `theme-toggle-mobile-header`, `sound-toggle-mobile-header`, `mobile-return-to-main`. Update or delete referencing code. |
| CSS regression via `!important` chains in old files | New file has no `!important`. When removing old rules, grep for any `.desktop-title`/`header h1`/`.header-controls` references and clean all of them in one pass. |
| Service worker serves stale CSS | Bump `CACHE_VERSION` in `public/sw.js`. |
| Language dropdown popover inherits old z-index or positioning that breaks under new header | Rebind scoped under `.app-header .language-selector`. Test with dropdown open in light + dark. |
| Editor-breadcrumb quiz-title selector wrong | Implementation plan will identify the exact input ID/class first, confirm with user before wiring the binding. |
| Dark-mode token mapping missing for `--paper`/`--ink` family | Implementation step 1 verifies; if missing, add 8-line mapping under `[data-theme="dark"]` in `variables.css`. |
| Toolbar height/padding interacts with new 64px header and existing main content top padding | Verify main-content `padding-top` or first-section margin; adjust if needed. |

## Acceptance criteria

1. Header renders at 64px height (56px mobile) with flat `var(--paper)` background and a single 1px hairline bottom border — no blur, no shadow.
2. Brand lockup (Q mark + Fraunces "Quizix" + "PRO" pill) replaces `<h1>`. Clicking it returns to main menu.
3. All 4 utility buttons (font-size, fullscreen, theme, sound) use SVGs with stroke 1.8 (font-size uses Fraunces "A" text). Theme and sound SVGs swap based on state.
4. In editor mode (`#horizontal-toolbar` not hidden): breadcrumb "Editor · *quiz title*" appears in the left cluster; utility buttons collapse into a `···` overflow menu; "Create Lobby" primary CTA is visible on the right.
5. Below 900px: utility buttons collapse into overflow menu regardless of editor mode.
6. Below 640px: brand-tag and language-name hide; header shrinks to 56px.
7. Below 480px: brand-name and user-chip-name hide.
8. All existing click handlers (theme toggle, sound toggle, font-size cycle, fullscreen, language selection, start-hosting, return-to-main, user-chip sign-in, all 12 toolbar-btn actions) continue to work without modification.
9. Dark mode (`[data-theme="dark"]`) renders the ink palette with matching contrast on all elements.
10. `npm run build` succeeds; service worker `CACHE_VERSION` is bumped; a hard refresh shows the new header.
11. Mobile (`<=640px`) layout is readable and functional — no overflow, no clipped content.
12. No console errors on load; no regressions in the landing page (`.lp-*` styles untouched).
