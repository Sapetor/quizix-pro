# Quizix Pro Code Simplification Tasks

Tasks for the code-simplifier agent. Work through one at a time, commit, and `/clear` context.

---

## Large File Simplifications (High Impact)

- [x] **SIMP-1**: Extract prompt templates from `ai/generator.js` into `ai/prompts.js`
  - File reduced from 3581 to 3292 lines (~289 lines extracted)
  - Created `ai/prompts.js` (441 lines) with all prompt templates
  - Extracted: `buildMainPrompt`, `buildRetryPrompt`, `buildSingleQuestionPrompt`, `buildBloomInstructions`, `buildExcelConversionPrompt`, `buildFormattingInstructions`, `buildOllamaEnhancedPrompt`

- [x] **SIMP-2**: Extract HTML generation from `ai/generator.js` into `ai/generator-templates.js`
  - Created `ai/generator-templates.js` (220 lines) with all HTML template functions
  - Extracted: `buildOptionHtml`, `buildOptionsHtml`, `buildQuestionCardHtml`, `buildQuestionEditHtml`, `buildOrderingEditHtml`, `buildChoiceEditHtml`, `buildNumericEditHtml`, `buildEditActionsHtml`, `buildViewActionsHtml`
  - Also moved `OPTION_COLORS` and `DIFFICULTY_COLORS` constants
  - Reduced generator.js by ~90 lines of inline HTML templates

- [x] **SIMP-3**: Consolidate modal handling patterns into `utils/modal-utils.js`
  - Created `modal-utils.js` (240 lines) with shared modal helper functions
  - Exported: `openModal`, `closeModal`, `isModalOpen`, `bindOverlayClose`, `bindEscapeClose`, `createModalBindings`, `preventContentClose`, `getModal`
  - Refactored `modal-feedback.js` to use modal-utils (removed ~15 lines of inline handlers)
  - Refactored `results-viewer.js` to use modal-utils (added escape key support, removed `bindModalOverlay` helper)
  - Refactored `generator.js` to use modal-utils (simplified event listener setup)

- [x] **SIMP-4**: Extract inline styles to CSS classes in `modal-feedback.js`
  - Removed all 25 `.style.` assignments (0 remaining)
  - Added `.has-score` CSS class for score display visibility toggle
  - Added `.confetti-canvas` CSS class for confetti overlay styling
  - CSS handles animation reset via existing `.feedback-icon` styles
  - CSS handles explanation visibility via existing `.has-explanation` class

---

## Code Duplication (Medium Impact)

- [x] **SIMP-5**: Unify event listener binding pattern from `results-viewer.js`
  - Added `bindElement(elementId, event, handler, options)` to `utils/dom.js`
  - Refactored `results-viewer.js` to import and use `bindElement` (removed local method)
  - Refactored `app.js` to use `bindElement` (removed `safeAddEventListener` helper, ~35 usages)
  - Pattern now available for other files to import from `dom.js`

- [x] **SIMP-6**: Consolidate localStorage access into `utils/storage-utils.js`
  - Created `storage-utils.js` (163 lines) with safe localStorage wrappers
  - Exported: `getItem`, `setItem`, `removeItem`, `getJSON`, `setJSON`, `hasItem`, `clear`, `getKeys`, `removeByPrefix`
  - Refactored 10 files: `main.js`, `sound-manager.js`, `settings-manager.js`, `quiz-manager.js`, `app.js`, `split-layout-manager.js`, `generator.js`, `globals.js`, `onboarding-tutorial.js`, `translation-manager.js`
  - All localStorage operations now have consistent error handling
  - Removed ~85 lines of duplicate try-catch blocks

- [x] **SIMP-7**: Extract color constants from `ai/generator.js` to `config.js`
  - Moved `OPTION_COLORS` and `DIFFICULTY_COLORS` from `generator-templates.js` to `config.js`
  - Added as `COLORS.OPTION_COLORS` and `COLORS.DIFFICULTY_COLORS` arrays
  - Updated `generator-templates.js` to import from `config.js`
  - Removed exports from `generator-templates.js` and imports from `generator.js`
  - Single source of truth for all color constants established

