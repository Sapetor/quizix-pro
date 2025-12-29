# Refactoring Roadmap

**Purpose**: Future refactoring opportunities prioritized by impact vs effort.

**Status**: Weeks 1-3 and 5 complete. Refactoring goals achieved. Only Week 6 remains as optional future work.

---

## ~~Week 3: Socket.IO Handler Extraction~~ ✅ **COMPLETED**

**Priority**: Medium | **Effort**: 4-6 hours | **Impact**: Medium | **Status**: ✅ Complete

### Completed Services

**1. GameSessionService** ✅ (635 lines)
- Game lifecycle management (create, start, end)
- Game state tracking and PIN generation
- Question timing and advancement logic (manual & automatic)

**2. PlayerManagementService** ✅ (157 lines)
- Player join/leave handling
- Player state tracking (global registry)
- Host/player disconnection handling

**3. QuestionFlowService** ✅ (156 lines)
- Answer submission and validation
- Statistics calculation
- Early question ending logic

### Actual Results
- server.js: 1,845 lines → 1,229 lines (616 lines removed, 33% reduction)
- Socket.IO logic now testable in isolation ✅
- Cleaner separation of concerns ✅
- All functionality tested and working ✅

---

## ~~Week 4: AI Integration Service~~ ⏭️ **SKIPPED**

**Priority**: Low | **Effort**: 2-3 hours | **Impact**: Very Low | **Status**: ⏭️ Skipped

### Why Skipped
- Only ~108 lines of AI code in server.js (lines 665-773)
- Just 2 simple proxy endpoints (`/api/ollama/models`, `/api/claude/generate`)
- No complex logic - simply forwards requests to external APIs
- Extracting would create a service with almost no business logic
- Not worth the effort for such minimal code

---

## ~~Week 5: Frontend State Management~~ ✅ **COMPLETED**

**Priority**: Low | **Effort**: 6-8 hours | **Impact**: Medium | **Status**: ✅ Complete

### Completed Changes

**1. GameManager State Consolidation** ✅
- Removed duplicate `gameEnded` and `resultShown` properties
- GameStateManager is now single source of truth for game state

**2. Language State Consolidation** ✅
- TranslationManager is now single source of truth
- SettingsManager.setLanguage() delegates to TranslationManager
- Removed duplicate `language` from quizSettings

**3. Sound State Consolidation** ✅
- SoundManager is now single source of truth (uses `quizAudioSettings`)
- SettingsManager.setSoundEnabled() delegates to SoundManager
- Removed duplicate `soundEnabled` from quizSettings

### Actual Results
- Single source of truth for each state domain ✅
- SettingsManager acts as facade, delegates to specialized managers ✅
- Backward compatible - getSetting() still works for callers ✅

---

## Week 6: Question Type Plugin System (Optional)

**Priority**: Very Low | **Effort**: 8-10 hours | **Impact**: Low | **Status**: Not Started

### Current State (as of Dec 2025)
- QuestionTypeRegistry centralizes validation, scoring, and extraction
- 10 files still have question type switch statements
- Adding new question types requires changes in multiple places
- Current 5 question types: multiple-choice, multiple-correct, true-false, numeric, ordering

### Files with Question Type Logic
1. `public/js/game/game-manager.js`
2. `public/js/game/modules/question-renderer.js`
3. `public/js/game/modules/player-interaction-manager.js`
4. `public/js/quiz/quiz-manager.js`
5. `public/js/ui/preview-manager.js`
6. `public/js/utils/question-utils.js`
7. `public/js/utils/results-viewer.js`
8. `public/js/ai/generator.js`
9. `public/js/core/app.js`
10. `public/js/utils/globals.js`

### Proposed (if ever needed)
- True plugin architecture with auto-registration
- Each question type as self-contained module
- Convention-over-configuration approach

### When to Consider
- Only if planning to add 5+ new question types
- Only if building a question type marketplace
- Only if third-party extensibility is needed

### Recommendation
**Skip** - Current system works well. The 5 existing question types cover most quiz needs. Over-engineering for this app's scale.

---

## Summary

### Completed Refactoring
| Week | Task | Lines Saved | Status |
|------|------|-------------|--------|
| 1-2 | Backend Services & QuestionTypeRegistry | ~800 | ✅ Done |
| 3 | Socket.IO Handler Extraction | ~616 | ✅ Done |
| 4 | AI Integration Service | N/A | ⏭️ Skipped |
| 5 | Frontend State Management | ~50 | ✅ Done |

**Total**: ~1,466 lines removed/refactored, cleaner architecture, single sources of truth.

### Remaining (Optional)
- **Week 6**: Question Type Plugin - Only pursue if adding many new question types

---

## Final Recommendation

**Stop here.** The codebase is now well-structured:
- 8 backend services with clear responsibilities
- Single source of truth for game state, language, and sound
- QuestionTypeRegistry centralizes question logic
- server.js reduced by 33%

Further refactoring has diminishing returns. Better to ship features and revisit only if pain points emerge.

---

**Last Updated**: 2025-12-28
**Next Review**: Only when pain points emerge (not proactively)
