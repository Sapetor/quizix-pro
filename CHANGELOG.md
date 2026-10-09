# Changelog

All notable changes to Quizix Pro will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-10-09

### Security
- Production dependency audit (`npm audit --omit=dev`) went from 14 findings (1 low, 5 moderate, 8 high) to 3 moderate. Version ranges raised: express 4.22.3, multer 2.4.0, mammoth 1.13.0, sharp 0.35.5, uuid 11.1.1. The socket.io, engine.io, ws, undici, proxy-addr and compression entries cleared through `npm audit fix`.
- officeparser removed. It pulled pdfjs-dist (GHSA-hq66-cqwq-w95j), tesseract.js and file-type, about 88 MB, into an unauthenticated upload route. PPTX text is now read with jszip.
- The 3 remaining moderate findings are one chain: sprintf-js through argparse through mammoth. Only mammoth's CLI requires argparse; accepted.
- Earlier on this branch (commit fc2ff1c): SheetJS vendored, signup gated, manim and container hardening, `unsafe-inline` dropped from the CSP.

### Fixed
- PPTX upload returned 500 for every file: `routes/file-uploads.js` called `officeparser.parseOfficeAsync`, which officeparser 6.x does not export. The route now uses `extractPptxText` (jszip): slides in numeric order, one paragraph per line, XML entities decoded, 400 with `error_pptx_extraction_failed` for files that are not PPTX or whose slide XML decompresses past 5 MB per slide or 20 MB in total. Parsing is linear in the slide size.
- `.ppt` removed from the AI generator file picker; no extractor ever parsed it.
- Consensus mode: End Round now locks consensus first, so the round's team score is awarded. Natural timeout and the all-answered path are unchanged, and a locked round is not awarded twice.
- Player auto-rejoin after a socket reconnect: `_attemptRejoin` called `socket.connect()` while the manager `reconnect` event had already opened the engine, which sent a second CONNECT packet and closed the transport. It now waits for `connect` and calls `connect()` only from the Rejoin button path.
- The End Round button shows `ending_round` while disabled instead of `waiting_for_results`; the key exists in all 9 locales.
- Quick-start panel no longer reads the never-saved `powerUpsEnabled` setting; the power-ups checkbox is reset to unchecked on each quiz selection.
- `multiple_correct` label shortened to "Multi-Select" (en) with short forms in the other 8 locales, so it no longer ellipsises on 390px phones. `index.html` option text updated to match.

### Changed
- Removed dead CSS: about 2,370 lines and 366 selectors with no reference in HTML, JS or server code (keyboard-shortcuts modal, user manual, old connection indicator, font-size buttons, `.fs-*` utilities, preview carousel and device toggle, lobby and mobile-header leftovers), plus 10 keyframes and 4 CSS variables left unused. Classes built at runtime (`toast-${type}`, `qs-glyph--${glyph}`, `qr-size-${n}`, `hljs-*`) are kept.
- Removed 286 unused translation keys from all 9 locales (1414 -> 1128 each). Keys built at runtime (`question_type_*`, `compare_improving/declining/stable`) are kept.
- Removed unused exports `closeAuthModal`, `createQuestionCounter`, `validateQuery` and five param schemas, and the opt-in `/api/stats/memory` endpoint, which nothing called or documented. `/debug/config`, `/api/debug/files` and `/api/debug/directory` stay, since DEPLOYMENT.md documents them.
- Removed the unused outbound socket schemas `game-created`, `player-joined`, `answer-result`, `question-end` and `game-end` from `services/validation-schemas.js`. `validateSocketEvent` stays, since `validateAndHandle` uses it.
- Added a comment in `public/index.html` marking the hidden `.quiz-settings` block as live (mirrored from `#quiz-settings-modal`, read by `settings-persistence.js`, `app.js` and `statistics-manager.js`).
- `package-lock.json` also moved dev dependencies (@babel 7.29, postcss 8.5.28, js-yaml 4.3.2, others). The rebuilt CSS bundle drops `-webkit-print-color-adjust` and `-webkit-mask-image` prefixes.

### Tests
- Added `tests/unit/end-round-consensus-lock.test.js` (5 cases) and `tests/unit/pptx-extraction.test.js` (6 cases, in process, including a deflated 30 MB slide and 40k unclosed tags). `npm test`: 73 suites, 1291 tests pass.
- `tests/e2e-disconnect-overlay.spec.js` corrected to start the game before disconnecting; 4/4 pass on a clean port, 12/12 with `--repeat-each 3`. With the rejoin fix disabled, the auto-rejoin case failed 4/4.
- `tests/e2e/analytics-modal.spec.js`: 4/4 pass.
- Visual baselines: both snapshot directories regenerated (45 + 7 PNGs). `visual-regression.spec.js` fixture sets `manualAdvancement: false`; `visual-static.spec.js` caps the `networkidle` wait at 5 s. `npm run test:visual` passes 7/7. The three final-screen baselines are fully masked by the confetti mask and compare nothing.
- Unit suite: 73 suites, 1286 tests pass. `npx eslint .`: 0 errors, 287 warnings.

---

## [2026-01-28]

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

Changes before 2026-01-28 are tracked in git history. The refactoring roadmap, simplification task list and refactoring summary that this section used to link do not exist in the repository or in `docs/archive`.

---

## Version History

This project does not currently use semantic versioning. Version history is tracked through git commits and documentation files.
