# Game Stress Test + Visual Regression Design

## Context

Recent fixes touched in-game systems (CSS visibility, badge positioning, socket handling). The existing test suite (13 Jest unit tests, 6 Playwright E2E specs) covers individual features but never stress-tests at scale. No test validates that a full game with 50 players, random disconnects/reconnects, all 5 question types, and scoring correctness works end-to-end. Additionally, there is no visual regression baseline to catch CSS/DOM bugs across game states.

**Goal:** Two independent test layers that, together, prove the game works correctly under load AND looks right visually.

---

## Layer 1: Socket Stress Test

**File:** `tests/stress/game-stress.test.js`
**New devDependency:** `socket.io-client`
**Runner:** Jest (existing config extended to include `tests/stress/`)

### Test Server Harness

`server.js` auto-starts on load and doesn't export `app`/`server`/`io`. We need a thin harness to start the server programmatically on a random port.

**Approach:** Create `tests/helpers/test-server.js` that:
1. Sets `process.env.PORT = 0` (random port) and `process.env.NODE_ENV = 'test'`
2. Requires `server.js` (which auto-starts) OR extracts a `createApp()` factory if the auto-start is problematic
3. Waits for the `listening` event to get the actual port
4. Exports `{ port, close() }` for use in tests

If `server.js` auto-start conflicts with Jest (signal handlers, cleanup timers), the harness will instead manually wire Express + Socket.IO + the required services (game-events, player-events, gameplay-events). This is more work but avoids modifying production code.

**Rate limiter handling:** Set `process.env.DISABLE_RATE_LIMIT = 'true'` in the test harness, and add a one-line guard in the rate limiter middleware to skip when this env var is set. This prevents rate limit rejections during mass join/answer bursts.

### Test Quiz

Inline quiz definition with all 5 question types, in order:
1. Multiple-choice (4 options, correctAnswer: 2)
2. True/false (correctAnswer: true)
3. Multiple-correct (4 options, correctAnswers: [0, 2])
4. Numeric (correctAnswer: 3.14, tolerance: 0.01)
5. Ordering (4 items, correctOrder: [2, 0, 3, 1])

Settings: `randomizeAnswers: false`, `powerUpsEnabled: true`, `manualAdvancement: false` (except scenario 7).

### Socket Lifecycle & Timing

- **`beforeAll`**: Start test server, get port
- **`afterAll`**: Disconnect all clients, close server
- **`beforeEach`**: Create fresh host socket + 50 player sockets. Host emits `host-join`, waits for `game-created`. Each player emits `player-join`, waits for its own `player-joined` ack. Use `Promise.all` to join all 50 in parallel, then assert all 50 received.
- **`afterEach`**: Disconnect all sockets, wait for server to process disconnects

**Timing constants to handle:**
- `GAME_START_DELAY` (2s) — after `start-game`, wait for first `question-start`
- `LEADERBOARD_DISPLAY_TIME` (3s) — between questions, wait for next `question-start`
- `SocketBatchService` (500ms flush) — answer-count-update may be batched; use `waitForEvent` with timeout

**Helper:** `waitForEvent(socket, eventName, timeout=10000)` → Promise that resolves with event data or rejects on timeout.

### Test Scenarios

