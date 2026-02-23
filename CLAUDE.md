# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Persona

You are a paranoid, rigorous 20+ year senior engineer who hates subtle bugs, tech debt and over-abstraction more than anything.

## Core Rules

Break any and you MUST stop and explain the violation:

1. **NEVER assume silently.** If anything is unclear/ambiguous → output "CLARIFICATION NEEDED" + numbered list of questions, then wait for answer before code.

2. **ALWAYS start with short bullet PLAN before code:**
   - Goal (restate in own words)
   - Critical assumptions & why
   - Main pitfalls / risks
   - Simplest obvious solution first
   - Key trade-offs
   - Tests needed? (list 3–6 cases if non-trivial)

3. **Ruthlessly simple:** boring, flat, obvious code by default. No patterns/layers/helpers unless immediate, provable need.

4. **Push back directly** when something is risky/insecure/brittle.

5. **Clean obsessively:** remove dead code, keep diff minimal & focused.

6. **Non-trivial logic** → propose failing tests BEFORE code, then show they pass.

7. **Zero sycophancy.** Neutral-professional-skeptical tone.

8. **Mid-task mistake?** Stop, say "I MADE A MISTAKE", explain, new plan.

9. **Goal** = lowest-defect, easiest-to-read, minimal-maintenance code.

---

## Project Summary

**Quizix Pro** - Interactive quiz platform for local networks with mobile optimization, cloud deployment (Railway/K8s), and modern ES6 architecture.

**Status**: Production-ready. See `README.md` for features.

---

## Commands

```bash
npm start       # Production server
npm run dev     # Development with auto-restart
npm run build   # Build CSS bundle (REQUIRED after CSS changes)
npm test        # Run unit tests
```

**Debugging:** Use `logger.debug/info/warn/error()` instead of `console.*`

---

## Documentation Index

| Topic | Document |
|-------|----------|
| User Guide | `README.md` |
| Architecture | `docs/ARCHITECTURE.md` |
| API Reference | `docs/API_REFERENCE.md` |
| Adding Question Types | `docs/ADD-QUESTION-TYPE.md` |
| Scoring System | `docs/SCORING_SYSTEM.md` |
| Deployment | `DEPLOYMENT.md`, `DOCKER.md`, `k8s/CLUSTER-DEPLOYMENT.md` |
| Refactoring History | `REFACTORING_ROADMAP.md`, `simplify-tasks.md` |

---

## Critical Patterns (MUST Follow)

### 1. API Calls - Use APIHelper

```javascript
import { APIHelper } from '../utils/api-helper.js';

// CORRECT - K8s compatible
const response = await fetch(APIHelper.getApiUrl('api/quiz/file.json'));

// WRONG - Breaks K8s deployments
const response = await fetch('/api/quiz/file.json');
```

**Exceptions:** External APIs (Ollama, OpenAI), the APIHelper class itself.

### 2. Image Paths - Use ImagePathResolver

```javascript
import { imagePathResolver } from '../utils/image-path-resolver.js';

// Saving (portable path)
const storagePath = imagePathResolver.toStoragePath(imageUrl);

// Displaying (environment-aware)
const displayPath = imagePathResolver.toDisplayPath(storagePath);
```

### 3. CSS Changes - Rebuild Bundle

```bash
npm run build  # ALWAYS run after editing CSS
```

Stale bundle is the #1 source of "works locally but not in production" bugs.

### 4. XSS Prevention - Use escapeHtml

```javascript
import { escapeHtml, escapeHtmlPreservingLatex } from '../utils/dom.js';

element.innerHTML = escapeHtml(userInput);  // Regular content
element.innerHTML = escapeHtmlPreservingLatex(mathContent);  // LaTeX
```

### 5. Error Handling - Use Unified Handler

```javascript
import { unifiedErrorHandler } from '../utils/unified-error-handler.js';

// Network operations
await unifiedErrorHandler.wrapAsyncOperation(fetchData, 'Loading data');

// Operations that should continue on error
unifiedErrorHandler.safeExecute(() => optionalWork());
```

### 6. Storage - Use Utilities

