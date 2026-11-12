# Adding a New Question Type to Quizix Pro

This guide documents the complete process for adding a new question type, based on lessons learned from implementing the "ordering" question type.

## Overview

Adding a question type requires changes across **about 20 files plus the 9 locale files** spanning frontend, backend, and configuration. This guide provides a checklist to ensure nothing is missed.

**PHASE 1 UPDATE (Q1 2026):** The rendering pipeline has been consolidated into `QuestionTypeRegistry` (frontend) and `QuestionTypeService` (backend). Editor data extraction, editor population, host/player rendering and player answer extraction now go through the registry. Several per-type `switch`/`if` branches remain outside it; they are listed in [Per-type branches outside the registry](#per-type-branches-outside-the-registry). Checked against the code on 2026-11-12.

---

## Simplified Workflow (Phase 1 - With QuestionTypeRegistry)

The refactored codebase consolidates rendering logic in `QuestionTypeRegistry`:

```
Old way: question-renderer.js (setupHostMultipleChoiceOptions, setupPlayerMultipleChoiceOptions, etc.)
         + 40+ repeated patterns scattered across codebase

New way: QuestionTypeRegistry.renderHostOptions() / renderPlayerOptions()
         + extractAnswer() for answer extraction
         → Called from question-renderer.js and player-interaction-manager.js
```

**Main locations**

1. **QuestionTypeRegistry** - Add type definition with rendering methods
2. **QuestionTypeService** (backend) - Add validation & scoring
3. **Save schema** (`services/validation-schemas.js`) - Add a Zod schema to the `questionSchema` discriminated union, or saving fails
4. **HTML templates** - Add editor UI and containers (`index.html` and `question-utils.js`)
5. **CSS** - Style the editor and display UIs
6. **Translations** - Add labels for all 9 languages
7. **PreviewManager** - Add the input class to the live-update matcher
8. **PreviewRenderer** - Render preview display
9. **Quiz validation** - Add a case in `QuizManager.validateQuestionType()`
10. **Per-type branches** - See the list further down

---

## Critical Checklist

### 1. Core Question Type Definition

**File: `public/js/utils/question-type-registry.js`** ⭐ MOST IMPORTANT

Add your question type definition with these methods:

```javascript
'your-type': {
    id: 'your-type',
    label: 'Your Type',

    containerIds: {
        player: 'player-your-type',
        host: 'host-your-type',
        preview: 'preview-your-type'
    },

    selectors: {
        // Selectors for quiz editor DOM
        optionsContainer: '.your-type-options',
        options: '.your-type-options .option'
    },

    playerSelectors: {
        optionsContainer: '.player-options'
    },

    extractData: (questionElement) => {
        // Extract from editor and return data object
        return { /* your data */ };
    },

    populateQuestion: (questionElement, data) => {
        // Populate editor from data object
    },

    validate: (data) => {
        // Return { valid: true/false, error?: string }
    },

    scoreAnswer: (playerAnswer, correctAnswer, options = {}) => {
        // Return boolean or 0-1 for partial credit
    },

    renderHostOptions: (data, container, helpers) => {
        // Render for host display
        // helpers = { escapeHtml, escapeHtmlPreservingLatex, formatCodeBlocks, translationManager, COLORS }
    },

    renderPlayerOptions: (data, container, helpers) => {
        // Render for player input
    },

    extractAnswer: (container) => {
        // Extract player's answer from DOM and return it
    }
}
```

**Benefits:**
- Single source of truth for rendering logic
- Automatically used by QuestionRenderer, QuizManager (`extractData`), PreviewManager (`extractData`), the question editor (`populateQuestion`) and PlayerInteractionManager (`extractAnswer`)
- `GameManager.setupPlayerContainers()` reads `containerIds.player` and `playerSelectors.optionsContainer` through `getPlayerContainerConfig()`
- Eliminates 40+ lines of setup code
- Easier to test in isolation

---

### 2. Backend Question Type Definition

**File: `services/question-type-service.js`**

Add validation and scoring (CommonJS format for Node.js):

```javascript
'your-type': {
    validate: (data) => {
        // Same validation as frontend
        if (!data.options || data.options.length < 2) {
            return { valid: false, error: 'At least 2 options required' };
        }
        return { valid: true };
    },

    scoreAnswer: (playerAnswer, correctAnswer, options = {}) => {
        // Return boolean or 0-1 for partial credit
        return playerAnswer === correctAnswer;
    },

    normalizeAnswer: (answer) => answer,

    buildStatistics: (answers, question) => {
        return { type: 'your-type', total: answers.length };
    }
}
```

At runtime only `scoreAnswer` is called, from `ScoringService.calculateScore()` (`services/scoring-service.js`). The existing types also define `normalizeAnswer` and `buildStatistics`; keep them for consistency. Live answer statistics are built in `Game` (`services/game.js`), not here.

**File: `services/validation-schemas.js`**

- [ ] Add a `yourTypeQuestionSchema` with `type: z.literal('your-type')` and add it to the `questionSchema` discriminated union. `POST /api/save-quiz` and `host-join` validate against this union.

---

### 3. Question Type Definition & Utilities

**File: `public/js/utils/question-utils.js`**

- [ ] Add option to the type dropdown in `QuestionUtils.generateQuestionHTML()` (~line 40)
- [ ] Add answer options section in `generateQuestionHTML()` (~line 300). Give it the class `<type>-options` (for example `ordering-options`): `updateQuestionType()` in `public/js/utils/globals.js` shows the section by that class name

Data extraction (`QuizManager.extractQuestionData()`) and loading saved questions (`question-editing.js`) call the registry's `extractData` and `populateQuestion`, so they need no per-type code. `collectQuestions()` and `validateQuestions()` are in `quiz-manager.js` (see section 7).

**Example:**
```javascript
// In dropdown
<option value="ordering" data-translate="ordering">Ordering</option>
```

---

### 2. Default Question Template (HTML)

**File: `public/index.html`**

- [ ] Add option to default question dropdown (~line 1442)
- [ ] Add answer options section to default question (ordering is at ~line 1848)
- [ ] Add option to the preview panel type selector `#preview-question-type` (~line 1943)

⚠️ **Critical:** The default question is hardcoded in HTML. If you miss this, new users won't see the question type on first load.

---

### 3. Game Containers (Player UI)

**File: `public/index.html`**

- [ ] Add player container div (~line 2820)

**Example:**
```html
<div id="player-ordering" class="player-answer-type hidden">
    <div class="ordering-container">
        <!-- Options dynamically rendered here -->
    </div>
</div>
```

**File: `public/js/game/game-manager.js`**

- [ ] No container mapping needed: `setupPlayerContainers()` (~line 235) gets the container from the registry
- [ ] Add submit method that delegates to interactionManager (~line 328), if the type has a submit button
- [ ] Add a host correct-answer reveal branch (ordering: `revealHostOrdering()`, ~line 745)

**Example:**
```javascript
// Submit method
submitOrderingAnswer() {
    this.interactionManager.submitOrderingAnswer();
}
```

---

### 4. Question Rendering (Host & Player)

**✓ AUTOMATICALLY HANDLED BY QuestionTypeRegistry**

When you define `renderHostOptions()`, `renderPlayerOptions()`, and `extractAnswer()` in the registry, QuestionRenderer automatically calls them:

```javascript
// In question-renderer.js - already refactored to use registry
const helpers = {
    escapeHtml,
    escapeHtmlPreservingLatex,
    formatCodeBlocks,
    translationManager,
    COLORS
};
QuestionTypeRegistry.renderHostOptions(data.type, data, hostOptionsContainer, helpers);
QuestionTypeRegistry.renderPlayerOptions(data.type, data, optionsContainer, helpers);
```

**Rendering needs no code in question-renderer.js.** A submit button created by `renderPlayerOptions()` still has to be wired after rendering. For ordering this happens in `QuestionRenderer.initializePlayerOrderingDragDrop()`, which `updatePlayerOptions()` calls when `data.type === 'ordering'`:

**Example:**
```javascript
// question-renderer.js, inside initializePlayerOrderingDragDrop()
const submitBtn = document.getElementById('submit-ordering');
if (submitBtn) {
    submitBtn.addEventListener('click', () => {
        this.gameManager.submitOrderingAnswer();
    });
}
```

---

### 5. Player Interaction

**Partly handled by QuestionTypeRegistry.extractAnswer()**

`submitAnswerByType()` calls the registry's `extractAnswer()`, but it does so inside a per-type `switch`, each case with its own container id and empty-answer check:

```javascript
// In player-interaction-manager.js
case 'ordering': {
    const container = document.getElementById('player-ordering');
    const answer = QuestionTypeRegistry.extractAnswer('ordering', container);
    if (!answer || answer.length === 0) { /* show error */ return; }
    this.submitAnswer(answer);
    break;
}
```

- [ ] Add a case to `submitAnswerByType()` (~line 124) and a `submitXxxAnswer()` method, unless the type submits on click through the `'direct'` case
- [ ] Multiple-correct and numeric submit buttons are static elements bound in `setupEventListeners()` (~line 369); ordering's button is created dynamically and wired in question-renderer.js (Section 4)

---

### 6. Server-Side Validation & Scoring

`server.js` no longer contains answer handling. Scoring goes through `ScoringService.calculateScore()`, which calls `QuestionTypeService.scoreAnswer()`.

**File: `services/scoring-service.js`**

- [ ] Add a case in `getCorrectAnswerKey()` if the type stores its answer in a field other than `correctAnswer`
- [ ] Partial credit is applied only when `question.type === 'ordering'`; extend that condition if the new type returns a 0-1 score

**File: `services/game.js`**

- [ ] Add a branch for the type in the answer statistics (`answerCounts`, ~line 703)

**File: `services/question-flow-service.js`**

- [ ] Add a case for the correct-answer display string (~line 65)

---

### 7. Quiz Manager Validation

**File: `public/js/quiz/quiz-manager.js`**

- [ ] Data extraction: none needed, `extractQuestionData()` (~line 294) calls `QuestionTypeRegistry.extractData()`
- [ ] Add validation rules in `validateQuestionType()` (~line 340)

---

### 8. Live Preview

**File: `public/js/ui/preview-manager.js`**

- [ ] Data extraction: none needed, `extractQuestionDataForPreview()` (~line 491) calls `QuestionTypeRegistry.extractData()`
- [ ] Add `.xxx-option` to input event listener (~line 302)

⚠️ **Critical:** If you miss the input listener, real-time preview won't update as users type.

**File: `public/js/ui/modules/preview-renderer.js`**

- [ ] Add case in `renderSplitAnswerType()` (~line 380-395)
- [ ] Add entry in the `rendererMap` of `renderMobileAnswerType()` (~line 816)
- [ ] Implement `renderSplitXxxPreview()` method (ordering: ~line 552)
- [ ] Implement `renderMobileXxxPreview()` method (ordering: ~line 1024)

**File: `public/index.html`**

- [ ] Add preview container for desktop split-screen (~line 2050)

**Example:**
```html
<div id="preview-ordering-split" class="preview-answer-type hidden">
    <!-- Dynamically rendered -->
</div>
```

---

### 9. CSS Styling

**File: `public/css/components.css`**

- [ ] Add styles for editor UI (~343 lines for ordering)
- [ ] Add styles for host display
- [ ] Add styles for player display
- [ ] Add hover/drag states
- [ ] Add feedback states (correct/incorrect/partial)
- [ ] Add mobile responsive styles
- [ ] Add light theme overrides

⚠️ **Critical:** After editing `components.css`, you MUST rebuild the CSS bundle:

```bash
npm run build
```

This creates/updates `public/css/main.bundle.css` which is what gets loaded in production.

**Verify bundle contains your styles:**
```bash
grep -c "your-new-class" public/css/main.bundle.css
```

---

### 10. Translations (All 9 Languages)

**Files: `public/js/utils/translations/*.js`**

- [ ] English (en.js)
- [ ] Spanish (es.js)
- [ ] French (fr.js)
- [ ] German (de.js)
- [ ] Italian (it.js)
- [ ] Portuguese (pt.js)
- [ ] Polish (pl.js)
- [ ] Japanese (ja.js)
- [ ] Chinese (zh.js)

**Required keys:**
- Question type name (e.g., `ordering: "Ordenamiento"`)
- Instructions for editor
- Instructions for players
- Validation messages
- Error messages

---

### Per-type branches outside the registry

These files branch on the question type and need a case for the new type (found by searching for `'ordering'`):

| File | Branch |
|------|--------|
| `services/validation-schemas.js` | Zod schema in the `questionSchema` union |
| `services/scoring-service.js` | `getCorrectAnswerKey()`, ordering partial-credit branch |
| `services/game.js` | Answer statistics `answerCounts` |
| `services/question-flow-service.js` | Correct-answer display string |
| `services/results-service.js` | Answer separator in exports (ordering only) |
| `public/js/quiz/quiz-manager.js` | `validateQuestionType()` |
| `public/js/game/modules/player-interaction-manager.js` | `submitAnswerByType()` |
| `public/js/game/game-manager.js` | Submit method, host correct-answer reveal |
| `public/js/game/modules/statistics-manager.js` | Host answer statistics |
| `public/js/practice/local-game-session.js` | Correct-answer key for practice scoring |
| `public/js/ui/question-sidebar.js` | Type abbreviation |
| `public/js/utils/results-viewer/answer-format.js` | Answer formatting in the results viewer |
| `public/js/ai/` (`prompts.js`, `generator.js`, `generator-templates.js`, `ai-question-preview.js`, `ai-question-validator.js`) | Prompts, preview and validation, if AI generation should produce the type |

---

## Common Pitfalls & Issues Found

### 1. CSS Bundle is Stale
**Symptom:** Styles work locally but not after deployment.

**Cause:** `main.bundle.css` wasn't rebuilt after editing `components.css`.

**Fix:** Always run `npm run build` after CSS changes.

**Check:** Compare timestamps:
```bash
ls -la public/css/components.css public/css/main.bundle.css
```

---

### 2. Missing Preview Data Extraction
**Symptom:** Preview shows "No options available".

**Cause:** The registry's `extractData()` for the new type returns no `options`, or the editor selectors in its `selectors` block do not match the template.

**Fix:** Check the registry entry; `extractQuestionDataForPreview()` in `preview-manager.js` (~line 491) only calls the registry.

---

### 3. Submit Button Doesn't Work
**Symptom:** Button click does nothing, no console errors.

**Cause:** Event listener never attached.

**Fix:** For a button created by `renderPlayerOptions()`, wire it in `question-renderer.js` after rendering, as ordering does in `initializePlayerOrderingDragDrop()`. Static buttons in `index.html` are bound in `PlayerInteractionManager.setupEventListeners()`.

---

### 4. Preview Doesn't Update in Real-Time
**Symptom:** Must click away to see changes.

**Cause:** Input class not in event listener matcher.

**Fix:** Add `.xxx-option` to line ~302 of `preview-manager.js`:
```javascript
if (e.target.matches('.question-text, .option, .numeric-answer, .numeric-tolerance, .ordering-option')) {
```

---

### 5. Missing from Default Question
**Symptom:** New users don't see the question type initially.

**Cause:** Default question hardcoded in `index.html` (the `.question-item` starting at ~line 1421).

**Fix:** Add option to dropdown AND answer options section.

---

### 6. Unknown Question Type Error
**Symptom:** Console error "Unknown question type: xxx".

**Cause:** No registry entry for the type. `setupPlayerContainers()` in `game-manager.js` gets the container from `QuestionTypeRegistry.getPlayerContainerConfig()` and logs this warning when it returns nothing.

**Fix:** Add the type to `QUESTION_TYPES` in `question-type-registry.js`.

---

### 7. Player Options Container Not Found
**Symptom:** Console error about missing container.

**Cause:** Missing DOM element in `index.html`.

**Fix:** Add `<div id="player-xxx">` container around line 2820.

---

## Architecture Issues Identified

### 1. Scattered Question Type Definitions
**Problem:** Question types are defined in 10+ places with no single source of truth.

**Impact:** Easy to miss locations when adding new types.

**Improvement:** Create a central `questionTypes` config object:
```javascript
const QUESTION_TYPES = {
    'ordering': {
        name: 'ordering',
        translationKey: 'ordering',
        hasOptions: true,
        hasCorrectOrder: true,
        allowsPartialCredit: true,
        editorTemplate: '...',
        validationRules: {...}
    }
};
```

Then generate dropdowns, validation, etc. from this config.

---

### 2. Inconsistent Submit Button Patterns
**Problem:** Some questions use `bindPlayerEventListeners()`, others wire up directly in setup methods.

**Impact:** Confusion about which pattern to follow.

**Observed (current code):**
- Multiple-correct and numeric: static buttons bound in `PlayerInteractionManager.setupEventListeners()`
- Ordering: dynamic button wired in `QuestionRenderer.initializePlayerOrderingDragDrop()`

**Recommendation:** Standardize on one pattern or document why both exist.

---

### 3. Hardcoded Default Question in HTML
**Problem:** Default question is HTML, not generated by JavaScript.

**Impact:** Must update HTML AND JS when adding question types.

**Improvement:** Generate default question via `createQuestionElement()` on page load.

---

### 4. CSS Build Step Not Enforced
**Problem:** Easy to forget `npm run build` after CSS changes.

**Impact:** Stale CSS bundle causes "works on my machine" bugs.

**Improvement:**
- Add pre-commit hook to rebuild CSS if components.css changed
- Or use CSS-in-JS / Tailwind to eliminate build step
- Or add CI check that fails if bundle is stale

---

### 5. Preview Update Listener is Brittle
**Problem:** Must remember to add `.xxx-option` to input matcher string.

**Impact:** Real-time preview silently fails for new types.

**Improvement:** Use class prefix pattern:
```javascript
if (e.target.matches('[class*="-option"], .question-text, .numeric-answer')) {
```
Or use event delegation on a parent container.

---

### 6. Multiple Preview Renderers
**Problem:** Separate methods for desktop and mobile preview (duplication).

**Impact:** Must update both when adding features like colors.

**Improvement:** Single render method with responsive CSS, or shared utility function.

---

## Testing Checklist

After implementing a new question type, test:

- [ ] Default question shows new type in dropdown
- [ ] Can add new question with type
- [ ] Editor UI appears when type selected
- [ ] Can fill in question data
- [ ] Live preview shows on desktop (split-screen)
- [ ] Live preview shows on mobile
- [ ] Live preview updates in real-time as you type
- [ ] Can save quiz with new question type
- [ ] Can load saved quiz
- [ ] Host screen shows question correctly
- [ ] Host screen has proper CSS styling
- [ ] Player screen shows question correctly
- [ ] Player screen has proper CSS styling
- [ ] Player can interact (submit answer)
- [ ] Submit button works
- [ ] Answer is validated correctly on server
- [ ] Correct answers show green feedback
- [ ] Incorrect answers show red feedback
- [ ] Partial credit works (if applicable)
- [ ] Answer statistics update on host screen
- [ ] Results export includes new question type
- [ ] All 9 translations work
- [ ] Works on mobile devices
- [ ] Works at 150% zoom

---

## File Summary (For Quick Reference)

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `public/js/utils/question-type-registry.js` | ✅ Rendering (registry-based) | 1 location |
| `services/question-type-service.js` | ✅ Backend validation & scoring | 1 location |
| `services/validation-schemas.js` | Save/host-join schema | 1 location |
| `public/js/utils/question-utils.js` | Question template | 2 locations |
| `public/index.html` | DOM structure | 5 locations |
| `public/js/game/game-manager.js` | Game orchestration | 2 locations |
| `public/js/game/modules/player-interaction-manager.js` | Answer submission | 1-2 locations |
| `public/js/game/modules/question-renderer.js` | Submit button wiring | 1 location (if dynamic button) |
| `public/js/quiz/quiz-manager.js` | Save-time validation | 1 location |
| `public/js/ui/preview-manager.js` | Preview updates | 1 location |
| `public/js/ui/modules/preview-renderer.js` | Preview rendering | 4 methods |
| `public/css/components.css` | Styling | Full section |
| `public/js/utils/translations/*.js` | i18n | 9 files |
| Per-type branches table above | Scoring, statistics, results, practice | 1 location each |

**Registry-based rendering removes the need for:** rendering code in `question-renderer.js` (uses `QuestionTypeRegistry.renderHostOptions/renderPlayerOptions()`), per-type extraction in `quiz-manager.js` and `preview-manager.js` (use `extractData()`), container mapping in `game-manager.js`, and answer handling in `server.js` (scoring uses `QuestionTypeService`).

---

## Deployment

After implementing and testing:

1. **Build CSS bundle:**
   ```bash
   npm run build
   ```

2. **Commit all changes:**
   ```bash
   git add -A
   git commit -m "feat: Add [type] question type"
   ```

3. **Push to repository:**
   ```bash
   git push
   ```

4. **Deploy to Kubernetes:**
   ```bash
   docker build -t sapetor/quizix-pro:latest .
   docker push sapetor/quizix-pro:latest
   kubectl rollout restart deployment/quizix-pro -n quizix
   kubectl rollout status deployment/quizix-pro -n quizix
   ```

5. **Test in production** (clear browser cache: Ctrl+Shift+F5)

---

## Recommended Improvements

1. ✅ **Create a question type registry** - DONE (QuestionTypeRegistry handles all rendering)
2. **Standardize submit button pattern** - Not done: static buttons are bound in `PlayerInteractionManager`, ordering's dynamic button in `QuestionRenderer`
3. **Generate default question via JS** - Remove HTML hardcoding
4. **Automate CSS bundle rebuild** - Pre-commit hook or eliminate build step
5. **Use more defensive preview updates** - Broader class matching or delegation
6. ✅ **Extract color scheme to constants** - DONE (COLORS.ORDERING_ITEM_COLORS in config.js)
7. **Add integration tests** - Playwright tests for new question types
8. **Document submit button pattern** - In-code comments explaining the choice

---

## Notes

- This document reflects lessons learned from adding "ordering" question type
- Time to implement: ~2-3 hours (down from 8+ hours before refactoring)
- Main time sinks (original): Finding all required locations, CSS bundle issue, submit button wiring
- Refactoring completed Q1 2026:
  - QuestionTypeRegistry now handles rendering for all question types (frontend)
  - QuestionTypeService provides validation and scoring (backend)
  - File restructuring: generator.js split into 4 files, game-session-service.js split into 3 files
  - Result: rendering and extraction are centralized; per-type branches remain in about a dozen files (see the table above)
