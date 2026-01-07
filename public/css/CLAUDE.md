# CSS Architecture and Debugging Guide

This document provides guidance for working with the Quizix Pro CSS architecture, specifically focusing on common issues and solutions discovered during development.

## CSS Module Structure

Quizix Pro uses a modular CSS architecture with the following structure:

```
public/css/
├── main.css - Master import file that loads all modules
├── base.css - CSS variables, reset, typography (Inter font)
├── layout.css - Grid systems, containers, host layouts
├── components.css - Buttons, inputs, cards, form elements
├── modals.css - Modal dialog systems and overlays
├── game.css - Game screens, lobby, leaderboard styling
├── preview.css - Live preview system and split-screen layout
├── toolbar.css - Left toolbar navigation and controls
└── responsive.css - Media queries and mobile optimizations
```

## Critical CSS Specificity Issues

### Problem: CSS Changes Not Applying Despite !important

**Root Cause**: CSS Specificity Hierarchy overrides `!important` when selectors have different specificity levels.

**Example Issue**: Checkbox options in multiple correct preview questions had colorful styling that couldn't be overridden.

**Blocking Selectors** (High Specificity):
```css
.preview-content .player-checkbox-options .checkbox-option:nth-child(1)
/* Specificity: 0,0,4,0 */
```

**Failed Attempts** (Low Specificity):
```css
.checkbox-option { ... } /* Specificity: 0,0,1,0 */
```

**Solution**: Match or exceed specificity:
```css
.preview-content .player-checkbox-options .checkbox-option:nth-child(1),
.preview-content-split .player-checkbox-options .checkbox-option:nth-child(1) {
    /* Your overrides here */
}
```

### CSS Specificity Calculation
- Inline styles: 1,0,0,0
- IDs: 0,1,0,0
- Classes/attributes/pseudo-classes: 0,0,1,0
- Elements/pseudo-elements: 0,0,0,1

### Theme-Specific Selector Specificity

**Critical Issue**: Dark mode rules use `:not([data-theme="light"])` selector with `!important`, creating high specificity that blocks simple mobile overrides.

**Example** (from `game.css`):
```css
/* Dark mode rule - Specificity: 0,2,1,1 (pseudo-class + attribute + ID + element) */
:not([data-theme="light"]) #current-question pre {
    white-space: pre !important;
}

/* Simple mobile override - Specificity: 0,1,0,1 (ID + element) - FAILS */
@media (max-width: 768px) {
    #current-question pre {
        white-space: pre-wrap !important;  /* Won't override! */
    }
}
```

**Solution**: Mobile overrides MUST include theme selectors to match specificity:
```css
@media (max-width: 768px) {
    :not([data-theme="light"]) #current-question pre,
    [data-theme="light"] #current-question pre,
    #current-question pre {
        white-space: pre-wrap !important;  /* Now overrides! */
    }
}
```

**Key Files with Theme Selectors**:
- `game.css` lines 497-515: Dark mode code block styles
- `game.css` lines 455-493: Light mode code block styles
- `responsive.css` lines 1352-1371: Mobile code block overrides

## Checkbox Options Architecture

### Design Intent
Multiple correct questions should display as **simple checkbox lists**, NOT styled buttons like multiple choice options.

### Key Components

**HTML Structure**:
```html
<div class="player-checkbox-options">
    <div class="checkbox-option preview-checkbox" data-option="0">
        <input type="checkbox" disabled> A: Option text
    </div>
</div>
```

**Target Styling**:
```css
.checkbox-option {
    display: flex !important;
    align-items: center !important;
    padding: 6px 12px !important;  /* Reduced for 61.45px height */
    margin: 8px 0 !important;
    width: 100% !important;
    max-width: 500px !important;   /* Consistent width */
    background: rgba(255,255,255,0.05) !important;
    border: 1px solid rgba(255,255,255,0.2) !important;
    /* NO colorful backgrounds */
}
```

### Common Issues and Solutions

**Issue 1**: Alternative A appears blue while others are neutral
- **Cause**: Colorful preview system with nth-child selectors
- **Solution**: Override ALL nth-child color rules with maximum specificity

**Issue 2**: Inconsistent widths between checkbox options
- **Cause**: Missing width constraints
- **Solution**: Add `width: 100%` and `max-width: 500px` to match multiple choice

**Issue 3**: Height doesn't match multiple choice options (target: 61.45px)
- **Cause**: Excessive padding
- **Solution**: Use `padding: 6px 12px` instead of larger values

## Preview System Architecture

### Multiple Question Types
1. **Multiple Choice**: Styled buttons (`.player-option`)
2. **Multiple Correct**: Simple checkbox lists (`.checkbox-option`)
3. **True/False**: Styled buttons (`.tf-option`)
4. **Numeric**: Input field

### Colorful Preview System
The preview system includes colorful options for visual distinction:
- Option A: Blue (`#3b82f6`)
- Option B: Green (`#10b981`)
- Option C: Orange (`#f59e0b`)
- Option D: Red (`#ef4444`)
- Option E: Purple (`#8b5cf6`)
- Option F: Cyan (`#06b6d4`)

**Important**: Checkbox options should NOT use these colors - they should remain neutral.

## Debugging CSS Issues

### Step 1: Identify Specificity
Use browser dev tools to see which selectors are winning:
1. Inspect element
2. Look at Computed styles
3. Check which rules are crossed out (overridden)

### Step 2: Calculate Specificity
Count selectors in this order:
- IDs: Most specific
- Classes/attributes: Medium
- Elements: Least specific

