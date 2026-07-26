# TODO — Follow-up Work

Tracking list for issues found but deliberately not fixed in the session that
discovered them. Each item says what was observed, why it matters, and where
to start. Remove items when done.

_Last updated: 2026-07-26 (visual-gate rework session)._

## Likely bugs / dead code (verify, then fix or delete)

- [ ] **Host correct-answer highlight is a dead code path.**
  `answer-reveal-manager.js` `highlightCorrectAnswers()` queries
  `.host-option`, but the reskinned host screen renders `.option-display`
  tiles (see `statistics-manager.js`, which correctly mirrors onto
  `.option-display[data-option]`). So the `correct-answer-highlight` class is
  never applied on the host for MC/TF/multi-correct, and the CSS for
  `#host-game-screen .option-display.correct` (ink inset ring,
  `app-screens.css` ~790) has no JS that triggers it. The only reveal
  emphasis a teacher sees today comes from the `data-pct` share styling.
  Also: the TF branch checks `questionType === 'true_false'` while the server
  sends `'true-false'`, so TF falls through to the MC branch. Decide the
  intended reveal design, then either wire `.correct` onto the tiles or
  delete the dead path + CSS.

- [ ] **`#answer-statistics` reserves ~88px of empty space during questions.**
  During the question phase the container is shown in `counting-only` mode but
  everything inside it is display:none'd by the editorial skin
  (`app-screens.css`), so it renders as a blank 88px band above the options.
  Either collapse it in counting-only mode or show something useful (e.g. the
  live "N of M answered" count — see next item).

- [ ] **`#responses-count` / `#total-players` update but are never visible.**
  `statistics-manager.js` writes live counts into elements that are hidden on
  the host game screen (`offsetParent === null` throughout a round). The host
  currently has no visible "how many have answered" indicator during a
  question — worth confirming intent; for a teacher mid-class this is core
  information. If a header chip is meant to carry it (`#host-header-total`),
  check it actually renders.

## UX questions from observing the real game flow

- [ ] **Double modal flash on the player after answering.** Click →
  "Answer submitted" modal (~1s, random emoji from
  `modal-feedback.js` `submissionIcons`) → immediately replaced by the result
  modal when the round ends. With few players the round ends instantly, so
  players see two modals back-to-back within ~1.5s. Consider skipping the
  submission modal when the result is imminent, or merging the states.
  The random emoji also makes UI states nondeterministic (it forced the
  visual suite to avoid capturing that modal).

- [ ] **Reveal window is only ~3s in auto-advance mode.** Round end →
  leaderboard is a fixed `advanceTimer` (`game-session-service.js`
  `advanceToNextQuestion`). Three seconds is tight for a teacher to discuss
  the distribution/correct answer with a class. Manual advancement exists as
  a setting; consider whether the auto-advance default should pause longer on
  the reveal, or surface the manual mode more prominently.

- [ ] **"End Round" button visibility.** The header End Round pill stays
  visible during the question (fine) — verify it does something sensible /
  disappears cleanly in every phase, incl. numeric and ordering rounds.

## Editor (deferred from 2026-07-25 session)

- [ ] **Editor design pass** (explicitly deferred by user decision):
  consolidate the triple question chrome ("Question 1 of 2" nav bar /
  "Question 1" card header / "QUESTION 1 OF 2" preview kicker), rework the
  settings block layout, make the preview panel earn its width, carry the
  Buzzer design language through the editor screen.

- [ ] **Mobile editor selects truncate** ("Multi…", "Medi…") — the
  type/difficulty selects are too narrow for their labels on phones.
  Pre-existing; visible in `editor-mobile` baseline.

## Test / infra hygiene

- [ ] **Visual gate can't detect subtle full-field theme drift.** Measured:
  the old-beige → current-grey background shift is ~0.025 normalized luma,
  far below any per-pixel threshold that would stay flake-free. After any
  reskin, regenerate baselines wholesale (`rm` snapshot dirs + two runs);
  don't trust a green gate as proof baselines are current. Documented in
  the spec headers and memory; consider a periodic "regen and eyeball" step
  in release checklists.

- [ ] **`.gitkeep` under `public/uploads/` keeps getting deleted** by
  something at runtime (turned up deleted at session start on 2026-07-25).
  Find what removes it (upload cleanup sweep?) and make that code skip
  dotfiles.
