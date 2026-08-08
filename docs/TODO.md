# TODO — Follow-up Work

Tracking list for issues found but deliberately not fixed in the session that
discovered them. Each item says what was observed, why it matters, and where
to start. Remove items when done.

_Last updated: 2026-08-06 (six-fix multi-agent session; see the first
section). Previously: 2026-08-04 (manual-advancement session), 2026-07-26
(multi-agent TODO sweep). All items from the
2026-07-26 visual-gate rework list were completed in that sweep: host
correct-answer reveal, counting-phase answered-count strip, double-modal
flash, 5.5s reveal window, End Round hardening (latch, rate-limit routing,
post-end answer rejection, host mid-question rejoin, ordering reveal),
editor design pass, mobile selects, upload-GC dotfile guard, theme-drift
gotcha (now docs/GOTCHAS.md #17). Items below are the residue plus new
findings from that sweep._

## From the 2026-08-06 six-fix session

- [ ] **`powerUpsEnabled` is read from saved quiz settings but never written.**
  `app.js:1208` populates the quick-start panel from `settings.powerUpsEnabled`
  (with a legacy top-level fallback), but `collectSettings()` in
  `public/js/quiz/modules/settings-persistence.js` never collects it, so the
  editor's power-ups choice does not persist per-quiz through `/api/save-quiz`.
  Not stripped data — never sent. Decision needed: persist it (add to
  `collectSettings()`/`restoreSettings()` + `quizSettingsSchema`, mirroring
  `showLeaderboardBetweenQuestions`) or drop the dead read in quick-start.
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
  under-tested. Worth a manual host-disconnect check.
- [x] **`#answer-options` carries both `visible-block` and `hidden`** during a
  rematch — the GOTCHAS #6 conflict, where both classes use `!important`.
  Writer traced: `GameDisplayManager.clearHostQuestionContent()` did a bare
  `classList.add('hidden')` on top of the `visible-block` left by
  `question-renderer.js` `show(hostOptionsContainer, 'visible-block')`. Now uses
  the `hide()` helper. Pinned by `tests/unit/answer-options-visibility.dom.test.js`.
- [ ] **Visual baselines are stale and may pass silently.**
  `desktop-*-question-host-*.png` predate both the always-visible header
  (fde3559) and the removal of `#game-mute-students-btn`. The mute-button delta
  alone is ~0.6% of a 1280x720 viewport, under the spec's
  `maxDiffPixelRatio: 0.02`, so the gate can go green on a stale baseline.
  Regenerate wholesale with `PW_PORT=3210` (GOTCHAS #17).
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

- [ ] **Add an `ending_round` translation key** (all 9 language files) and use
  it for the latched End Round button label. The latch currently reuses
  `waiting_for_results` ("Waiting for results…") because inventing a missing
  key would render the raw key string. Accurate but wordy.

- [ ] **"Multiple Correct Answers" still ellipsises on 390px phones**
  ("Multiple Correct Answe…"). The other type/difficulty labels now fit after
  the selects got their own grid row + 16px font. No layout fits the full
  195px label at 390px across all 9 locales — needs either a shorter label
  ("Multi-Select"?) or acceptance.

- [ ] **Comment `index.html`'s hidden `.quiz-settings` block as load-bearing.**
  It is `display:none` at every breakpoint yet is the settings *model*:
  `#quiz-settings-modal` mirrors into it and `settings-persistence.js` /
  `app.js` / `statistics-manager.js` read from it. It still carries dead
  legacy inline styles. A comment marking it "hidden but live — do not
  delete" is cheap insurance against the next cleanup pass breaking settings.

## End Round — remaining audit findings

From the 2026-07-26 audit; the severe ones were fixed in the sweep.

- [ ] **Consensus mode: End Round silently forfeits the round's team score**
  — `endQuestionEarly` never calls `lockConsensus`, so `teamPoints` are never
  awarded. Consistent with natural timeout, but the button sits next to
  "Lock Consensus" with no warning. Decide: warn, auto-lock, or accept.
- [ ] **No confirmation on End Round**, while the adjacent "End game"
  (`#stop-quiz-btn`) has one. The new click-latch reduces accidental damage;
  decide whether a confirm is still wanted.
- [x] ~~**Dead payload fields**: `earlyEnd: true` (question-flow-service) has no
  client consumer; `explanationVideo` is sent on the timeout path but not the
  early-end path — also unconsumed.~~ REMOVED — both fields deleted from the
  `question-timeout` payloads; the two paths now agree.
- [x] ~~**Dead validation plumbing**: `services/validation-schemas.js` has a
  `question-start` outbound schema matching no real emitter, and
  `validateSocketEvent` has zero callers.~~ PARTLY DONE — the `question-start`
  outbound schema is deleted. `validateSocketEvent` is NOT dead: it is the
  body of `validateAndHandle`, which every socket module uses; kept. The other
  server→client schemas (`game-created`, `player-joined`, `answer-result`,
  `question-end`, `game-end`) are equally unreachable and still there.

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
- [ ] **`error_rate_limited` / `error_auth_required` are untranslated English
  in all 8 non-English locales.** Surfaced by the dedup above: each locale had
  a properly localized auth-modal pair (e.g. es "Demasiados intentos…") that
  was *shadowed* by a later English server-message pair ("Too many requests.
  Please slow down." / "Authentication required") — so users have been seeing
  the English strings all along, and the localized values were dead code (now
  deleted). Fix by splitting the two use cases into distinct keys (e.g.
  `error_auth_rate_limited` vs `error_rate_limited`) and re-translating the
  server-message pair in the 8 locales.

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