### Step 3: Create Higher Specificity
Copy the winning selector pattern and modify it:
```css
/* Instead of: */
.checkbox-option { ... }

/* Use: */
.preview-content .player-checkbox-options .checkbox-option { ... }
```

### Step 4: Test with Maximum Specificity
If still failing, use the most specific selectors possible:
```css
.preview-content .player-checkbox-options .checkbox-option:nth-child(1) { ... }
```

## Cache Busting

CSS changes may not appear due to browser caching. The project uses version-based cache busting:

**In index.html**:
```html
<link rel="stylesheet" href="css/main.bundle.css?v=11.6">
```

**Important**: Update the version number when making CSS changes:
1. Edit `public/index.html` (two places: preload and noscript)
2. Increment version (e.g., `v=11.6` to `v=11.7`)
3. Test with hard refresh or incognito window

## File Organization Best Practices

### components.css Focus
- Form elements (inputs, buttons, checkboxes)
- Card layouts
- UI component styling
- Checkbox option overrides (due to specificity requirements)

### preview.css Focus  
- Live preview modal
- Split-screen layouts
- Preview-specific styling
- Colorful option systems

### Avoid Duplication
- Don't duplicate selectors across files
- Use `main.css` imports to control load order
- Components.css loads after preview.css to allow overrides

## Testing Checklist

When modifying checkbox styling:
- [ ] Alternative A has no blue color
- [ ] All alternatives have same neutral background
- [ ] All alternatives have consistent width (500px max)
- [ ] Height matches multiple choice options (~61.45px)
- [ ] Hover states work correctly
- [ ] Dark/light themes both work
- [ ] Checkboxes are properly sized and positioned

## Common Patterns

### Safe Override Pattern
```css
/* Target all possible selector combinations */
.base-selector,
.specific-context .base-selector,
.specific-context .container .base-selector,
.specific-context .container .base-selector:nth-child(n) {
    /* Your styles with !important */
}
```

### Consistent Sizing Pattern
```css
.option-element {
    width: 100% !important;
    max-width: 500px !important;
    box-sizing: border-box !important;
    padding: [calculated for target height] !important;
}
```

## Common Live Preview Issues

### LaTeX Rendering Stops Working
**Symptoms**: Mathematical equations stop rendering in live preview after navigation
**Root Cause**: MathJax rendering race conditions with DOM updates
**Solution**: Enhanced MathJax retry mechanism with better error handling and timing

### Questions Disappear During Navigation
**Symptoms**: Only first and last questions show when using preview arrows
**Root Cause**: Index bounds checking and DOM query timing issues
**Solution**: Improved question validation and better error recovery

### Fullscreen API Errors
**Symptoms**: Console errors about "API can only be initiated by a user gesture"
**Root Cause**: Fullscreen API called without proper user interaction
**Solution**: Added promise-based error handling and user gesture validation

## Debugging Preview Issues

### MathJax Problems
1. Check browser console for MathJax errors
2. Verify `window.MathJax` is loaded
3. Look for DOM timing issues (elements updated after MathJax call)
4. Use enhanced retry mechanism in `renderMathJaxWithRetry()`

### Question Navigation Issues
1. Check `currentPreviewQuestion` index bounds
2. Verify `document.querySelectorAll('.question-item')` returns expected count
3. Look for DOM updates that might invalidate question references
4. Use debug logging to track navigation state

### Performance Optimization
- Debounced updates prevent excessive re-rendering
- MathJax rendering is delayed to ensure DOM stability
- Error recovery prevents infinite retry loops

## Maintenance Notes

- Checkbox option styling must be maintained in `components.css` due to specificity requirements
- Any changes to preview colorful options must include corresponding overrides for checkbox options
- Height adjustments should be made via padding changes, not min-height or height properties
- Always test both split-screen and modal preview modes
- MathJax rendering requires proper timing after DOM updates
- Question navigation needs robust bounds checking

## Code Block Mobile Styling

### Problem: Code Blocks Overflow on Mobile
Code blocks with syntax highlighting were cut off horizontally on mobile host view, requiring horizontal scroll.

### Root Cause
1. Base styles set `white-space: pre` to preserve code formatting
2. Dark mode rules in `game.css` used `:not([data-theme="light"])` with `!important`
3. Simple mobile media query selectors couldn't override due to lower specificity

### Solution
Mobile overrides in `responsive.css` and `game.css` must:
1. Use theme-specific selectors to match specificity
2. Set `white-space: pre-wrap` to allow line wrapping
3. Set `word-break: break-word` for long identifiers

**Implemented Pattern** (in `responsive.css`):
```css
@media (max-width: 768px) {
    :not([data-theme="light"]) #current-question pre,
    :not([data-theme="light"]) #player-question-text pre,
    :not([data-theme="light"]) .player-option pre,
    [data-theme="light"] #current-question pre,
    [data-theme="light"] #player-question-text pre,
    [data-theme="light"] .player-option pre,
    #current-question pre,
    #player-question-text pre,
    .player-option pre {
        font-size: 0.68rem !important;
        white-space: pre-wrap !important;
        word-break: break-word !important;
        max-width: calc(100vw - 48px) !important;
    }
}
```

### Testing Checklist
When modifying code block styling:
- [ ] Code wraps properly on mobile (no horizontal scroll)
- [ ] Syntax highlighting colors preserved
- [ ] Works in both dark and light themes
- [ ] Font size readable on mobile (~0.68rem)
- [ ] Long lines wrap at word boundaries when possible