# Changelog

All notable changes to Quizix Pro will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-11-12

### Added
- Offline classroom use: MathJax 3.2.2, Chart.js 4.4.0, highlight.js 11.9.0 with the atom-one-dark theme, canvas-confetti 1.6.0, jsPDF 2.5.1, mermaid 10.9.8 and the Inter, Space Grotesk, JetBrains Mono and Source Serif 4 web fonts are vendored under `public/libs` at pinned versions (5.8 MB added). The browser contacts no CDN. Versions, sources and sha256 are in `public/libs/README.md` and `public/libs/SHA256SUMS`.
- The Socket.IO client loads from the app's own `socket.io/socket.io.min.js`, not `cdn.socket.io`, so client and server versions match.
- CSP: `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `cdn.socket.io`, `fonts.googleapis.com` and `fonts.gstatic.com` removed from every directive of the main policy. The service worker's cache-first rule for CDN hosts is now a cache-first rule for same-origin `/libs/` paths.
- `tests/e2e/offline-no-cdn.spec.js` hosts a game with every non-local request aborted and fails on any external request; `tests/unit/vendored-libs.test.js` checks references and checksums. Verified in Chromium only. The debug pages under `ENABLE_DEBUG_ROUTES` still reference CDNs.

### Security
- Production dependencies updated by `npm audit fix` within their existing ranges (zod 4.6.7, multer 2.5.0, body-parser 1.20.9, qs 6.16.2, undici 7.30.2): `npm audit --omit=dev` reports 0 vulnerabilities. Dev-only tooling still has 20 low and moderate advisories that need breaking upgrades.
- Bug hunt of 2026-11-12 (three review agents, each finding checked by a second reviewer, each fix branch reviewed again before merge):
  - The `/js/*` fallback handler no longer serves files outside `public/js` through raw `..` segments. Before, `GET /js/../../quizzes/.session-secret` returned the file to a client connecting directly to the port. Rotate `quizzes/.session-secret` or `SESSION_SECRET` on instances that were reachable by untrusted clients.
  - DOCX text extraction runs in a capped, killable worker thread with limits on inflated part size; an unparseable DOCX returns 400 instead of 500.
  - Quiz load, save and delete require an exact filename match, so a case variant of a filename on a case-insensitive disk no longer bypasses the visibility, password and ownership checks.
  - /api/extract-url checks the address each connection actually dials, which closes DNS-rebinding access to loopback and private hosts (403 error_url_blocked).
  - Login and signup count each attempt before the password check, so concurrent bursts are held to 10 per minute per IP; successful sign-ins now count toward the limit.
  - /api/ollama/generate, /api/ollama/models and /api/ollama/health require a signed-in user or a direct LAN client while Ollama is enabled.
  - Quiz filenames that name Object.prototype properties (such as __proto__) are rejected.
  - POST /api/save-results requires a signed-in user, or a host token from a direct LAN client; the body is capped at 1 MB (413), and the results listing reads files in batches of 10.
  - Changing a quiz inside a password-protected folder (PATCH /api/quiz-metadata/:filename, overwrite through POST /api/save-quiz) requires the quiz unlock token (401 error_auth_required).
  - A folder password applies to an ownerless quiz that carries a legacy password hash; the folder password unlocks it.
  - An unlock token is bound to the password hash it was issued for, so a password change or a move under another protected folder invalidates it.
  - Only the folder owner may set a folder password (403 error_folder_not_owner); legacy ownerless folders stay open to any signed-in user.
  - A folder can be created or moved only under a parent the requester owns, an ownerless legacy folder, or the root (403 error_folder_not_owner).
  - Moving a folder out from below a password-protected folder, or deleting such a subfolder with deleteContents=true, requires the unlock token of the nearest protected ancestor (401 or 403 error_invalid_token).
  - Migration of players from a game left by a disconnected host now requires the host's session or the migration token, so a client that knows the PIN can no longer pull the players into its own game.
  - A second player-join from the same socket during a question or reveal is rejected, so a crafted client can no longer reset its entry to get fresh power-ups and a new answer slot.
  - A player entry created during a running question (late join, or leave-game then player-join) cannot use extend-time or 50-50 until the next question, so repeated leave and join cycles no longer extend the timer or reveal options. The power-ups are kept.
  - The password modal ignores overlay and Escape cancel for 400 ms after opening.
- `/api/active-games` returns live PINs only to signed-in users and direct LAN clients, meaning a loopback or private TCP peer with no `CF-Connecting-IP`, `X-Forwarded-For`, `X-Real-IP` or `Forwarded` header (`isDirectLocalClient` in `middleware/client-ip.js`). Other requests get `{"games": []}`. The `debug` block listing all games is removed.
- Deleting, overwriting through `/api/save-quiz`, or renaming and moving a quiz that has no owner now needs a signed-in user or a direct LAN client; anonymous requests through a tunnel or proxy get `401`. Before, anyone could delete the ownerless quizzes.
- `GET /api/quiz/:filename` now requires the unlock bearer token for password-protected quizzes; before, it ignored protection. The client records unlock tokens in APIHelper and attaches them to quiz downloads (62ffbf7).
- A host session is reused only with the secret `hostSessionToken` sent to the host in `game-created`. Before, the session ID alone was enough, and players receive it in `session-waiting` (62ffbf7).
- Deleting a folder with its contents now unlinks the quiz files before the metadata, and a failed unlink aborts. Before, the files stayed on disk as ownerless public quizzes. Quizzes owned by another user are moved to the parent folder instead of deleted (62ffbf7).
- A quiz without its own password inside a password-protected folder can be unlocked with the folder password, which issues a quiz-scoped token (05d92bf).
- Production dependency audit (`npm audit --omit=dev`) went from 14 findings (1 low, 5 moderate, 8 high) to 3 moderate. Version ranges raised: express 4.22.3, multer 2.4.0, mammoth 1.13.0, sharp 0.35.5, uuid 11.1.1. The socket.io, engine.io, ws, undici, proxy-addr and compression entries cleared through `npm audit fix`.
- officeparser removed. It pulled pdfjs-dist (GHSA-hq66-cqwq-w95j), tesseract.js and file-type, about 88 MB, into an unauthenticated upload route. PPTX text is now read with jszip.
- pdf-parse 1.1.4 removed. It bundled pdf.js 1.10 (2017), invisible to npm audit. `/api/extract-pdf` now uses pdfjs-dist 6.4.299 directly with `isEvalSupported: false`. Non-PDF input returns 400 instead of 500; the unused `info` field and the 501 "not installed" branch are gone. `engines.node` raised to >=22.13.0, as pdfjs-dist requires. Adds about 69 MB (pdfjs-dist 35 MB, optional @napi-rs/canvas 34 MB).
- PDF extraction runs in a worker thread (`utils/pdf-text-worker.mjs`) with a 256 MB heap cap, at most 2 at a time (503 beyond that), and stops after 500 pages or 1,000,000 characters. On timeout the worker is terminated; before, `withTimeout` answered 408 while pdf.js kept parsing on the main thread.
- The 3 remaining moderate findings are one chain: sprintf-js through argparse through mammoth. Only mammoth's CLI requires argparse; accepted.
- Earlier on this branch (commit fc2ff1c): SheetJS vendored, signup gated, manim and container hardening, `unsafe-inline` dropped from the CSP.

### Fixed
- A player who leaves or is dropped from a running game and joins again from the same device (or, without a device id, with the same name) resumes their own record: score, answers and power-up state carry over, an answer already given cannot be given again, and the saved results have one row per player. Before, a leave deleted the player from the results, and a new join created a second player at 0 points who could answer the current question again. Names of players who left are reserved for the rest of the game against other devices. A resume is refused when the game is full. A refused extend-time resynchronizes the player's countdown.
- Simultaneous first signups on an empty instance create only one account.
- Expired per-IP auth rate-limit entries are removed instead of accumulating.
- A newly created empty folder is listed in its owner's quiz tree.
- Renaming a quiz writes the new title into the quiz file, skips the write when the title is unchanged, and still renames a metadata entry whose file is missing.
- The analytics CSV quotes question text once and falls back to question.question.
- Expired unlock-attempt windows are removed by the periodic token cleanup.
- The luna-e2e results-analytics seed writes the results file directly instead of calling the anonymous save-results route.
- Leaderboard entries sent to clients contain only id, name and score.
- Submit-answer accepts decimal, negative and large numeric answers.
- Results are saved for players removed after the disconnect grace period.
- Fifty-fifty and saved results honour multiple-choice questions that carry only correctIndex.
- Consensus proposals are keyed by player, so a rejoin under a new socket id keeps the vote and is not counted twice; disconnected players stay in the consensus denominator until removed.
- Same Time for All from quick start now applies its time limit to every question.
- Consensus mode no longer shuffles answer options per player, which had split proposals for the same option across different indices.
- Host-rejoin is accepted when it arrives before the server sees the old host socket close.
- Host-rejoin is refused for a game in pending-migration. The host recovers it through host-join with the previous PIN.
- Results of a started game are saved when it enters pending-migration (e.g. the host returns to the menu or does not come back).
- Stale-game cleanup counts from the last question start, not game creation, so sessions longer than 2 hours are no longer deleted mid-question.
- Host sessions are released when the host socket disconnects from the lobby, or after returning to the menu, instead of leaking for the life of the process.
- A player who rejoins during the reveal with shuffled answers sees the correct option highlighted in their own option order.
- A host that reconnects on the final results screen gets the final results again, not an empty game screen.
- In consensus mode the proposal bars update when a player leaves, is removed or rejoins during a question. A rejoined player's proposal is kept under the new connection, and a player who left no longer counts toward consensus.
- Quick Start settings panel and launch now handle password-protected quizzes (one prompt per file, no hang on double click, cancel and stale responses handled).
- Quick Start 'same time for all' now writes timeLimit, the field the server reads.
- The editor restores the global time setting through the real element ids.
- Consensus discussion messages render from the content field the server sends.
- AI generator preview card escapes type and difficulty labels and coerces the time limit.
- Save and Create Game refuse and name a question that has options, ordering items, a numeric answer or an image but no text, instead of dropping it silently.
- A rejected quiz unlock token is dropped so the next load prompts for the password again; loading a protected quiz after a server restart prompts and retries instead of showing 'Invalid quiz file format'.
- Deleting a protected item with a stale token prompts again and retries once.
- Rename, move and visibility changes on quizzes in a password-protected folder send the unlock token; saving over a loaded protected quiz sends the token and retries once on 401.
- Renaming the open quiz in the file browser updates the editor title.
- Practice-mode fifty-fifty uses the correctIndex fallback so the correct option is never hidden.
- Mermaid diagrams in the AI generator: the loader injected an inline module script, which the CSP refused. It now loads the vendored build by URL.
- The tap ripple and the `focused-mobile` class in `public/js/utils/mobile-enhancements.js` never applied, because both tested `this.isMobile`, which nothing set. They are gated on `isPhone()`. Enter or Space on a quiz option no longer runs the ripple code against the document.
- `.env.docker`: the `MANIM_RENDER_TIMEOUT` example was `120`, read as milliseconds (0.12 s). It is now `120000`. The compose files still do not forward the variable to the container.
- `k8s/cleanup.sh --delete-data` deletes the PVCs the manifest declares (`quizix-quizzes`, `quizix-results`, `quizix-uploads`). Before, it used `-pvc` names and deleted nothing.
- `prepare-prod.sh` reads the `BUILD_STAMP` fallback from `public/sw.js`, not a `CACHE_VERSION` line that no longer exists.
- `docker-build.sh deploy` and `test` probe `/health` with `node` inside the container. Before, they ran `curl`, which neither image installs. Not run against Docker.
- Folder passwords now work for users other than the quiz's owner. Since 81ad42c, quizzes inside a password-protected folder were hidden from listings and returned 403 to everyone but their owner, so the unlock flow from 05d92bf could not be reached; ownerless quizzes there were hidden from everyone. They are now listed and marked protected (including under a protected ancestor folder), and loading one needs the unlock token. Private quizzes of other users stay hidden, token or not.
- After saving, the file browser reloads its tree even when the follow-up metadata request fails.
- `checkManimStatus()` now cancels the body of a non-OK response. The unread body kept the landing page from reaching network idle, so `bootLanding` waited out its 5 s cap on every boot (776b9fa).
- PPTX upload returned 500 for every file: `routes/file-uploads.js` called `officeparser.parseOfficeAsync`, which officeparser 6.x does not export. The route now uses `extractPptxText` (jszip): slides in numeric order, one paragraph per line, XML entities decoded, 400 with `error_pptx_extraction_failed` for files that are not PPTX or whose slide XML decompresses past 5 MB per slide or 20 MB in total. Parsing is linear in the slide size.
- `.ppt` removed from the AI generator file picker; no extractor ever parsed it.
- Consensus mode: End Round now locks consensus first, so the round's team score is awarded. Natural timeout and the all-answered path are unchanged, and a locked round is not awarded twice.
- Player auto-rejoin after a socket reconnect: `_attemptRejoin` called `socket.connect()` while the manager `reconnect` event had already opened the engine, which sent a second CONNECT packet and closed the transport. It now waits for `connect` and calls `connect()` only from the Rejoin button path.
- The End Round button shows `ending_round` while disabled instead of `waiting_for_results`; the key exists in all 9 locales.
- Quick-start panel no longer reads the never-saved `powerUpsEnabled` setting; the power-ups checkbox is reset to unchecked on each quiz selection.
- `multiple_correct` label shortened to "Multi-Select" (en) with short forms in the other 8 locales, so it no longer ellipsises on 390px phones. `index.html` option text updated to match.

### Changed
- Consensus mode is labelled experimental in all nine languages and in the README.
- The POST /api/save-quiz handler is in routes/quiz-management.js (createSaveQuizHandler) and is covered by unit tests; server.js mounts it.
- Docs/API_REFERENCE.md documents the unlock-token rules for quiz overwrite, metadata changes, folder move and folder delete, and the parent-folder ownership rule.
- Removed the unread `MAX_UPLOAD_SIZE` entries in `config/limits.js`. Image uploads stay capped at 5 MB with and without `MOBILE_MODE` (`CONFIG.LIMITS.MAX_FILE_SIZE` in `server.js`).
- Removed the unreachable flat quiz list fallback `showFlatListView`, the hidden `#quiz-list` element and four translation keys in all 9 locales. Its CSS selectors remain.
- The last "QuizMaster Pro" strings (`debug/ui-screenshot-tool.js`, a test fixture) use the Quizix name.
- `docker-compose.server.yml` and `k8s/02-quizix-ingress.yaml` comments corrected (stale line reference; Option 2 path now `/quizix(/|$)(.*)`).
- Removed dead CSS: about 2,370 lines and 366 selectors with no reference in HTML, JS or server code (keyboard-shortcuts modal, user manual, old connection indicator, font-size buttons, `.fs-*` utilities, preview carousel and device toggle, lobby and mobile-header leftovers), plus 10 keyframes and 4 CSS variables left unused. Classes built at runtime (`toast-${type}`, `qs-glyph--${glyph}`, `qr-size-${n}`, `hljs-*`) are kept.
- Removed 286 unused translation keys from all 9 locales (1414 -> 1128 each). Keys built at runtime (`question_type_*`, `compare_improving/declining/stable`) are kept.
- Removed unused exports `closeAuthModal`, `createQuestionCounter`, `validateQuery` and five param schemas, and the opt-in `/api/stats/memory` endpoint, which nothing called or documented. `/debug/config`, `/api/debug/files` and `/api/debug/directory` stay, since DEPLOYMENT.md documents them.
- Removed the unused outbound socket schemas `game-created`, `player-joined`, `answer-result`, `question-end` and `game-end` from `services/validation-schemas.js`. `validateSocketEvent` stays, since `validateAndHandle` uses it.
- Added a comment in `public/index.html` marking the hidden `.quiz-settings` block as live (mirrored from `#quiz-settings-modal`, read by `settings-persistence.js`, `app.js` and `statistics-manager.js`).
- `package-lock.json` also moved dev dependencies (@babel 7.29, postcss 8.5.28, js-yaml 4.3.2, others). The rebuilt CSS bundle drops `-webkit-print-color-adjust` and `-webkit-mask-image` prefixes.

### Tests
- `tests/unit/rejoin-same-player.test.js` (leave and rejoin, grace expiry, name reservation, no token in payloads or results, player cap, rematch lobby) and `tests/unit/join-answered-by-rejoin.dom.test.js`. `npm test`: 98 suites, 1554 tests pass.
- After the 2026-11-12 bug-hunt fixes: `npm test` 96 suites, 1537 tests pass; `npx eslint .` 0 errors; offline, service worker, console and analytics Playwright specs 11/11; visual suite 6/7 in a clean checkout, where `load-quiz modal - desktop chrome` fails because its screenshot depends on the number of quizzes on disk.
- Added `tests/unit/end-round-consensus-lock.test.js` (5 cases) and `tests/unit/pptx-extraction.test.js` (6 cases, in process, including a deflated 30 MB slide and 40k unclosed tags) and `tests/unit/pdf-extraction.test.js` (6 cases, child process because pdfjs-dist is ESM-only). `npm test`: 74 suites, 1297 tests pass.
- `tests/e2e-disconnect-overlay.spec.js` corrected to start the game before disconnecting; 4/4 pass on a clean port, 12/12 with `--repeat-each 3`. With the rejoin fix disabled, the auto-rejoin case failed 4/4.
- `tests/e2e/analytics-modal.spec.js`: 4/4 pass.
- Visual baselines: both snapshot directories regenerated (45 + 7 PNGs). `visual-regression.spec.js` fixture sets `manualAdvancement: false`; `visual-static.spec.js` caps the `networkidle` wait at 5 s. `npm run test:visual` passes 7/7. The three final-screen baselines are fully masked by the confetti mask and compare nothing.
- Unit suite: 73 suites, 1286 tests pass. `npx eslint .`: 0 errors, 287 warnings.

### Documentation
- Audited against the code: README, root and `public/css` CLAUDE.md, DEPLOYMENT, DOCKER, DOCKER-STANDALONE, K8S quick reference, `k8s/*.md`, `public/sounds/README.md`, `tools/luna-e2e/README.md` and every file in `docs/` except `CAPACITY.md` (measurements kept as recorded) and `STATUSLINE-SETUP.md`. Not audited: `docs/archive`, `docs/superpowers`, `design_handoff_landing`, `tests/agentic/flows`. Corrected file paths, line references, function names, npm scripts, limits and counts.
- `docs/API_REFERENCE.md`: added accounts, folders, metadata, debug, Gemini, Ollama, extraction and Manim routes; documented auth, rate limits and status codes per route; rewrote the Socket.IO event list, most of whose event names did not exist in the code.
- `DEPLOYMENT.md`: new section on running behind a reverse proxy or Cloudflare Tunnel (`NODE_ENV`, `BASE_PATH=/`, `PUBLIC_ORIGIN`, `ALLOWED_ORIGINS`, `TRUSTED_PROXY_IPS`). Docker and Kubernetes docs corrected against the Dockerfiles, compose files and `k8s/` manifests.
- `docs/FUTURE.md`: the tunnel exposure audit records all four items as fixed: 1 (client IPs) and 3 (AI rate limits and server key) earlier, 2 (`/api/active-games`) and 4 (ownerless quiz deletion) by the Security entries above. Roadmap phases carry dated status notes.
- `docs/SCORING_SYSTEM.md`: the time bonus decays over the question's time limit (a419083), not a fixed 10 s; examples recomputed. Poll and consensus scoring added.
- README: Node 22.13.0 or later (`engines`), the full environment-variable table, AI key precedence, and what anonymous clients behind a tunnel can and cannot do.
- `.env.example`: a key sent with the request is used in preference to the server key, not the reverse.
- README: the two screenshots, taken on an older Spanish-language UI, are replaced by three of the current UI in English (host lobby, host question, player phone), stored in `docs/images`. The old files in `public/images` were referenced only by the README and are removed.

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
