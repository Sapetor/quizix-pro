# TODO — Follow-up Work

Tracking list for issues found but deliberately not fixed in the session that
discovered them. Each item says what was observed, why it matters, and where
to start. Remove items when done.

_Last updated: 2026-08-04 (manual-advancement session; see the last
section). Previously: 2026-07-26 (multi-agent TODO sweep). All items from the
2026-07-26 visual-gate rework list were completed in that sweep: host
correct-answer reveal, counting-phase answered-count strip, double-modal
flash, 5.5s reveal window, End Round hardening (latch, rate-limit routing,
post-end answer rejection, host mid-question rejoin, ordering reveal),
editor design pass, mobile selects, upload-GC dotfile guard, theme-drift
gotcha (now docs/GOTCHAS.md #17). Items below are the residue plus new
findings from that sweep._

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
- [ ] **Dead payload fields**: `earlyEnd: true` (question-flow-service) has no
  client consumer; `explanationVideo` is sent on the timeout path but not the
  early-end path — also unconsumed. Remove both or make paths match before
  something starts reading them.
- [ ] **Dead validation plumbing**: `services/validation-schemas.js` has a
  `question-start` outbound schema matching no real emitter, and
  `validateSocketEvent` has zero callers. Delete or wire up.

## Pre-existing issues surfaced (not introduced) by the sweep

- [ ] **Result modal covers the leaderboard when a question has an
  explanation** — `displayDuration` is 0 in that case so the modal stays up
  until the next question. Unchanged by the new 5.5s reveal window (which
  otherwise fixed the overlap for plain questions).
- [ ] **Practice mode never shows the submission confirmation** — nothing on
  the practice event bus listens for `answer-submitted`. Harmless now that
  the confirmation is deferred anyway; delete the practice-side emit or wire
  the listener.
- [ ] **`variables.css` global font-scale table (~lines 505–600) should be
  retired in its own pass.** It is a block of `!important` font-sizes keyed
  on generic selectors (`.quiz-editor-section label`,
  `.preview-content-split *`, …) that silently overrides component styles;
  every new consumer must counter it with its own `!important` +
  `calc(… * var(--global-font-scale))` to keep the A/A+/A++ accessibility
  toggle working. The editor design pass hit this three times.
- [ ] **`#end-round-btn` recolors on hover while disabled** — the
  `.danger:hover` rule lacks `:not(:disabled)`. Cosmetic.

## From the 2026-08-04 manual-advancement session

Manual question advancement became the default that session (`services/game.js`
resolves `quiz.manualAdvancement ?? true`; the three checkboxes ship `checked`;
`restoreSettings` and the Quick Start loader default to `true`). An explicit
`false` remains an opt-out. What follows was found but deliberately not fixed.

- [ ] **Players never reach `#player-final-screen` at game end.** Two
  independent reproductions, both red on `main` before that session and
  unrelated to advancement:
  `tests/e2e-disconnect-stats.spec.js` → "Disconnected player stats preserved
  in final leaderboard", and `tests/e2e-disconnect-reconnect.spec.js` →
  "reconnect to finished game — receives correct final score". The second only
  became reachable once the helper bugs below were fixed.
  The host side is fine — the final leaderboard renders with every player
  including the disconnected one, so the feature under test works; only the
  *player* screen transition is missing.
  Traced so far, no smoking gun: `GameSessionService.endGame` emits `game-end`
  per player socket id, skipping only `player.disconnected`; the client
  `game-end` handler in `socket-manager.js` calls `showFinalResults`
  unconditionally; `LeaderboardManager.showPlayerFinalScreen` has no early
  return. The two remaining suspects are the `fanfarePlayed` latch at the top
  of `LeaderboardManager.showFinalResults` (it returns early, *before* the
  screen switch, if it ever fired once) and whether `io.to(playerId)` still
  resolves for those sockets. Next step is an instrumented run that records
  whether the connected player's socket actually receives `game-end` — a
  `socket.onAny` recorder on the player page is enough to split
  "never delivered" from "delivered but swallowed".

- [ ] **Duplicate keys in every locale file.** Object literals silently keep
  the last definition, so one of each pair is dead code. `en/fr/it/pt` have 2
  (`error_rate_limited`, `error_auth_required`); `es/de/ja/pl/zh` have those
  plus 9 `export_*` keys (`export_avg_participants`, `export_declining`,
  `export_improving`, `export_question_num_header`,
  `export_question_text_header`, `export_question_trends`,
  `export_session_details`, `export_session_label`, `export_stable`).
  Predates all of this. Check which of each pair currently wins before
  deleting — the survivor is the one users see.
  Find them with:
  `grep -oP '^\s{4}\K[a-z0-9_]+(?=:)' <file> | sort | uniq -d`

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
- **Reconnect data lives in `sessionStorage`**, not `localStorage`
  (`socket-manager.js`). It is written on the `player-joined` event, which can
  trail the lobby transition — poll for it rather than reading once.
