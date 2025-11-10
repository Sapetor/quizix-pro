# QuestionTypeRegistry Migration Guide

## Overview

The **QuestionTypeRegistry** is now the single source of truth for all question type logic. This eliminates the "scattered definitions across 40+ locations" problem documented in CLAUDE.md.

---

## What Was Implemented (Phase 1)

### ✅ **Created Core Registry**

1. **`public/js/utils/question-type-registry.js`** (560 lines)
   - Frontend ES6 module with complete question type definitions
   - Provides: `extractData()`, `populateQuestion()`, `validate()`, `scoreAnswer()`
   - Container IDs, selectors, and logic for all 5 question types

2. **`services/question-type-service.js`** (235 lines)
   - Backend CommonJS module for server.js
   - Provides: `validate()`, `scoreAnswer()`
   - Keeps backend and frontend logic in sync

### ✅ **Integrated Into Core Files**

#### **server.js** (Game class)
- ✅ Replaced 40-line switch statement with `QuestionTypeService.scoreAnswer()`
- ✅ Added `getCorrectAnswerKey()` helper to normalize answer formats
- ✅ All 5 question types now use centralized scoring

**Before** (40 lines):
```javascript
switch (question.type || 'multiple-choice') {
  case 'multiple-choice':
    isCorrect = answer === question.correctAnswer;
    break;
  case 'multiple-correct':
    // ... 10 lines of array comparison
    break;
  case 'true-false':
    isCorrect = answer.toString().toLowerCase() === question.correctAnswer.toString().toLowerCase();
    break;
  case 'numeric':
    // ... tolerance calculation
    break;
  case 'ordering':
    // ... partial credit calculation
    break;
}
```

**After** (3 lines):
```javascript
const correctAnswerKey = this.getCorrectAnswerKey(question);
const options = questionType === 'numeric' ? { tolerance: question.tolerance || 0.1 } : {};
let isCorrect = QuestionTypeService.scoreAnswer(questionType, answer, correctAnswerKey, options);
```

---

#### **quiz-manager.js** (Quiz creation/editing)
- ✅ Replaced 75 lines of extraction logic with `QuestionTypeRegistry.extractData()`
- ✅ Replaced 90 lines of population logic with `QuestionTypeRegistry.populateQuestion()`
- ✅ **Net reduction: -137 lines**

**Before** (extraction - 75 lines):
```javascript
if (questionType === 'multiple-choice') {
  const options = [];
  const optionInputs = questionElement.querySelectorAll('.multiple-choice-options .option');
  optionInputs.forEach(input => {
    if (input.value.trim()) options.push(input.value.trim());
  });
  const correctAnswerElement = questionElement.querySelector('.multiple-choice-options .correct-answer');
  questionData.options = options;
  questionData.correctAnswer = parseInt(correctAnswerElement.value);
} else if (questionType === 'multiple-correct') {
  // ... another 20 lines
} else if (questionType === 'true-false') {
  // ... another 5 lines
} // ... and so on
```

**After** (2 lines):
```javascript
const typeSpecificData = QuestionTypeRegistry.extractData(questionType, questionElement);
Object.assign(questionData, typeSpecificData);
```

---

## Impact Summary

### **Code Reduction**
| File | Before | After | Lines Saved |
|------|--------|-------|-------------|
| server.js (scoring) | 40 lines | 3 lines | **-37 lines** |
| quiz-manager.js | 165 lines | 18 lines | **-147 lines** |
| **Total Eliminated** | **205 lines** | **21 lines** | **-184 lines** |

### **New Centralized Code**
| File | Lines | Purpose |
|------|-------|---------|
| question-type-registry.js | 560 lines | Frontend registry (all question types) |
| question-type-service.js | 235 lines | Backend service (validation + scoring) |
| **Total New Code** | **795 lines** | Centralized, reusable logic |

### **Net Impact**
- **Duplicate code eliminated**: ~184 lines across 2 files
- **Centralized logic created**: ~795 lines (reusable by all consumers)
- **Remaining consumers to migrate**: 6 files (preview-manager, game-manager, etc.)
- **Estimated additional reduction**: ~300-400 lines when all files migrated

---

## Migration Guide for Remaining Files

### **Files That Should Adopt Registry**

1. **`preview-manager.js`** (lines 530-644)
   - Currently duplicates extraction logic from quiz-manager
   - **Action**: Import and use `QuestionTypeRegistry.extractData()`
   - **Impact**: ~115 lines eliminated

2. **`game-manager.js`** (line 176)
   - Hard-coded `containerMap` with all question types
   - **Action**: Use `QuestionTypeRegistry.getContainerId(type, 'player')`
   - **Impact**: ~30 lines eliminated

3. **`question-renderer.js`** (setupPlayerQuestionUI methods)
   - Rendering logic for each question type
   - **Action**: Consider extracting rendering to registry or keep as-is
   - **Decision needed**: Rendering is complex, may stay decoupled

