# Quizix Pro Improvement Tasks

Work through these one at a time. After completing each task, commit and `/clear` context.

## Bugs (High Priority)

- [x] **BUG-1**: Fix Average Score calculation showing 493% in Results Viewer
- [x] **BUG-2**: Fix split resize handle blocking clicks on mobile preview panel
- [x] **BUG-3**: Fix Create Lobby button truncation in accessibility large font mode
- [x] **BUG-4**: Fix full-page screenshot CSS stacking context issue

## UX Improvements

- [x] **UX-1**: Add tooltips to toolbar emoji buttons (➕ 💾 📂 🤖 👁️ etc)
- [x] **UX-2**: Add helpful illustration to empty states (No active games found)
- [x] **UX-3**: Create first-time user onboarding tutorial/wizard
- [x] **UX-4**: Add keyboard shortcuts help overlay (press ? to show)
- [x] **UX-5**: Add question count/progress indicator in quiz editor

## Accessibility

- [x] **A11Y-1**: Add aria-labels to emoji-only buttons for screen readers
- [x] **A11Y-2**: Ensure visible focus indicators on all interactive elements
- [x] **A11Y-3**: Verify answer option colors meet WCAG AA contrast requirements
- [x] **A11Y-4**: Fix layout overflow when accessibility large font is enabled

## Mobile

- [x] **MOB-1**: Hide/disable split-view resize handle on mobile viewports
- [x] **MOB-2**: Ensure all touch targets meet 44x44px minimum size
- [x] **MOB-3**: Add swipe-to-delete gesture on results list items

## Performance

- [x] **PERF-1**: Implement lazy loading for AI Generator and Results Viewer modals
- [x] **PERF-2**: Add WebP image support with fallback for quiz images
- [x] **PERF-3**: Add Service Worker for static asset caching (faster repeat loads)

---

## Workflow

1. Tell Claude: `Work on task BUG-1 from TASKS.md`
2. Claude implements and commits
3. Mark task complete in this file
4. Run `/clear`
5. Repeat with next task