- [x] **SIMP-8**: Consolidate `LANGUAGE_NAMES` constants
  - Created centralized `LANGUAGES` config in `core/config.js` with complete metadata
  - Includes: language codes, English names, native names, flags, and welcome text
  - Updated `prompts.js` to derive `LANGUAGE_NAMES` and `LANGUAGE_NATIVE_NAMES` from centralized config
  - Updated `translation-manager.js` to use `LANGUAGES.SUPPORTED_CODES`
  - Updated `language-dropdown-manager.js` to use `LANGUAGES.getWelcomeText()`
  - Single source of truth for all language-related constants established
  - Tested: Language switching works correctly for French and Japanese

---

## Error Handling (Medium Impact)

- [x] **SIMP-9**: Simplify error handling in `quiz-manager.js`
  - Reduced from 27 try-catch blocks to just 2 (critical operations only)
  - Replaced with `unifiedErrorHandler.wrapAsyncOperation()` for network operations
  - Used `unifiedErrorHandler.safeExecute()` for operations that should continue on error
  - Simplified methods: `showLoadQuizModal()`, `loadQuiz()`, `populateQuizBuilder()`, `handleFileImport()`, `exportQuiz()`, `cleanup()`, `forceCloseModal()`, `updatePreviewSafely()`
  - Fixed: `safeExecute()` now properly handles async operations and catches promise rejections
  - Tested: Quiz save/load/import/export functionality verified working
  - Maintained all fallback behavior and error recovery logic

- [x] **SIMP-10**: Simplify error handling in `generator.js`
  - Reduced from 18 catch blocks to 9 (50% reduction)
  - Replaced 8 non-critical catch blocks with unified error handler wrappers
  - Used `errorHandler.safeExecute()` for: completion chime, JSON parsing, content detection, Excel/image processing
  - Used `errorHandler.wrapAsyncOperation()` for batch generation with retry fallback
  - Kept 9 critical catch blocks for: UI state management, validation, complex retry logic, error re-throwing
  - Standardized error messages and logging through unified error handler

---

## Dead Code & Cleanup (Low Impact)

- [x] **SIMP-11**: Review unused exports in `globals.js`
  - Removed 21 lines of orphaned re-exports from 4 specialized managers
  - Functions are directly assigned to window object in their respective managers (language-dropdown-manager.js, auto-hide-toolbar-manager.js, back-to-top-manager.js, editor-question-count.js)
  - Verified with Playwright MCP: language dropdown, language selection, and scroll-to-top all work correctly
  - Kept initialization imports which are actually used in initializeGlobals()

- [x] **SIMP-12**: Review `game-manager.js` inline styles
  - Reduced from 35 to 5 `.style.` manipulations (86% reduction)
  - Replaced 17 `display` toggles with `.hidden`/`.visible`/`.visible-flex` classes
  - Replaced 6 correct answer style assignments with `.correct-answer-highlight`/`.host-correct-answer` classes
  - Replaced 2 transform animations with `.scale-pulse` class
  - Replaced 1 error background with `.error-bg` class
  - Added 6 new CSS utility classes to `base.css`
  - Built CSS bundle and verified functionality with Playwright MCP
  - Kept 5 remaining `.style.` for legitimate dynamic values:
    - `pointerEvents` cleanup (lines 573-574)
    - `statFill.style.width` for progress bar animations (lines 1168, 1190, 1193)

- [ ] **SIMP-13**: Clean up `sound-manager.js` catch blocks
  - 13 catch blocks found
  - Audio errors often have similar handling
  - Consolidate error handling pattern

---

## Workflow

1. Tell Claude: `Work on task SIMP-1 from SIMPLIFY-TASKS.md`
2. Claude analyzes current code and simplifies
3. Test changes work correctly
4. Mark task complete in this file
5. Commit changes
6. Run `/clear`
7. Repeat with next task

## Guidelines for Code Simplifier

- **Preserve functionality** - changes should be refactoring only
- **Run `npm run build`** after any CSS changes
- **Test on mobile** after UI-related changes
- **Check imports/exports** after extracting modules
- **Watch for circular dependencies** when creating utilities
- **Keep commits atomic** - one simplification per commit
