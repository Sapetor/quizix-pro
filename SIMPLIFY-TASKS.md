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

- [ ] **SIMP-5**: Unify event listener binding pattern from `results-viewer.js`
  - `bindElement()` helper at line 134 is useful pattern
  - Similar patterns repeated without helper in other files
  - Extract to `utils/dom.js` and reuse

- [ ] **SIMP-6**: Consolidate localStorage access into `utils/storage-utils.js`
  - 9 files directly access localStorage
  - Some use try-catch, some don't
  - Create safe `getItem()`, `setItem()` wrappers with error handling

- [ ] **SIMP-7**: Extract color constants from `ai/generator.js` to `config.js`
  - `OPTION_COLORS`, `DIFFICULTY_COLORS` defined locally (lines 49-62)
  - Similar `COLORS` constant exists in `config.js`
  - Consolidate to single source of truth

- [x] **SIMP-8**: Consolidate `LANGUAGE_NAMES` constants
  - Moved to `ai/prompts.js` as part of SIMP-1
  - Now exported and imported by `generator.js`
  - Could still be further consolidated with `translation-manager.js` if needed

---

## Error Handling (Medium Impact)

- [ ] **SIMP-9**: Simplify error handling in `quiz-manager.js`
  - 27 catch blocks found
  - Many have similar error handling patterns
  - Consolidate with `unifiedErrorHandler.wrapAsyncOperation()` where appropriate

- [ ] **SIMP-10**: Simplify error handling in `generator.js`
  - 18 catch blocks found
  - Standardize error messages and logging
  - Use error handler wrapper consistently

---

## Dead Code & Cleanup (Low Impact)

- [ ] **SIMP-11**: Review unused exports in `globals.js`
  - Re-exports from 4 specialized managers
  - Verify all re-exports are used
  - Remove orphaned exports

- [ ] **SIMP-12**: Review `game-manager.js` inline styles
  - 35 `.style.` manipulations found
  - Some may be redundant with CSS class toggles
  - Replace with classList.add/remove where possible

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
