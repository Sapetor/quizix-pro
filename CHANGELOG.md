# Changelog

All notable changes to Quizix Pro will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-01-28

### Security
- **CRITICAL FIX**: Authentication bypass vulnerability patched in `file-manager.js:ensureUnlocked()`. When the `/api/requires-auth` endpoint fails (network error, server error, etc.), the system now **denies access** instead of allowing it. This implements a fail-closed security policy to prevent unauthorized access to password-protected quizzes and folders.
- Token expiry race condition fixed in `file-manager.js:deleteItem()`. The system now automatically detects expired session tokens and re-authenticates users seamlessly before completing delete operations, preventing authorization failures after password entry.

### Fixed
- **Bug**: Invalid time values (0 seconds, negative values, or extremely large numbers) can no longer be applied to all questions via the global time setting. Added bounds validation (5-300 seconds) in `globals.js:toggleGlobalTime()` and `globals.js:updateGlobalTime()`.
- **Bug**: Per-question time limits now properly enforce validation bounds before syncing to all questions when global time is enabled.
- **Display**: Host-side question alternatives no longer clip multi-line content. Changed `overflow: hidden` to `overflow: visible` in `.option-display` (game.css) and `.ordering-display-item` (components.css). This fixes incomplete display of long options, code blocks, and LaTeX equations.
- **Display**: Changed `align-items: center` to `align-items: flex-start` in host option containers to properly display multi-line content.
- **Time Configuration**: Fixed property name mismatch preventing time settings from being saved. Changed from `time` to `timeLimit` in `quiz-manager.js:extractQuestionData()`. Added backward compatibility to support both property names when loading quizzes.
- **Time Configuration**: Global time setting ("Use same time for all questions") now properly applies the configured value to all questions when saving a quiz. Previously, the global time checkbox was non-functional.
- **XSS Prevention**: Added `escapeHtmlPreservingLatex()` to ordering question rendering in `question-renderer.js`, preventing potential cross-site scripting vulnerabilities while preserving LaTeX math rendering.

### Changed
- Delete operations in `file-manager.js:deleteItem()` now use `unifiedErrorHandler.wrapAsyncOperation()` following CLAUDE.md guidelines for consistent error handling across the codebase.
- Auth check failures now display user-friendly error message: "Unable to verify permissions. Please try again."
- Enhanced logging for authentication operations to aid debugging (token expiry, re-authentication, auth check failures).

### Added
- **Feature**: Automatic token refresh during delete operations. If a session token expires between unlock and delete, the system re-prompts for password and obtains a fresh token without failing the operation.
- **Feature**: Global time input now updates all question times in real-time as the value changes (via `updateGlobalTime()` function).
- **Feature**: Enabling global time checkbox now syncs all existing question times to the global value immediately.

### Documentation
- Updated `docs/API_REFERENCE.md` - Replaced outdated "does not implement authentication" statement with comprehensive password protection documentation including authentication flow, endpoints, and security guarantees.
- Updated `CLAUDE.md` - Added fail-closed authentication policy and automatic token refresh to Password Protection Security section.
- Created `CHANGELOG.md` - This file.

---

## Previous Changes

For changes prior to 2026-01-28, see:
- [REFACTORING_ROADMAP.md](REFACTORING_ROADMAP.md) - Weeks 1-5 refactoring history
- [simplify-tasks.md](simplify-tasks.md) - Code simplification phases (SIMP-1 through SIMP-12)
- [docs/REFACTORING_SUMMARY.md](docs/REFACTORING_SUMMARY.md) - Comprehensive refactoring summary

---

## Version History

This project does not currently use semantic versioning. Version history is tracked through git commits and documentation files.
