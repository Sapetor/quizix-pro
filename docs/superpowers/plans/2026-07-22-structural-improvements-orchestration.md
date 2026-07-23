# Structural Improvements — Orchestration Plan (2026-07-22)

Source: four-agent repo exploration (backend, frontend JS, CSS/UI/build, tests/docs/tooling)
run on branch `ui/editorial-polish-and-quiz-list`. Quick wins (SW cache-busting,
CI test gate, atomic writes, upload rate limit, git hygiene, naming/node-bump)
were executed separately on 2026-07-22 and are NOT part of this plan.

Execution model: each phase below is one orchestration run (Workflow or parallel
agents), with a verify gate before the next phase starts. Phases are ordered by
dependency: tests land BEFORE the refactors they protect.

---

## Phase 1 — Scoring consolidation (correctness, contained) — M

The highest value-per-effort item. Scoring logic is forked in both tiers.

Server-side (authoritative path, dedup onto `services/scoring-service.js`):
- `services/game.js:456-486` `calculateConsensusResult` duplicates
  `ScoringService.calculateConsensusTeamPoints` + `getConsensusBonus`
  (`scoring-service.js:186-212`).
- `services/game.js:536-553` `getCorrectAnswerKey` duplicates
  `ScoringService.getCorrectAnswerKey` (`scoring-service.js:163-179`).
- `services/game.js:688-706` `getScoringInfoForQuestion` re-derives the
  difficulty-multiplier fallback owned by `getDifficultyMultiplier` (`:151-155`).

Client-side:
- `public/js/practice/local-game-session.js:341-409` `calculatePoints()`
  re-implements the server formula ("matches server formula exactly").
- Scoring-config object (`timeBonusEnabled`/`timeBonusThreshold`/
  `difficultyMultipliers`) hand-copied in 4 places: `core/app.js:610-619`,
  `core/app.js:1236-1244`, `practice/practice-mode-manager.js:74-84`,
  `quiz/quiz-manager.js:246-256`. Default multipliers (1/2/3) hardcoded in each.
- `utils/results-viewer/results-analytics.js:56-80,227-262` reconstructs
  scores heuristically — audit whether it can consume stored authoritative data
  instead.

Orchestration shape:
1. Agent A (tests-first): characterization tests pinning current outputs of all
   server forks against `ScoringService` (extend the existing 1,912-line
   `tests/unit/scoring-service.test.js` style). Must fail-first where behavior
   diverges — any divergence found is a BUG REPORT, not something to preserve.
2. Agent B (server dedup): replace the three `game.js` forks with service calls.
3. Agent C (client): extract one `collectScoringConfig()` helper + one shared
   point-formula module; practice mode imports it. Consider serving the formula
   constants from the server config endpoint to kill the "matches exactly"
   comment class permanently.
4. Verify gate: full `npm test`, plus a scripted parity check (same inputs →
   server ScoringService vs client module → identical outputs).

## Phase 2 — Dead socket-handler audit (small, do with Phase 1) — S

Client `socket-manager.js` registers handlers for events the server never emits:
`force-disconnect`, `game-not-found`, `invalid-pin`, `name-taken`,
`player-limit-reached`, `rate-limited`, `session-game-started`.
Server signals failures via generic `error`/`rejoin-failed` instead.

Per event: decide dead-code-delete vs reconnect (is a user-facing error
currently never shown?). `invalid-pin` / `name-taken` / `player-limit-reached`
look like UX regressions if the generic `error` path lacks specific messaging —
verify what players actually see on each failure before deleting.

Also route `socket/player-events.js:39-72` (`player-change-name`) through
`validateAndHandle` + a schema like every other player event (XSS-relevant:
names render on host/player screens).

## Phase 3 — Test infrastructure for the riskiest paths — L

Prerequisite for Phases 4-5. Current state: `jest.config.js`
`collectCoverageFrom` covers only `services/**`; threshold 20%.

Targets (all currently zero tests):
- `socket/` handlers (`game-events.js`, `gameplay-events.js`,
  `player-events.js`, `consensus-events.js`) — use socket.io-mock or the
  in-memory pattern; test the validation + state-transition behavior, not I/O.
- `services/game.js`, `services/game-session-service.js` (core game loop).
- Frontend gotcha modules: `player-interaction-manager.js`,
  `game-state-manager.js`, screen-transition flows
  (`resetAndReturnToMenu` → cleared DOM invariants), `utils/api-helper.js`.
- Translation key-set parity test: assert all 10 locales in
  `public/js/utils/translations/` share the same key set (S, cheap, catches
  real drift).
- Housekeeping: resolve the two quarantined files in
  `jest.config.js` `testPathIgnorePatterns` (`tests/code-review-fixes.test.js`,
  `tests/mobile-quiz-editor-light-mode.spec.js`) — run or delete.
