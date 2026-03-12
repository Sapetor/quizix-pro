# Gotchas & Known Pitfalls

Hard-won lessons from debugging Quizix Pro. Consult this when working on the related area.

---

## General

1. **Check imports/exports** before deleting functions — search entire codebase.
2. **Never clear innerHTML** of containers with required child elements.

## Mobile

3. **Mobile carousels** require 150ms delays for DOM population before cloning.
4. **Theme CSS overrides** — mobile rules must match `:not([data-theme="light"])` specificity.
5. **Test at 150%+ zoom** — buttons and layouts must work.

## Socket.IO

6. **Socket.IO events** — check both client AND server handlers when modifying.
7. **Socket events must have client handlers for ALL server emits** — verify that every `io.emit('event-name')` on the server has a matching `socket.on('event-name')` on the client. Missing handlers leave users stuck (e.g., `game-ended` vs `game-end` are different events).

## Translations

8. **Translation keys** — validate across all 9 languages (EN, ES, FR, DE, IT, PT, PL, JA, ZH).

## Question Types

9. **Adding question types** requires 40+ code locations — see `docs/ADD-QUESTION-TYPE.md`.
10. **Question templates exist in TWO places** — `index.html` (initial) and `question-utils.js` (programmatic). Both must stay synchronized. If UI changes on quiz load, check the JS template for differences (see `public/css/CLAUDE.md` for details).

## Game Lifecycle

11. **PlayerInteractionManager.setupEventListeners()** MUST be called in GameManager constructor — without this, players cannot click answer buttons.
12. **Screen transitions don't clear DOM content** — `UIManager.showScreen()` only toggles CSS `.active` classes. It does NOT clear innerHTML of any elements. Stale content from a previous game persists unless explicitly cleared. Always call `gameManager.clearGameDisplayContent()` or `resetGameState()` before showing a game screen after a previous game.
13. **Navigating away from game screens MUST use `resetAndReturnToMenu()`** — never call `uiManager.showScreen('main-menu')` directly from a game context. Direct calls skip `resetGameState()`, leaving socket connections active, game state dirty, and DOM content stale.

## DOM & Events

14. **Click handlers on buttons with child elements** — use `event.target.closest('.class')` not `event.target.classList.contains('.class')` (clicks on child spans won't match the parent class).
15. **Inline `style="display: none"` in HTML cannot be toggled with `classList`** — if an element uses `style="display: none"` in the HTML, you must use `element.style.display = ''` to show it. `classList.remove('hidden')` won't work because inline styles have higher specificity. Prefer using the `hidden` CSS class consistently.

## Deployment

16. **Service Worker Cache** — bump `CACHE_VERSION` in `public/sw.js` when deploying JS changes, otherwise browsers serve stale cached files.

## AI Integration

17. **Gemini thinking models return multiple `parts`** — Gemini 2.5+/3.x responses have `parts[0]` as the thinking/reasoning text (with `thought: true`) and the actual output in a later part. Always iterate parts in reverse to find the last non-thought part. Never hardcode `parts[0]`. Also: Gemini 3 uses `thinkingLevel` (string), Gemini 2.5 uses `thinkingBudget` (int) — they cannot be mixed.
