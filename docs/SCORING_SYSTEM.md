# Scoring System Documentation

This document describes the transparent and configurable scoring system in Quizix Pro.

## Overview

The scoring system calculates points based on:
- **Difficulty level** of the question (Easy, Medium, Hard)
- **Response time** (optional time bonus for faster answers)
- **Power-ups** (Double Points multiplier if active)

## Scoring Formula

```
basePoints = 100 × difficultyMultiplier
rawBonus = floor(10000 × max(0, (timeLimit - responseTime) / timeLimit))
timeBonus = floor(rawBonus × difficultyMultiplier / 10)
totalPoints = (basePoints + timeBonus) × doublePointsMultiplier
```

`timeLimit` is the question's time limit in ms (default 20 s). The server constants are `BASE_POINTS = 100`, `MAX_BONUS_TIME = 10000` and `TIME_BONUS_DIVISOR = 10` (`CONFIG.SCORING` in `server.js`); `MAX_BONUS_TIME` is the raw bonus ceiling and is used as the decay window only when a question has no time limit. Since March 2026 (commit `a419083`) the bonus decays over the question time limit instead of a fixed 10 s.

### Default Difficulty Multipliers

| Difficulty | Multiplier | Base Points |
|------------|------------|-------------|
| Easy       | 1×         | 100 pts     |
| Medium     | 2×         | 200 pts     |
| Hard       | 3×         | 300 pts     |

### Time Bonus

- **Maximum bonus**: 1000 × multiplier (raw bonus 10,000 / 10)
- **Decay**: linear from the maximum at 0 s to 0 at the end of the question time limit
- **Example**: A medium question with a 20 s limit answered in 3 seconds:
  - Raw bonus = floor(10000 × 17/20) = 8500
  - Time bonus = floor(8500 × 2 / 10) = 1700 points
  - Total = 200 (base) + 1700 (time) = **1900 points** (before Double Points)

### Time Bonus Threshold (Anti-Guessing)

To prevent players from randomly guessing quickly to maximize time bonus, hosts can set a **threshold** where all answers within that time receive maximum points:

- **Setting**: "Equal-points window" (0-30 seconds)
- **Default**: 0 (disabled - linear bonus)
- **When set**: Answers within the threshold get **maximum time bonus** (as if answered in 0ms)
- **After threshold**: the bonus decreases linearly from the maximum at the threshold to 0 at the end of the question: `rawBonus = floor(10000 × max(0, (timeLimit - responseTime) / (timeLimit - threshold)))`

**Example**: With a 3-second threshold on a medium question with a 20 s limit:
- Answer in 1 second: Gets max time bonus (2000 points) - same as 0 seconds
- Answer in 3 seconds: Gets max time bonus (2000 points) - within threshold
- Answer in 5 seconds: Gets reduced bonus (1764 points): raw = floor(10000 × 15/17) = 8823

**Why use this?**
- Prevents rewarding lucky guesses
- Gives players time to read and think
- Rewards correct answers over speed

### Partial Credit (Ordering Questions)

For ordering questions, partial credit is applied:
```
points = floor((basePoints + timeBonus) × partialScore) × doublePointsMultiplier
```
Where `partialScore` is a value from 0 to 1 representing the fraction of items in the correct position. The answer counts as correct (`isCorrect: true`) only when `partialScore` is 1.

### Poll questions

True/false questions with `isPoll: true` are never graded: they score 0 points, return `isCorrect: null`, and do not consume a Double Points power-up.

### Consensus mode

In consensus mode the team earns `floor(100 × difficultyMultiplier × consensusBonus)` for a correct consensus answer, with no time bonus. This uses the server default multipliers (1/2/3); per-game custom multipliers are not passed to it. `consensusBonus` is 1.5 at 100% agreement, 1.2 at 75% or more, otherwise 1.0 (`ScoringService.calculateConsensusTeamPoints`).

## Configuration

### Per-Game Settings

Scoring can be configured per quiz via the **Scoring Settings** panel in the quiz editor:

1. **Enable time bonus** (checkbox)
   - When enabled: Faster answers earn more points
   - When disabled: Only base points are awarded

2. **Equal-points window** (number input, 0-30 seconds)
   - Default: 0 (disabled)
   - When set: Answers within this time get maximum time bonus
   - Prevents random quick guessing from being rewarded

3. **Difficulty Multipliers** (number inputs)
   - Easy: Default 1× (range: 0.5 - 5.0)
   - Medium: Default 2× (range: 0.5 - 5.0)
   - Hard: Default 3× (range: 0.5 - 5.0)

4. **Show score breakdown** (checkbox)
   - When enabled: Host sees scoring formula details
   - Breakdown shows: Base points, difficulty, time bonus status, threshold if set

### Important Notes

- Settings are saved in the quiz file under `settings.scoringConfig` (threshold in seconds) and restored when the quiz is loaded
- When a game starts, the config is sent to the server with the threshold converted to milliseconds
- Games without custom settings use server defaults (time bonus on, threshold 0, multipliers 1/2/3)

## Host Breakdown Display

When "Show score breakdown" is enabled, the host sees a breakdown in the answer statistics area:

```
Scoring: Base: 200pts (medium) | Time bonus: ON
```