- Widen `collectCoverageFrom` to include `socket/`; raise threshold as coverage
  lands (don't set aspirational numbers up front).

Orchestration shape: one agent per target module family, parallel, each
delivering green tests; a final agent wires coverage config.

## Phase 4 — CSS theme-replacement refactor — L

Blocked on nothing, but safest after Phase 3's frontend transition tests exist.
Root cause to fix: editorial theme layered ON TOP of legacy theme via
`!important` instead of replacing it. Evidence: 1,486 `!important` in source
(727 in `responsive.css`, 205 `game.css`, 187 `components.css`);
`app-screens.css:1051-1054` admits it "neutralizes the legacy glass + indigo
chrome"; dark-mode `:not([data-theme="light"])` selectors force every mobile
rule to escalate specificity (documented in `public/css/CLAUDE.md`).

Work items, in order:
1. Inventory: which legacy rules are fully shadowed by editorial overrides
   (safe to delete) vs still live in scoring/manim-ai/preview panes.
2. Introduce `@layer` ordering (legacy → editorial → utilities) so overrides
   stop needing `!important`; strip `!important` mechanically layer by layer.
3. Kill the dual palette in `variables.css` (809 lines).
4. One canonical visibility toggle helper in JS; forbid `hidden` +
   `visible-flex` coexisting (243 toggle sites in `public/js/`). Consider a
   lint/grep CI check.
5. Consolidate mobile-editor active-question state: `.active-question`
   (`responsive.css:3217`) vs `.mobile-question-active` (`responsive.css:894`)
   → one class.
6. Split `components.css` (7,744 lines) by concern; move its 21 embedded
   `@media` blocks.
7. Rebuild bundle (`npm run build`), bump SW version, visual regression pass
   (Playwright `npm run test:visual` exists — use it as the gate).

Success metric: `!important` count in source CSS drops by an order of
magnitude; bundle size (448 KB) shrinks measurably.

## Phase 5 — God-object decomposition — L

After Phases 1-3 (scoring extraction thins these files; tests protect the moves).
- `quiz/quiz-manager.js` (2,134 lines): split settings-persistence /
  question-editing / import-export.
- `game/game-manager.js` (1,960 lines): extract statistics block
  (`:835-1289`, ~15 methods) and timer block (`:1435-1481`) into
  `game/modules/` (pattern already established there).
- `core/app.js` (1,645 lines): thin to composition root; its settings
  serialize/restore duplication dies in Phase 1.
- `utils/globals.js` (963 lines of `window.game?.*` delegation): migrate
  inline-onclick bridges to real event listeners incrementally; this removes
  most of the 74 `window.game` reach-arounds.
- Finish the half-done `utils/results-viewer.js` (1,079 lines) extraction into
  its existing `results-viewer/` module folder.
- Screen transitions: centralize `showScreen()` calls (11+ call sites in
  `socket-manager.js` alone) behind one owner that pairs transition with
  cleanup — the durable fix for stale-DOM bugs.

## Phase 6 — Backend durability backlog — M/L (independent, schedulable anytime)

- Orphaned-upload garbage collection for `public/uploads/` (no reference
  counting today; deletes never clean images). Sweep job comparing uploads dir
  against image refs in `quizzes/*.json`.
- `metadata.json` single-file store: add write serialization (mutex/queue) as
  the cheap fix; evaluate per-quiz metadata files or SQLite only if contention
  is real. `docs/DATABASE_MIGRATION.md` exists — reconcile with it (it may be
  aspirational).
- `services/results-service.js:106` reads+parses every results file per
  listing — add a lightweight index if results volume grows.
- `routes/ai-generation.js` (971 lines): factor the near-identical per-provider
  fetch/error blocks (`:320`, `:433`, `:817`) into one provider-call helper.
- Structured logging (pino) with request IDs for the K8s target — replaces the
  emoji-console wrapper in `server.js:71-92`.

## Deferred decisions (need owner input, blocking nothing)

- Cloud PaaS target: RESOLVED 2026-07-22 — owner confirmed the previously
  documented PaaS target is no longer used. Deployment claims stripped from
  docs; real targets are self-hosted Docker + Kubernetes only.
- `public/css/main.bundle.css` committed-to-git vs build-time-only: current
  compromise (committed + rebuilt in Docker) works but allows stale local
  serves. Options: gitignore it + `prestart` build hook, or CI staleness check.
- Deployed-identifier rename (docker image / container / volume / k8s resource
  names → `quizix`): RESOLVED 2026-07-22 — applied across deployment config.
  Operator steps for the coordinated migration window are in
  `docs/MIGRATION-quizix-rename.md`.
- `debug/` static mount in `server.js:356` is unconditional — confirm contents
  are safe to ship, or gate behind `!isProduction`.
