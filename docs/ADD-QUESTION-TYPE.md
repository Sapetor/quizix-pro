# Adding a New Question Type to Quizix Pro

This guide documents the complete process for adding a new question type, based on lessons learned from implementing the "ordering" question type.

## Overview

Adding a question type requires changes across **~8 files** spanning frontend, backend, and configuration. This guide provides a checklist to ensure nothing is missed.

**PHASE 1 UPDATE (Q1 2026):** The rendering pipeline has been consolidated into `QuestionTypeRegistry` (frontend) and `QuestionTypeService` (backend). This reduces the number of locations where rendering/validation logic needs to be added from 40+ to ~8, dramatically simplifying the process.

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

**New Process: 8 Essential Locations (down from 40+)**

1. **QuestionTypeRegistry** - Add type definition with rendering methods
2. **QuestionTypeService** (backend) - Add validation & scoring
3. **HTML templates** - Add editor UI and container
4. **CSS** - Style the editor and display UIs
5. **Translations** - Add labels for all 9 languages
6. **PreviewManager** - Extract data for preview
7. **PreviewRenderer** - Render preview display
8. **Quiz validation** - Validate the data

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
        // helpers = { escapeHtml, formatCodeBlocks, translationManager, COLORS }
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
- Automatically used by QuestionRenderer and PlayerInteractionManager
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
    }
}
```

---

### 3. Question Type Definition & Utilities

**File: `public/js/utils/question-utils.js`**

- [ ] Add option to `createQuestionElement()` dropdown (~line 36)
- [ ] Add answer options section in `createQuestionElement()` (~line 103-128)
- [ ] Add case in `collectQuestions()` data extraction (~line 176-183)
- [ ] Add validation in `validateQuestions()` (~line 219)
- [ ] Add case in `populateQuestionData()` for loading saved questions (~line 445-452)

**Example:**
```javascript
// In dropdown
<option value="ordering" data-translate="ordering">Ordering</option>

// In collectQuestions
case 'ordering':
    const orderingOptions = Array.from(item.querySelectorAll('.ordering-options .ordering-option'))
        .map(opt => opt.value.trim());
    if (orderingOptions.every(opt => opt)) {
        question.options = orderingOptions;
        question.correctOrder = orderingOptions.map((_, index) => index);
        questions.push(question);
    }
    break;
```

---

### 2. Default Question Template (HTML)

**File: `public/index.html`**

- [ ] Add option to default question dropdown (~line 776)
- [ ] Add answer options section to default question (~line 844-868)

⚠️ **Critical:** The default question is hardcoded in HTML. If you miss this, new users won't see the question type on first load.

---

### 3. Game Containers (Player UI)

**File: `public/index.html`**

- [ ] Add player container div (~line 1298)

**Example:**
```html
<div id="player-ordering" class="player-answer-type" style="display: none;">
    <div class="ordering-container">
        <!-- Options dynamically rendered here -->
    </div>
</div>
```

**File: `public/js/game/game-manager.js`**

- [ ] Add entry to `containerMap` in `setupPlayerContainers()` (~line 193)
- [ ] Add submit method that delegates to interactionManager (~line 340)

**Example:**
```javascript
// In containerMap
'ordering': {
    containerId: 'player-ordering',
    optionsSelector: '.ordering-container'
}

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
    formatCodeBlocks,
    translationManager,
    COLORS
};
QuestionTypeRegistry.renderHostOptions(data.type, data, hostOptionsContainer, helpers);
QuestionTypeRegistry.renderPlayerOptions(data.type, data, optionsContainer, helpers);
```

**No additional code needed in question-renderer.js!**

**Example:**
```javascript
setupPlayerOrderingOptions(data, optionsContainer) {
    // Generate HTML with options
    let html = `...`;

    optionsContainer.innerHTML = html;

    // Wire up submit button
    const submitButton = document.getElementById('submit-ordering');
    if (submitButton) {
        submitButton.disabled = false;
        this.gameManager.addEventListenerTracked(submitButton, 'click', () => {
            this.gameManager.submitOrderingAnswer();
        });
    }
}
```

---

### 5. Player Interaction

**✓ AUTOMATICALLY HANDLED BY QuestionTypeRegistry.extractAnswer()**

When you define `extractAnswer()` in the registry, PlayerInteractionManager automatically calls it:

```javascript
// In player-interaction-manager.js - already refactored to use registry
submitAnswerByType(type, directAnswer = null) {
    const container = document.getElementById(`player-${type}`);
    const answer = QuestionTypeRegistry.extractAnswer(type, container);
    // ... validation and submission
}
```

**No additional code needed in player-interaction-manager.js!**

The submit button wiring still happens in question-renderer.js after rendering the options - see Section 4.

---

### 6. Server-Side Validation & Scoring

**File: `server.js`**

- [ ] Add case in answer validation (~line 1584-1598)
- [ ] Handle partial credit if applicable (~line 1613-1623)
- [ ] Update answer statistics display (~line 2113-2116)

**Example:**
```javascript
case 'ordering':
    if (Array.isArray(answer) && Array.isArray(question.correctOrder)) {
        let correctPositions = 0;
        for (let i = 0; i < answer.length; i++) {
            if (answer[i] === question.correctOrder[i]) {
                correctPositions++;
            }
        }
        const percentCorrect = correctPositions / question.correctOrder.length;
        isCorrect = percentCorrect; // Partial credit as decimal
    }
    break;