With a threshold set, the time bonus part reads `Time bonus: ON (max within 3s)`.

This helps hosts understand:
- The base points for the current question's difficulty
- Whether time bonus is active

**Note**: Players do NOT see this breakdown - they only see their earned points (e.g., "+250 points").

## Implementation Details

### Files Involved

| File | Purpose |
|------|---------|
| `services/scoring-service.js` | Server-side scoring calculation (authoritative) |
| `services/game.js` | Calls `ScoringService.calculateScore()`, builds `scoringInfo` |
| `public/js/utils/scoring-config.js` | Client copy of the formula and defaults; reads config from the UI |
| `public/js/core/app.js` | Collects scoring config from UI |
| `public/js/quiz/modules/settings-persistence.js` | Saves/restores scoring config in the quiz file |
| `public/js/game/modules/statistics-manager.js` | Renders host breakdown |
| `public/js/practice/local-game-session.js` | Practice mode scoring (uses `scoring-config.js`) |
| `public/index.html` | Scoring settings UI |
| `public/css/components.css` | Styling for settings panel |
| `public/css/game.css` | Styling for breakdown display |

### Data Flow

1. **Game Creation**:
   ```javascript
   // app.js collects config via readScoringConfigFromDOM()
   const scoringConfig = {
       timeBonusEnabled: true,
       timeBonusThreshold: 0, // ms
       difficultyMultipliers: { easy: 1, medium: 2, hard: 3 }
   };
   // Sent with quiz data to server
   ```

2. **Server Processing**:
   ```javascript
   // scoring-service.js (getDifficultyMultiplier) uses config
   const multiplier = customMultipliers?.[difficulty]
       ?? defaultMultipliers[difficulty]
       ?? 2;
   ```

3. **Answer Submission Returns**:
   ```javascript
   {
       isCorrect: true,
       points: 250,
       breakdown: {
           basePoints: 200,
           timeBonus: 50,
           difficultyMultiplier: 2,
           doublePointsMultiplier: 1
       }
   }
   ```

4. **Answer Statistics Include**:
   ```javascript
   {
       // ... answer counts, player counts ...
       scoringInfo: {
           basePoints: 200,
           difficultyMultiplier: 2,
           difficulty: 'medium',
           timeBonusEnabled: true,
           timeBonusThreshold: 0
       }
   }
   ```

## Practice Mode

Practice mode uses the **identical scoring formula** as multiplayer:

- Same difficulty multipliers (1, 2, 3)
- Same time bonus calculation
- Same breakdown structure in events
- Reads from same UI settings

This ensures players can practice and see consistent scores.

## Translation Keys

The following keys are available in all 9 supported languages:

| Key | English |
|-----|---------|
| `scoring_settings` | 📊 Scoring Settings |
| `enable_time_bonus` | Enable time bonus |
| `time_bonus_threshold` | Equal-points window: |
| `show_score_breakdown` | Show score breakdown (host view) |
| `difficulty_multipliers` | Difficulty Multipliers: |
| `scoring` | Scoring: |
| `base` | Base |
| `time_bonus` | Time bonus |
| `enabled` | ON |
| `disabled` | OFF |

## Backward Compatibility

- Games created without `scoringConfig` use server defaults
- Default multipliers (1, 2, 3) match previous behavior
- Time bonus enabled by default (matches previous behavior)
- Quizzes saved without `settings.scoringConfig` load with the defaults

## Examples

### Example 1: Default Settings, Medium Question, Fast Answer

- Difficulty: Medium (2×)
- Time limit: 20 seconds
- Response time: 2 seconds
- Time bonus: Enabled
- Double Points: Not active

```
basePoints = 100 × 2 = 200
rawBonus = floor(10000 × 18/20) = 9000
timeBonus = floor(9000 × 2 / 10) = 1800
totalPoints = 200 + 1800 = 2000 points
```

### Example 2: Time Bonus Disabled, Hard Question

- Difficulty: Hard (3×)
- Response time: 5 seconds
- Time bonus: Disabled
- Double Points: Not active

```
basePoints = 100 × 3 = 300
timeBonus = 0 (disabled)
totalPoints = 300 points
```

### Example 3: Custom Multipliers, Easy Question, Double Points

- Difficulty: Easy (custom: 1.5×)
- Time limit: 20 seconds
- Response time: 4 seconds
- Time bonus: Enabled
- Double Points: Active (2×)

```
basePoints = 100 × 1.5 = 150
rawBonus = floor(10000 × 16/20) = 8000
timeBonus = floor(8000 × 1.5 / 10) = 1200
totalPoints = (150 + 1200) × 2 = 2700 points
```

## UI Location

The Scoring Settings panel is located in the quiz editor, in a collapsible `<details>` element after the Power-Ups, leaderboard and consensus options. The settings modal and the quick-start panel (`qs-` input ids) have their own copies of the same inputs:

```
[x] 🎮 Manual question advancement (host control)
[x] ⚡ Enable Power-Ups (50-50, +10s, 2x Points)
▶ 📊 Scoring Settings
    [x] Enable time bonus
    Equal-points window: [0] sec
    [x] Show score breakdown (host view)
    Difficulty Multipliers:
    Easy [1] Medium [2] Hard [3]
```

Click the arrow to expand/collapse the settings.