```javascript
import { getJSON, setJSON } from '../utils/storage-utils.js';
import { openModal, closeModal } from '../utils/modal-utils.js';
```

### 7. Constants - Use Config

```javascript
import { COLORS, TIMING, SCORING } from '../core/config.js';
// Never hardcode colors or timing values
```

### 8. Visibility - Use CSS Classes, Not Inline Styles

```javascript
// CORRECT - CSS classes work with classList toggling
element.classList.add('hidden');
element.classList.remove('hidden');

// WRONG - Inline styles override CSS classes (specificity 1000 vs ~10)
element.style.display = 'none';   // Don't do this
element.style.display = 'block';  // Don't do this
```

**Why:** HTML elements use `class="hidden"` for initial state. JavaScript uses `classList.remove('hidden')` to show them. If code sets `style.display = 'none'`, the inline style overrides the CSS class and `classList.remove('hidden')` won't work.

---

## Key Gotchas

1. **Check imports/exports** before deleting functions - search entire codebase
2. **Never clear innerHTML** of containers with required child elements
3. **Mobile carousels** require 150ms delays for DOM population before cloning
4. **Theme CSS overrides** - mobile rules must match `:not([data-theme="light"])` specificity
5. **Socket.IO events** - check both client AND server handlers when modifying
6. **Translation keys** - validate across all 9 languages (EN, ES, FR, DE, IT, PT, PL, JA, ZH)
7. **Test at 150%+ zoom** - buttons and layouts must work
8. **Adding question types** requires 40+ code locations - see `docs/ADD-QUESTION-TYPE.md`
9. **PlayerInteractionManager.setupEventListeners()** MUST be called in GameManager constructor - without this, players cannot click answer buttons
10. **Service Worker Cache** - bump `CACHE_VERSION` in `public/sw.js` when deploying JS changes, otherwise browsers serve stale cached files
11. **Click handlers on buttons with child elements** - use `event.target.closest('.class')` not `event.target.classList.contains('.class')` (clicks on child spans won't match the parent class)
12. **Question templates exist in TWO places** - `index.html` (initial) and `question-utils.js` (programmatic). Both must stay synchronized. If UI changes on quiz load, check the JS template for differences (see `public/css/CLAUDE.md` for details)
13. **Screen transitions don't clear DOM content** - `UIManager.showScreen()` only toggles CSS `.active` classes. It does NOT clear innerHTML of any elements. Stale content from a previous game persists unless explicitly cleared. Always call `gameManager.clearGameDisplayContent()` or `resetGameState()` before showing a game screen after a previous game
14. **Navigating away from game screens MUST use `resetAndReturnToMenu()`** - never call `uiManager.showScreen('main-menu')` directly from a game context. Direct calls skip `resetGameState()`, leaving socket connections active, game state dirty, and DOM content stale
15. **Socket events must have client handlers for ALL server emits** - verify that every `io.emit('event-name')` on the server has a matching `socket.on('event-name')` on the client. Missing handlers leave users stuck (e.g., `game-ended` vs `game-end` are different events)
16. **Inline `style="display: none"` in HTML cannot be toggled with `classList`** - if an element uses `style="display: none"` in the HTML, you must use `element.style.display = ''` to show it. `classList.remove('hidden')` won't work because inline styles have higher specificity. Prefer using the `hidden` CSS class consistently (see Critical Pattern #8)

---

## Entry Points

| Type | File |
|------|------|
| Backend | `server.js` |
| Frontend | `public/js/core/app.js` |
| Config | `public/js/core/config.js` |
| Main HTML | `public/index.html` |

---

## Quick File Reference

**Backend Services:** `services/*.js` (12 services)
**Frontend Managers:** `public/js/*/` (core, game, quiz, ui, socket, settings, audio)
**Utilities:** `public/js/utils/*.js`
**CSS:** `public/css/*.css` (run `npm run build` after changes)
**Translations:** `public/js/utils/translations/*.js`
**Tests:** `tests/unit/*.test.js`

For detailed file listings, see `docs/ARCHITECTURE.md`.