```

---

### 7. Quiz Manager Validation

**File: `public/js/quiz/quiz-manager.js`**

- [ ] Add data extraction in `extractQuestionData()` (~line 118-129)
- [ ] Add validation rules (~line 192-198)

---

### 8. Live Preview

**File: `public/js/ui/preview-manager.js`**

- [ ] Add case in `extractQuestionDataForPreview()` (~line 582-588)
- [ ] Add `.xxx-option` to input event listener (~line 297)

⚠️ **Critical:** If you miss the input listener, real-time preview won't update as users type.

**File: `public/js/ui/modules/preview-renderer.js`**

- [ ] Add case in `renderSplitAnswerType()` (~line 392-395)
- [ ] Add case in `renderMobileAnswerType()` (~line 832-834)
- [ ] Implement `renderSplitXxxPreview()` method (~line 548-592)
- [ ] Implement `renderMobileXxxPreview()` method (~line 1035-1083)

**File: `public/index.html`**

- [ ] Add preview container for desktop split-screen (~line 909)

**Example:**
```html
<div id="preview-ordering-split" class="preview-answer-type" style="display: none;">
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

**Cause:** `extractQuestionDataForPreview()` missing case for new type.

**Fix:** Add case in `preview-manager.js` line ~582.

---

### 3. Submit Button Doesn't Work
**Symptom:** Button click does nothing, no console errors.

**Cause:** Event listener never attached.

**Fix:** Wire up button in `setupPlayerXxxOptions()` using `gameManager.addEventListenerTracked()`.

**Pattern:** Follow numeric question, NOT bindPlayerEventListeners() approach.

---

### 4. Preview Doesn't Update in Real-Time
**Symptom:** Must click away to see changes.

**Cause:** Input class not in event listener matcher.

**Fix:** Add `.xxx-option` to line 297 of `preview-manager.js`:
```javascript
if (e.target.matches('.question-text, .option, .numeric-answer, .numeric-tolerance, .ordering-option')) {
```

---

### 5. Missing from Default Question
**Symptom:** New users don't see the question type initially.

**Cause:** Default question hardcoded in `index.html` lines 767-870.

**Fix:** Add option to dropdown AND answer options section.

---

### 6. Unknown Question Type Error
**Symptom:** Console error "Unknown question type: xxx".

**Cause:** Missing entry in `containerMap` in `game-manager.js`.

**Fix:** Add mapping at line ~193.

---

### 7. Player Options Container Not Found
**Symptom:** Console error about missing container.

**Cause:** Missing DOM element in `index.html`.

**Fix:** Add `<div id="player-xxx">` container around line 1298.

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

**Observed:**
- Multiple-correct: Uses `bindPlayerEventListeners()`
- Numeric: Wires directly in `setupPlayerNumericOptions()`
- Ordering: Had to follow numeric pattern

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
| `public/js/utils/question-utils.js` | Question creation/editing | 5 locations |
| `public/index.html` | DOM structure | 3 locations |
| `public/js/game/game-manager.js` | Game orchestration | 2 locations |
| `public/js/ui/preview-manager.js` | Preview updates | 2 locations |
| `public/js/ui/modules/preview-renderer.js` | Preview rendering | 4 methods |
| `public/css/components.css` | Styling | Full section |
| `public/js/utils/translations/*.js` | i18n | 9 files |

**Total: ~8 essential locations (down from 40+)**

**Registry-based rendering automatically eliminates the need for:** changes in `question-renderer.js` (uses `QuestionTypeRegistry.renderHostOptions/renderPlayerOptions()`), `player-interaction-manager.js` (uses `QuestionTypeRegistry.extractAnswer()`), and `server.js` answer handling (uses `QuestionTypeService`).

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
   docker build -t sapetor/quizmaster-pro:latest .
   docker push sapetor/quizmaster-pro:latest
   kubectl rollout restart deployment/quizmaster-pro -n quizmaster
   kubectl rollout status deployment/quizmaster-pro -n quizmaster
   ```

5. **Test in production** (clear browser cache: Ctrl+Shift+F5)

---

## Recommended Improvements

1. ✅ **Create a question type registry** - DONE (QuestionTypeRegistry handles all rendering)
2. ✅ **Standardize submit button pattern** - DONE (Registry-based, consistent across types)
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
  - Result: Eliminated 40+ scattered locations, reduced to ~8 essential locations
