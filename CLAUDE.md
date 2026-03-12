# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

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

**Quizix Pro** — Interactive quiz platform for local networks with mobile optimization, cloud deployment (Railway/K8s), and modern ES6 architecture. Production-ready.

## Commands

```bash
npm start       # Production server
npm run dev     # Development with auto-restart
npm run build   # Build CSS bundle (REQUIRED after CSS changes)
npm test        # Run unit tests
```

**Debugging:** Use `logger.debug/info/warn/error()` instead of `console.*`

## Entry Points

| Type | File |
|------|------|
| Backend | `server.js` |
| Frontend | `public/js/core/app.js` |
| Config | `public/js/core/config.js` |
| Main HTML | `public/index.html` |

---

## Critical Patterns (MUST Follow)

### 1. API Calls — Use APIHelper

```javascript
import { APIHelper } from '../utils/api-helper.js';
const response = await fetch(APIHelper.getApiUrl('api/quiz/file.json'));
// WRONG: fetch('/api/quiz/file.json') — breaks K8s deployments
```

**Exceptions:** External APIs (Ollama, OpenAI), the APIHelper class itself.

### 2. Image Paths — Use ImagePathResolver

```javascript
import { imagePathResolver } from '../utils/image-path-resolver.js';
const storagePath = imagePathResolver.toStoragePath(imageUrl);   // saving
const displayPath = imagePathResolver.toDisplayPath(storagePath); // displaying
```

### 3. CSS Changes — Rebuild Bundle

```bash
npm run build  # ALWAYS run after editing CSS
```

### 4. XSS Prevention — Use escapeHtml

```javascript
import { escapeHtml, escapeHtmlPreservingLatex } from '../utils/dom.js';
```

### 5. Error Handling — Use Unified Handler

```javascript
import { unifiedErrorHandler } from '../utils/unified-error-handler.js';
await unifiedErrorHandler.wrapAsyncOperation(fetchData, 'Loading data');
```

### 6. Visibility — Use CSS Classes, Not Inline Styles

```javascript
element.classList.add('hidden');    // CORRECT
element.classList.remove('hidden'); // CORRECT
element.style.display = 'none';    // WRONG — overrides CSS classes
```

### 7. Constants & Storage — Use Utilities

```javascript
import { COLORS, TIMING, SCORING } from '../core/config.js';
import { getJSON, setJSON } from '../utils/storage-utils.js';
import { openModal, closeModal } from '../utils/modal-utils.js';
```

---

## Top Gotchas (Quick Reference)

These cause the most bugs. Full list with details: **`docs/GOTCHAS.md`**

- **`resetAndReturnToMenu()`** — always use this to leave game screens, never raw `showScreen()`
- **Screen transitions don't clear DOM** — call `clearGameDisplayContent()` between games
- **PlayerInteractionManager.setupEventListeners()** — must be called in GameManager constructor
- **Socket events** — every server `emit()` needs a matching client `on()` handler
- **Service Worker** — bump `CACHE_VERSION` in `public/sw.js` when deploying JS changes
- **`hidden` + `visible-flex` conflict** — always remove one when adding the other (both use `!important`)

---

## Documentation

Architecture, API reference, question types, scoring, deployment → see `docs/` directory and `README.md`.
