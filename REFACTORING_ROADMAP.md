# Refactoring Roadmap

**Purpose**: Future refactoring opportunities prioritized by impact vs effort.

**Status**: Weeks 1-2 complete. Below are optional future improvements.

---

## Week 3: Socket.IO Handler Extraction (Optional)

**Priority**: Medium | **Effort**: 4-6 hours | **Impact**: Medium

### Current State
- server.js contains ~100+ Socket.IO event handlers
- ~400-500 lines of game session management mixed in
- Handler logic spans create-game, join-game, start-game, submit-answer, next-question, game-ended

### Proposed Services

**1. GameSessionService**
- Game lifecycle management (create, start, end)
- Game state tracking
- PIN generation and validation

**2. PlayerManagementService**
- Player join/leave handling
- Player state tracking
- Disconnection/reconnection logic

**3. QuestionFlowService**
- Question delivery to players
- Answer submission handling
- Statistics calculation
- Automatic advancement logic

### Benefits
- server.js: ~1,845 lines → ~1,000-1,200 lines (~35% additional reduction)
- Socket.IO logic testable in isolation
- Easier to add multiplayer features
- Better separation of real-time vs HTTP concerns

### Risks
- Socket.IO events are tightly coupled to game state
- Requires careful testing with multiple concurrent games
- May need to refactor game state management

---

## Week 4: AI Integration Service (Optional)

**Priority**: Low | **Effort**: 2-3 hours | **Impact**: Low

### Current State
- AI endpoints in server.js (/api/claude/generate)
- Mixed with other API routes

### Proposed
- Extract to `AIGenerationService`
- Support multiple providers (Claude, Ollama, HuggingFace)
- Question validation and formatting

### Benefits
- Cleaner separation
- Easier to add new AI providers
- Better error handling for AI failures

---

## Week 5: Frontend State Management (Optional)

**Priority**: Low | **Effort**: 6-8 hours | **Impact**: Medium

### Current State
- State scattered across multiple managers
- GameStateManager, UIStateManager, SettingsManager all coexist
- Some state duplication between managers

### Proposed
- Evaluate if consolidation is needed
- Consider event-driven state updates
- Centralized state store (if complexity warrants)

### Benefits
- Single source of truth for application state
- Easier debugging
- Better state synchronization

### Risks
- Large refactor with high risk of bugs
- Current architecture is working well
- May be over-engineering

---

## Week 6: Question Type Plugin System (Optional)

**Priority**: Very Low | **Effort**: 8-10 hours | **Impact**: Low

### Current State
- QuestionTypeRegistry works well
- Adding new question types still requires changes in 13+ files

### Proposed
- True plugin architecture
- Auto-registration of question types
- Convention-over-configuration approach

### Benefits
- Add question types without touching core code
- Better extensibility
- Cleaner separation

### Risks
- Significant architecture change
- Current system already improved from Week 1
- May not be worth the effort for this app's scale

---

## Recommendations

### Do Next (If Continuing Refactoring)
1. **Week 3: Socket.IO Handler Extraction** - Most value for effort
   - Keeps momentum going
   - Natural next step after backend services
   - Clear boundaries

### Skip for Now
- **Week 4**: AI service extraction is low priority
- **Week 5**: State management works well currently
- **Week 6**: Question type plugin system is over-engineering

### Stop Here (Recommended)
- Weeks 1-2 achieved core goals
- Codebase is significantly improved
- Diminishing returns on further refactoring
- Better to ship and iterate later if pain points emerge

---

## When to Revisit

**Revisit Week 3 if:**
- Adding complex multiplayer features (tournaments, spectators, etc.)
- Socket.IO handlers become difficult to maintain
- Need to write tests for game session logic

**Revisit Week 5 if:**
- State bugs becoming frequent
- Difficulty tracking state across managers
- Need for time-travel debugging

**Revisit Week 6 if:**
- Planning to add 10+ new question types
- Building a question type marketplace
- Need third-party extensibility

---

**Last Updated**: 2025-11-10
**Next Review**: When pain points emerge (not proactively)