#### 1. Full game — 50 players, all correct
- 50 clients join via `player-join`
- Host emits `start-game`
- For each question: all 50 listen for `question-start`, submit correct answer, wait for `player-result`
- Assert: all players have identical scores, leaderboard has 50 entries, game ends with `game-end` (not `game-ended` — that's the abnormal termination event)

#### 2. Mixed correct/incorrect
- 25 players answer correctly, 25 answer incorrectly (deterministic split by player index)
- Incorrect answers: MC→wrong index, TF→false (when true is correct), multiple-correct→[1,3] (wrong set, binary scoring — no partial credit), numeric→99 (outside tolerance), ordering→[0,1,2,3] (reversed from [2,0,3,1] — 0 of 4 positions correct → 0 points)
- Assert: correct players have strictly higher scores, incorrect players have 0 for binary types, ordering incorrects have proportional partial credit

#### 3. Disconnect/reconnect during questions
- 10 players disconnect after question-start (close socket)
- 8 reconnect via new socket + `player-rejoin` with stored sessionToken
- 2 stay disconnected — use `jest.useFakeTimers()` to advance past the 2-minute grace period (pattern from existing `tests/unit/disconnect-reconnect.test.js`)
- Assert: reconnected players can answer remaining questions, timed-out players removed from active count but scores preserved in final leaderboard, `answer-count-update` reflects correct connected/total counts

#### 4. All-answer-at-once race condition
- All 50 emit `submit-answer` within a `Promise.all` (near-simultaneous)
- Assert: all 50 receive `player-result` (account for SocketBatchService 500ms flush delay), no duplicate scoring, early-end triggers correctly, server doesn't crash

#### 5. Host disconnect/reconnect
- Host socket disconnects mid-question
- Players receive `host-disconnected`
- Host reconnects within 30s via new socket + `host-rejoin`
- Players receive `host-reconnected`
- Assert: game state fully restored (current question, scores, player list), game continues normally

#### 6. Power-ups
- 3 players use `fifty-fifty` on MC question → assert hidden options returned
- 3 players use `extend-time` → assert extra seconds
- 3 players use `double-points` → assert double score on next correct answer
- Same players try to reuse → assert rejection (one-per-game)

#### 7. Manual advancement mode
- Same quiz but `manualAdvancement: true`
- After each question timeout, verify no `question-start` fires within 3s
- Host emits `next-question` → verify `question-start` fires
- Assert: game does NOT auto-advance, only advances on host signal

#### 8. Mid-game player join
- Game starts with 40 players
- 10 more join after question 2's `question-start` event (wait for state to be `question`, not `starting`)
- Assert: late joiners receive `game-started` + current `question-start`, can answer remaining questions, appear on leaderboard

### npm Script

```json
"test:stress": "jest --testPathPattern=tests/stress --testTimeout=120000"
```

(120s timeout to accommodate game timing delays across 5 questions)

---

## Layer 2: Playwright Visual Regression

**File:** `tests/e2e/visual-regression.spec.js`
**Baselines:** `tests/e2e/visual-regression.spec.js-snapshots/` (auto-created by Playwright)

### Shared Helpers

Extract duplicated helpers from existing E2E tests into `tests/helpers/e2e-helpers.js`:
- `createContext(browser, device)` — pre-seeds localStorage
- `waitForScreen(page, screenName)` — waits for `.active` class
- `hostCreateGame(page, quiz)` — host creates game via UI
- `joinAsPlayer(page, pin, name)` — player joins via PIN

This deduplicates code currently copy-pasted across 6 E2E spec files.

### Viewports

- Desktop: 1280×720 (Chromium)
- Mobile: Galaxy S8 (360×740, Playwright device profile)

### Dynamic Content Masking

Use Playwright's `mask` option on `toHaveScreenshot()` to cover:
- Game PIN display and QR codes
- Player names / scores / ranks
- Timer countdown values
- Timestamps

### Test Flow

One host browser context + one player browser context. Walk through a full game with all 5 question types.

### Screenshot Matrix

| State | Host | Player | Count |
|-------|------|--------|-------|
| Lobby (player joined) | Yes | Yes | 2 |
| MC: question displayed | Yes | Yes | 2 |
| MC: answer selected | - | Yes | 1 |
| MC: answer reveal + badge | Yes | Yes | 2 |
| MC: leaderboard | Yes | Yes | 2 |
| TF: question displayed | Yes | Yes | 2 |
| TF: answer selected | - | Yes | 1 |
| TF: answer reveal + badge | Yes | Yes | 2 |
| Multi-correct: question | Yes | Yes | 2 |
| Multi-correct: selected | - | Yes | 1 |
| Multi-correct: reveal | Yes | Yes | 2 |
| Numeric: question | Yes | Yes | 2 |
| Numeric: input filled | - | Yes | 1 |
| Numeric: reveal | Yes | Yes | 2 |
| Ordering: question | Yes | Yes | 2 |
| Ordering: arranged | - | Yes | 1 |
| Ordering: reveal | Yes | Yes | 2 |
| Final leaderboard | Yes | Yes | 2 |
| Game finished | Yes | Yes | 2 |
| **Total per viewport** | | | **~31** |
| **Total (2 viewports)** | | | **~62** |

### Naming Convention

`{viewport}-{question-type}-{state}.png`

Examples:
- `desktop-lobby-players-joined.png`
- `mobile-true-false-answer-selected.png`
- `desktop-ordering-answer-reveal.png`

### npm Scripts

```json
"test:visual": "npx playwright test tests/e2e/visual-regression.spec.js",
"test:visual:update": "npx playwright test tests/e2e/visual-regression.spec.js --update-snapshots"
```

---

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| Create | `tests/stress/game-stress.test.js` | Socket stress test (8 scenarios) |
| Create | `tests/e2e/visual-regression.spec.js` | Playwright visual regression |
| Create | `tests/helpers/test-server.js` | Test server harness (start on random port) |
| Create | `tests/helpers/e2e-helpers.js` | Shared Playwright helpers (extracted from existing E2E) |
| Modify | `package.json` | Add `socket.io-client` devDep, add npm scripts |
| Modify | `jest.config.js` | Add `tests/stress/` to testMatch |
| Modify | Rate limiter file | Add `DISABLE_RATE_LIMIT` env guard (one line) |

---

## Existing Code to Reuse

- **Server startup:** `server.js` — harness wraps this
- **Mock quiz pattern:** Inline quiz from `tests/e2e-all-question-types.spec.js` (all 5 types)
- **Playwright helpers:** `createContext()`, `waitForScreen()` from existing E2E tests → extract to shared module
- **Socket event names:** All from `socket/game-events.js`, `socket/player-events.js`, `socket/gameplay-events.js`
- **Answer formats:** From `services/question-type-service.js` validation
- **Fake timer pattern:** From `tests/unit/disconnect-reconnect.test.js` (grace period testing)

---

## Verification

### Stress test
```bash
npm run test:stress
# Expect: 8 scenarios pass, ~50 socket connections per scenario, no timeouts
```

### Visual regression (first run creates baselines)
```bash
npm run test:visual
# First run: creates ~62 baseline screenshots
# Subsequent runs: compares against baselines, fails on pixel diff beyond threshold
```

### Update baselines after intentional CSS changes
```bash
npm run test:visual:update
```

### Full suite
```bash
npm test && npm run test:stress && npm run test:visual
```
