# TODO — Follow-up Work

Tracking list for issues found but deliberately not fixed in the session that
discovered them. Each item says what was observed, why it matters, and where
to start. Remove items when done.

_Last updated: 2026-10-09 (pending-review fix session; see the first
section). Previously: 2026-08-06 (six-fix multi-agent session), 2026-08-04 (manual-advancement session), 2026-07-26
(multi-agent TODO sweep). All items from the
2026-07-26 visual-gate rework list were completed in that sweep: host
correct-answer reveal, counting-phase answered-count strip, double-modal
flash, 5.5s reveal window, End Round hardening (latch, rate-limit routing,
post-end answer rejection, host mid-question rejoin, ordering reveal),
editor design pass, mobile selects, upload-GC dotfile guard, theme-drift
gotcha (now docs/GOTCHAS.md #17). Items below are the residue plus new
findings from that sweep._

## From the 2026-10-02 pending-review session

Open items from the dependency, baseline and rejoin work. Items completed in
the same session are struck through in the sections below.

- [x] ~~**Decide the officeparser version.**~~ DONE 2026-10-09: officeparser
  removed. `routes/file-uploads.js` reads slide text with jszip
  (`extractPptxText`), which drops pdfjs-dist (GHSA-hq66-cqwq-w95j),
  tesseract.js and file-type from the tree (about 88 MB). `.ppt` is no longer
  offered in the file picker; officeparser never parsed it.
  `tests/unit/pptx-extraction.test.js` covers slide order past 10, entity
  decoding and non-PPTX input (400). `npm audit --omit=dev` now reports 3
  moderate: sprintf-js through argparse through mammoth. Accepted: only
  mammoth's CLI (`node_modules/mammoth/bin/mammoth`) requires argparse; the
  server uses the library API.
- [x] ~~**`package-lock.json` changed beyond the audited production packages.**~~
  DONE 2026-10-09: dev-dependency movement kept (@babel/* 7.29, postcss
  8.5.28, js-yaml 4.3.2, others). `npm run build` was rerun; the only CSS
  change is autoprefixer dropping `-webkit-print-color-adjust` and
  `-webkit-mask-image` prefixes (unprefixed since Safari 15.4). sharp 0.35 and
  uuid 11 kept; unit tests pass.
- [ ] **Landing page never reaches `networkidle`.** Chromium reports
  `responseReceived` (401) and `dataReceived` for `GET /api/manim/status`
  (`public/js/quiz/manim-editor.js:29`) but no `loadingFinished`, while curl
  gets the response in 2 ms. A standalone fetch of the same URL finishes. Cause
  not found. `bootLanding` in `tests/e2e/visual-static.spec.js` now caps that
  wait at 5 s, which avoids the 120 s hang without explaining it.
  2026-10-12: the 2026-10-09 stall (all 5 `visual-static.spec.js` tests time
  out, `page.goto('/')` never fires `load`) is environmental, not an app bug.
  `~/.bashrc` exports `DISPLAY=<windows-host-ip>:0.0` for an X server that is
  not running. With that value, headless Chromium 143 (Playwright 1.57)
  hangs; which Chromium component waits on the display is not identified.
  Any `<video>` that preloads never finishes loading (it holds the
  `load` event and the deferred scripts behind it), and the renderer produces
  no frames, so `requestAnimationFrame` and screenshots hang even on a blank
  page. With `DISPLAY` unset or set to WSLg's `:0`, all 5 pass against the
  existing baselines (`env -u DISPLAY PW_PORT=... npx playwright test
  tests/e2e/visual-static.spec.js`). Not yet checked whether the
  `/api/manim/status` hang above has the same cause.
- [ ] **Final-screen visual baselines compare nothing.** `desktop-final-host`,
  `desktop-final-player` and `mobile-final-player` are fully magenta because
  the `body > canvas` confetti mask covers the whole screen. The HEAD baseline
  for `desktop-final-host` was already like this. Mask only the canvas region
  that is not covered by content, or stop the confetti before the capture.
- [ ] **Review the regenerated baselines.** Both snapshot directories were
  deleted and regenerated (45 + 7 PNGs); `npm run test:visual` passes 7/7
  without `--update-snapshots`. Only 8 of the 52 PNGs were opened. No phone
  editor baseline exists in either spec.
- [ ] **Bump `CACHE_VERSION` in `public/sw.js` on deploy.** `socket-manager.js`
  changed (rejoin fix). Not bumped here; the value comes from a
  server-replaced placeholder.
- [ ] **Lobby disconnect removes the player immediately.** A player who loses
  the connection in the lobby cannot rejoin (`rejoin-failed`), and the host
  gets no `host-disconnected` broadcast in the lobby. The reconnection overlay
  still appears for that player. Design decision: either accept it and skip
  the overlay in the lobby, or add a grace period.
- [ ] **Coverage gaps for the End Round work.** Unit tests cover the consensus
  lock (`tests/unit/end-round-consensus-lock.test.js`, 5 cases). No e2e test
  checks the End Round label (`ending_round`) or the consensus award in a
  browser. The fail-first run for the `all-answered` case was not executed:
  removing the `trigger === 'host'` guard was blocked by the permission
  classifier, so that case was reasoned, not shown.
- [ ] **`.quiz-settings` legacy inline styles remain.** The block now has a
  comment marking it hidden but live. Some inline styles (for example the
  `global-time-container` `display: none`) may be toggled by JS; no audit of
  JS reads of those styles was done.
- [ ] **Deferred from commit fc2ff1c: "the six-option ceiling" and the i18n
  batch.** The commit message lists both as deferred without defining either.
  The ceiling is presumably the six-option limit on answer choices (A to F),
  but the code location and intended change are not recorded. Define the item
  or drop it. The i18n batch is not specified either.

## From the 2026-08-06 six-fix session

- [x] ~~**`powerUpsEnabled` is read from saved quiz settings but never written.**~~
  DONE 2026-10-02 (decision: drop the dead read). `app.js` no longer reads
  `settings.powerUpsEnabled` or the legacy top-level fallback; it calls
  `setChecked('qs-enable-power-ups', false)` so the quick-start checkbox does
  not keep the previous quiz's state. Live-game power-up paths are unchanged.
- [ ] **Stale-until-rerender content on in-game language switch** (deliberately
  left): host MC option letters, leaderboard rows, ordering stat rows keep the
  old language until the next render. Currently invisible — 'A'–'F' and 'pts'
  are identical in all 9 locales — but becomes real if any locale ever
  localizes those tokens. Hook exists (`languageChanged` CustomEvent,
  `translation-manager.js:302`); the blocker is that none of these keep stored
  state to re-render from.

## From the 2026-08-04 header/rematch/console session

- [x] ~~**`gamePin` is missing from `GameStateManager.getGameState()`**~~ FIXED
  2026-08-04. `socket-manager.js:146` gates the whole `disconnect` handler on
  `gameState.gamePin`, which was always `undefined`, so host reconnect data was
  never stored and the player reconnection overlay never shown — in every game.
  `getGameState()` now returns the field. NOTE this **activated a long-dead code
  path**: the disconnect handler now actually runs. The 8 disconnect/reconnect
  e2e tests pass against it, but they passed before the fix too (they exercise
  the socket-level rejoin, not this client bookkeeping), so the overlay and the
  `quizix_host_reconnect` sessionStorage write are still comparatively
  under-tested. Worth a manual host-disconnect check. 2026-10-02: partly
  addressed. `tests/e2e-disconnect-overlay.spec.js` now covers the host-waiting
  overlay, the player overlay and the auto-rejoin (4/4 on `PW_PORT=3210`, 12/12
  with `--repeat-each 3`), and `quizix_host_reconnect` is written and consumed in
  the host test. A manual host-disconnect check is still open.
- [x] **`#answer-options` carries both `visible-block` and `hidden`** during a
  rematch — the GOTCHAS #6 conflict, where both classes use `!important`.
  Writer traced: `GameDisplayManager.clearHostQuestionContent()` did a bare
  `classList.add('hidden')` on top of the `visible-block` left by
  `question-renderer.js` `show(hostOptionsContainer, 'visible-block')`. Now uses
  the `hide()` helper. Pinned by `tests/unit/answer-options-visibility.dom.test.js`.
- [x] ~~**Visual baselines are stale and may pass silently.**~~ DONE 2026-10-02
  — both snapshot directories were regenerated wholesale on `PW_PORT=3210`
  (GOTCHAS #17); `npm run test:visual` passes 7/7 without the update flag.
  Fixes needed on the way: `manualAdvancement: false` in the
  `visual-regression.spec.js` fixture, and a 5 s cap on the `networkidle`
  wait in `visual-static.spec.js`. Remaining gaps are listed in the
  2026-10-02 section (final screens, unviewed PNGs).
- [ ] **Mute-students label reportedly blanks after a rematch — NOT
  reproduced.** Four real rematch flows (auto-advance, mute-on-before-rematch,
  End Round forced, manual-advancement) with a `MutationObserver` on the button
  subtree showed the label always non-empty and `svgs=2` on every mutation.
  `setMuteStudentsState` (`ui/header-controller.js:62-81`) only ever writes
  `label.textContent = getTranslationSync(key) || fallback`, and
  `getTranslationSync` returns `''` only for a falsy key — so that path cannot
  blank it. To close this, need: the host's language at the time, whether the
  button was blank vs. showing the raw key `mute_all_students`, and whether the
  page had been hard-refreshed since 45c757b (which added the label span — a
  stale service-worker `index.html` would explain it).

## Polish / small fixes

- [x] ~~**Add an `ending_round` translation key** (all 9 language files)~~ DONE
  2026-10-02 — present in all 9 locales; the latched End Round button now uses
  it instead of `waiting_for_results`.

- [x] ~~**"Multiple Correct Answers" still ellipsises on 390px phones.**~~ DONE
  2026-10-02 — `multiple_correct` is now the short "Multi-Select" in en and
  has short forms in the other 8 locales; the `index.html` option text and the
  fallbacks in `question-utils.js` and `question-editing.js` match. The long
  label stays under `question_type_multiple_correct`.

- [x] ~~**Comment `index.html`'s hidden `.quiz-settings` block as load-bearing.**~~
  DONE 2026-10-02 — comment added above the block. Legacy inline styles inside
  it were left in place (see the 2026-10-02 section).

## End Round — remaining audit findings

From the 2026-07-26 audit; the severe ones were fixed in the sweep.

- [x] ~~**Consensus mode: End Round silently forfeits the round's team score**~~
  DONE 2026-10-02 (decision: auto-lock). `endQuestionEarly` in
  `services/question-flow-service.js` now calls `ConsensusFlowService.lockConsensus`
  when the host ends the round and consensus is not yet locked. Natural timeout
  and the all-answered path are unchanged; a second lock returns null, so no
  double award. Covered by `tests/unit/end-round-consensus-lock.test.js`.
- [x] ~~**No confirmation on End Round.**~~ CLOSED 2026-10-02 (decision: none).
  The click latch limits accidental damage, and consensus mode now locks
  instead of losing the score.
- [x] ~~**Dead payload fields**: `earlyEnd: true` (question-flow-service) has no
  client consumer; `explanationVideo` is sent on the timeout path but not the
  early-end path — also unconsumed.~~ REMOVED — both fields deleted from the
  `question-timeout` payloads; the two paths now agree.
- [x] ~~**Dead validation plumbing**: `services/validation-schemas.js` has a
  `question-start` outbound schema matching no real emitter, and
  `validateSocketEvent` has zero callers.~~ DONE — the `question-start`
  outbound schema is deleted, and so are the other unreachable server→client
  schemas (`game-created`, `player-joined`, `answer-result`, `question-end`,
  `game-end`); a repo grep finds no remaining reference to them.
  `validateSocketEvent` is NOT dead: it is the body of `validateAndHandle`,
  which every socket module uses; kept.

## Pre-existing issues surfaced (not introduced) by the sweep

- [x] ~~**Result modal covers the leaderboard when a question has an
  explanation** — `displayDuration` is 0 in that case so the modal stays up
  until the next question. Unchanged by the new 5.5s reveal window (which
  otherwise fixed the overlap for plain questions).~~ RESOLVED —
  `LeaderboardManager.showLeaderboard` now dismisses the feedback overlay
  before switching screens; the explanation still gets the full reveal
  window / manual-advance dwell, it just stops outliving it.
- [x] ~~**Practice mode never shows the submission confirmation** — nothing on
  the practice event bus listens for `answer-submitted`.~~ RESOLVED — the two
  dead `eventBus.emit('answer-submitted')` calls in `local-game-session.js`
  are deleted (the confirmation is deferred anyway).
- [ ] **`variables.css` global font-scale table (~lines 505–600) should be
  retired in its own pass.** It is a block of `!important` font-sizes keyed
  on generic selectors (`.quiz-editor-section label`,
  `.preview-content-split *`, …) that silently overrides component styles;
  every new consumer must counter it with its own `!important` +
  `calc(… * var(--global-font-scale))` to keep the A/A+/A++ accessibility
  toggle working. The editor design pass hit this three times.
- [x] ~~**`#end-round-btn` recolors on hover while disabled** — the
  `.danger:hover` rule lacks `:not(:disabled)`.~~ FIXED in
  `public/css/app-screens.css` (`#host-game-screen #end-round-btn.btn.danger`
  hover rule).

## From the 2026-08-04 manual-advancement session

Manual question advancement became the default that session (`services/game.js`
resolves `quiz.manualAdvancement ?? true`; the three checkboxes ship `checked`;
`restoreSettings` and the Quick Start loader default to `true`). An explicit
`false` remains an opt-out. What follows was found but deliberately not fixed.

- [x] ~~**Players never reach `#player-final-screen` at game end.**~~ RESOLVED
  2026-08-04: **not a product bug.** An instrumented run (`socket.onAny`
  recorder plus wrappers on `showScreen`/`showFinalResults`, fresh server on a
  free port) showed the connected player *does* receive `game-end`, that
  `fanfarePlayed` was `false` when it arrived, and that the switch to
  `player-final-screen` fired normally. Both named suspects — the
  `fanfarePlayed` latch and `io.to(playerId)` resolution — are ruled out by
  those traces.
  The two specs were mis-synchronized and timed out while the game was still
  running, from two bad wait predicates:
  - `waitForQuestionEnd` keyed on `#answer-statistics` not being `.hidden`, but
    that panel is *also* shown mid-question in **`counting-only`** mode as the
    live response counter (`statistics-manager.js:50-55`), so it resolved on
    the first answer. The identical trap was already fixed in
    `tests/e2e/visual-regression.spec.js:237-255`; the `e2e-disconnect-*` specs
    never got it.
  - "Wait for the game to finish" used `waitForScreen('leaderboard-screen')`,
    which the host shows after *every* question, so it resolved at the Q1→Q2
    interlude. In the reconnect spec that meant rejoining a still-live game.
  Fixed in `tests/e2e-disconnect-reconnect.spec.js` (predicate tightened, plus
  a new `waitForHostFinalResults` on `#final-results:not(.hidden)`) and
  `tests/e2e-disconnect-stats.spec.js`. Tests only; no product code changed.

- [x] ~~**Duplicate keys in every locale file.**~~ DONE 2026-08-08 — all 9
  files de-duplicated (71 lines); the surviving (last) definition was kept in
  every case, so runtime behavior is unchanged. Verified per file: same key
  set, zero value diffs vs. HEAD.
- [x] ~~**`error_rate_limited` / `error_auth_required` are untranslated English
  in all 8 non-English locales.** Surfaced by the dedup above: each locale had
  a properly localized auth-modal pair (e.g. es "Demasiados intentos…") that
  was *shadowed* by a later English server-message pair ("Too many requests.
  Please slow down." / "Authentication required") — so users have been seeing
  the English strings all along, and the localized values were dead code (now
  deleted). Fix by splitting the two use cases into distinct keys (e.g.
  `error_auth_rate_limited` vs `error_rate_limited`) and re-translating the
  server-message pair in the 8 locales.~~ DONE — the auth modal now uses
  `too_many_attempts`, and `error_rate_limited` / `error_auth_required` are
  translated in all 8 non-English locales.

### Testing gotchas that cost real time — read before running e2e

- **`PW_PORT=3010` silently reuses a stale server.** `playwright.config.js`
  sets `reuseExistingServer: !CI`, and port 3010 holds a long-lived
  `node server.js`. Server-side edits are then *not under test* and you will
  chase a phantom client bug. Use a port nothing owns (3011–3013 were free) so
  Playwright spawns a fresh server. Verify with `ps -o lstart -p <pid>` against
  the file mtime before believing a failure. The visual gate still needs
  `PW_PORT=3210`.
- **`waitForPlayerCount` over-counted** (fixed 2026-08-04 in the four
  `tests/e2e-*.spec.js` helpers, and earlier in `visual-regression.spec.js`).
  Each player renders as a `.player-item` wrapping `.player-avatar` and
  `.player-name`, so a `[class*="player"]` catch-all matched three nodes per
  player and the wait resolved after *one* had joined. The empty-state chip is
  a `.player-item` too. Correct selector:
  `.player-item:not(.placeholder), .player-card`.
- **`storageState` origins are per-origin.** Specs hardcoded
  `http://localhost:3000`, so under `PW_PORT` the seed was a no-op, the 8-step
  onboarding tour reappeared, and its overlay swallowed host clicks. Now
  `http://localhost:${process.env.PW_PORT || 3000}`.
- **`#answer-statistics` is NOT an end-of-question signal.** In `counting-only`
  mode it doubles as the live response counter during the question
  (`statistics-manager.js:50-55`), so "wait until it is not `.hidden`" resolves
  on the first submitted answer. Any such wait must also require
  `!classList.contains('counting-only')`. Likewise `leaderboard-screen` is shown
  after *every* question, so it cannot mean "the game is over" — wait on
  `#final-results:not(.hidden)` instead. Both cost a full session already.
- **Reconnect data lives in `sessionStorage`**, not `localStorage`
  (`socket-manager.js`). It is written on the `player-joined` event, which can
  trail the lobby transition — poll for it rather than reading once.
