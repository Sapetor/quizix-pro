# TODO — Follow-up Work

Tracking list for issues found but deliberately not fixed in the session that
discovered them. Each item says what was observed, why it matters, and where
to start. Remove items when done.

_Last updated: 2026-07-26 (multi-agent TODO sweep). All items from the
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