4. **`player-interaction-manager.js`** (submit handlers)
   - Answer submission for each type
   - **Action**: Keep as-is (event handling is UI-specific)

5. **`index.html`** (default question template)
   - Hard-coded dropdown options
   - **Action**: Consider generating from registry, but low priority

6. **`question-utils.js`** (createQuestionElement)
   - Question element creation
   - **Action**: Low priority, creation logic is different from data extraction

---

## How to Migrate a File

### **Step 1: Import the Registry**

**Frontend files**:
```javascript
import { QuestionTypeRegistry } from '../utils/question-type-registry.js';
```

**Backend files** (if needed):
```javascript
const { QuestionTypeService } = require('./services/question-type-service');
```

---

### **Step 2: Replace Extraction Logic**

**Old pattern** (scattered across multiple if/else blocks):
```javascript
if (questionType === 'multiple-choice') {
  const options = Array.from(element.querySelectorAll('.option'))
    .map(opt => opt.value.trim());
  const correctIndex = /* ... find correct answer ... */;
  return { options, correctIndex };
} else if (questionType === 'multiple-correct') {
  // ... another 15 lines
} // ... etc
```

**New pattern** (single line):
```javascript
const data = QuestionTypeRegistry.extractData(questionType, questionElement);
```

---

### **Step 3: Replace Population Logic**

**Old pattern**:
```javascript
if (questionType === 'multiple-choice') {
  const optionInputs = element.querySelectorAll('.option');
  data.options.forEach((option, index) => {
    if (optionInputs[index]) optionInputs[index].value = option;
  });
  // ... handle correct answer
} else if (questionType === 'multiple-correct') {
  // ... another 15 lines
} // ... etc
```

**New pattern** (single line):
```javascript
QuestionTypeRegistry.populateQuestion(questionType, questionElement, data);
```

---

### **Step 4: Replace Validation Logic**

**Old pattern**:
```javascript
if (questionType === 'multiple-choice') {
  if (!data.options || data.options.length < 2) {
    errors.push('At least 2 options required');
  }
  if (data.correctIndex < 0) {
    errors.push('Correct answer must be selected');
  }
} // ... etc for each type
```

**New pattern**:
```javascript
const validation = QuestionTypeRegistry.validate(questionType, data);
if (!validation.valid) {
  errors.push(validation.error);
}
```

---

### **Step 5: Replace Scoring Logic** (Backend only)

**Old pattern** (server.js):
```javascript
switch (question.type) {
  case 'multiple-choice':
    isCorrect = answer === question.correctAnswer;
    break;
  case 'numeric':
    const tolerance = question.tolerance || 0.1;
    isCorrect = Math.abs(answer - question.correctAnswer) <= tolerance;
    break;
  // ... etc
}
```

**New pattern**:
```javascript
const options = { tolerance: question.tolerance || 0.1 }; // for numeric only
const isCorrect = QuestionTypeService.scoreAnswer(
  question.type,
  playerAnswer,
  correctAnswer,
  options
);
```

---

### **Step 6: Use Registry Utilities**

The registry provides several utility methods:

```javascript
// Get container ID for rendering context
const playerId = QuestionTypeRegistry.getContainerId('multiple-choice', 'player');
// → 'player-multiple-choice'

const hostId = QuestionTypeRegistry.getContainerId('numeric', 'host');
// → 'host-numeric'

// Get DOM selectors
const selectors = QuestionTypeRegistry.getSelectors('true-false');
// → { optionsContainer: '.true-false-options', trueButton: ..., ... }

// Check if type is valid
if (QuestionTypeRegistry.isValidType(userInput)) {
  // ... safe to use
}

// Get all supported types
const allTypes = QuestionTypeRegistry.getTypeIds();
// → ['multiple-choice', 'multiple-correct', 'true-false', 'numeric', 'ordering']
```

---

## Adding a New Question Type

### **Before Registry** (8 hours)
Required changes across 40+ locations in 13+ files:
1. server.js (validation, scoring)
2. quiz-manager.js (extraction, population)
3. preview-manager.js (extraction - duplicate!)
4. game-manager.js (container map)
5. question-renderer.js (rendering)
6. player-interaction-manager.js (submit handlers)
7. question-utils.js (utilities)
8. index.html (3 places)
9. CSS files (styling)
10. Translation files (9 languages)
11. ... and more

### **After Registry** (1 hour)
Only 3 files need updates:

#### **1. Add to QuestionTypeRegistry** (~100 lines)
```javascript
// public/js/utils/question-type-registry.js

'my-new-type': {
  id: 'my-new-type',
  label: 'My New Type',

  containerIds: {
    player: 'player-my-new-type',
    host: 'host-my-new-type',
    preview: 'preview-my-new-type'
  },

  selectors: {
    optionsContainer: '.my-new-type-options',
    // ... other selectors
  },

  extractData: (questionElement) => {
    // Extraction logic here
    return { /* extracted data */ };
  },

  populateQuestion: (questionElement, data) => {
    // Population logic here
  },

  validate: (data) => {
    // Validation logic
    return { valid: true } or { valid: false, error: 'message' };
  },

  scoreAnswer: (playerAnswer, correctAnswer) => {
    // Scoring logic
    return true or false;
  }
}
```

#### **2. Add to Backend Service** (~60 lines)
```javascript
// services/question-type-service.js

'my-new-type': {
  validate: (data) => {
    // Same validation as frontend
  },

  scoreAnswer: (playerAnswer, correctAnswer) => {
    // Same scoring as frontend
  }
}
```

#### **3. Update UI/CSS** (as needed)
- Add HTML template to `index.html`
- Add CSS styling
- Add translations (if using translation keys)
- Add rendering logic to `question-renderer.js` (if complex rendering needed)

---

## Testing Checklist

After migration, test these scenarios:

### **Quiz Creation**
- [ ] Create quiz with all 5 question types
- [ ] Save quiz and verify JSON format
- [ ] Load saved quiz and verify data populated correctly
- [ ] Edit existing quiz (change answers, options)

### **Game Flow**
- [ ] Host creates game
- [ ] Players join
- [ ] All question types render correctly for host
- [ ] All question types render correctly for players
- [ ] Players can submit answers for all types
- [ ] Scoring works correctly for all types
- [ ] Leaderboard updates properly

### **Edge Cases**
- [ ] Empty options (should be prevented by validation)
- [ ] Missing correct answer (should be caught by validation)
- [ ] Numeric answers with different tolerances
- [ ] Ordering with partial credit
- [ ] Multiple-correct with all options selected

---

## Benefits of Registry Approach

### **For Developers**

1. **Single Source of Truth**
   - No more hunting across 13+ files
   - One place to update logic
   - Consistent behavior guaranteed

2. **Faster Feature Development**
   - Adding question type: 8 hours → 1 hour
   - Less debugging (fewer places for bugs)
   - Clear patterns to follow

3. **Easier Maintenance**
   - Fix bug once, fixes everywhere
   - Code is self-documenting
   - Easier to onboard new developers

4. **Better Testing**
   - Can test registry in isolation
   - Mock question types easily
   - Centralized test coverage

### **For Codebase Health**

1. **Reduced Duplication**
   - Eliminated 184+ lines of duplicate code (so far)
   - Expected total: ~500 lines when fully migrated

2. **Improved Consistency**
   - Same extraction logic in quiz-manager and preview-manager
   - Same scoring logic in frontend and backend
   - Same validation rules everywhere

3. **Scalability**
   - Easy to add new question types
   - Easy to extend existing types
   - Clear upgrade path

---

## Next Steps

### **Priority 1: Complete Core Migration**
- [ ] Migrate `preview-manager.js` extraction logic
- [ ] Update `game-manager.js` container mapping
- [ ] Test thoroughly

### **Priority 2: Optional Optimizations**
- [ ] Extract rendering logic to registry (if beneficial)
- [ ] Generate HTML templates from registry
- [ ] Create validation utilities

### **Priority 3: Documentation**
- [ ] Update CLAUDE.md with registry usage
- [ ] Update ADD-QUESTION-TYPE.md to reference registry
- [ ] Create example of adding new question type

---

## Troubleshooting

### **Issue: "Cannot find module 'question-type-registry'"**
**Solution**: Check import path is correct relative to file location
```javascript
// From quiz-manager.js
import { QuestionTypeRegistry } from '../utils/question-type-registry.js';

// From preview-manager.js
import { QuestionTypeRegistry } from '../utils/question-type-registry.js';
```

### **Issue: "QuestionTypeRegistry is not defined"**
**Solution**: Make sure you imported it at the top of the file

### **Issue: "Extraction returns empty object"**
**Solution**: Check that DOM structure matches selectors in registry
- Use browser DevTools to inspect question element
- Compare with selectors in registry definition
- Verify question type string matches registry key exactly

### **Issue: "Scoring doesn't work for custom type"**
**Solution**: Make sure backend service matches frontend registry
- Check `services/question-type-service.js` has your type
- Verify scoring logic is identical to frontend
- Test with `QuestionTypeService.scoreAnswer()` directly

---

## Contact & Support

- **Documentation**: See `/docs/ADD-QUESTION-TYPE.md` for detailed guide
- **Examples**: Look at `server.js` and `quiz-manager.js` for working implementations
- **Issues**: Check CLAUDE.md for known patterns and solutions

---

## Version History

- **v1.0** (2025-11-10): Initial implementation
  - Created QuestionTypeRegistry (frontend)
  - Created QuestionTypeService (backend)
  - Integrated into server.js and quiz-manager.js
  - Eliminated 184 lines of duplicate code
