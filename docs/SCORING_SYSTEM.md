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
timeBonus = floor((10000ms - responseTime) × difficultyMultiplier / 10)
totalPoints = (basePoints + timeBonus) × doublePointsMultiplier
```

### Default Difficulty Multipliers

| Difficulty | Multiplier | Base Points |
|------------|------------|-------------|
| Easy       | 1×         | 100 pts     |
| Medium     | 2×         | 200 pts     |
| Hard       | 3×         | 300 pts     |

### Time Bonus

- **Maximum bonus time**: 10,000ms (10 seconds)
- **Formula**: `floor((10000 - responseTime) × multiplier / 10)`
- **Example**: A medium question answered in 3 seconds:
  - Time bonus = floor((10000 - 3000) × 2 / 10) = floor(1400) = 1400 points
  - Total = 200 (base) + 1400 (time) = **1600 points** (before Double Points)

### Time Bonus Threshold (Anti-Guessing)

To prevent players from randomly guessing quickly to maximize time bonus, hosts can set a **threshold** where all answers within that time receive maximum points:

- **Setting**: "Max points threshold" (0-30 seconds)
- **Default**: 0 (disabled - linear bonus)
- **When set**: Answers within the threshold get **maximum time bonus** (as if answered in 0ms)
- **After threshold**: Normal linear decrease applies

**Example**: With a 3-second threshold on a medium question:
- Answer in 1 second: Gets max time bonus (2000 points) - same as 0 seconds
- Answer in 3 seconds: Gets max time bonus (2000 points) - within threshold
- Answer in 5 seconds: Gets reduced bonus (1000 points) - linear decrease from max

**Why use this?**
- Prevents rewarding lucky guesses
- Gives players time to read and think
- Rewards correct answers over speed

### Partial Credit (Ordering Questions)

For ordering questions, partial credit is applied:
```
points = floor(totalPoints × partialScore)
```
Where `partialScore` is a value from 0 to 1 representing the percentage correct.

## Configuration

### Per-Game Session Settings

Scoring can be configured per-game session via the **Scoring Settings** panel in the quiz editor:

1. **Enable time bonus** (checkbox)
   - When enabled: Faster answers earn more points
   - When disabled: Only base points are awarded

2. **Max points threshold** (number input, 0-30 seconds)
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

- Settings are **per-game session only** (not saved to quiz file)
- Default values match historical behavior exactly
- Games without custom settings use server defaults

## Host Breakdown Display

When "Show score breakdown" is enabled, the host sees a breakdown in the answer statistics area:

```
Scoring: Base: 200pts (medium) | Time bonus: ON
```

This helps hosts understand:
- The base points for the current question's difficulty
- Whether time bonus is active

**Note**: Players do NOT see this breakdown - they only see their earned points (e.g., "+250 points").

## Implementation Details

### Files Involved

| File | Purpose |
|------|---------|
| `services/game-session-service.js` | Server-side scoring calculation |
| `public/js/core/app.js` | Collects scoring config from UI |
| `public/js/game/game-manager.js` | Renders host breakdown |
| `public/js/practice/local-game-session.js` | Practice mode scoring (matches server) |
| `public/index.html` | Scoring settings UI |
| `public/css/components.css` | Styling for settings panel |
| `public/css/game.css` | Styling for breakdown display |

### Data Flow

1. **Game Creation**:
   ```javascript
   // app.js collects config
   const scoringConfig = {
       timeBonusEnabled: true,
       difficultyMultipliers: { easy: 1, medium: 2, hard: 3 }
   };
   // Sent with quiz data to server
   ```

2. **Server Processing**:
   ```javascript
   // game-session-service.js uses config
   const multiplier = this.scoringConfig?.difficultyMultipliers?.[difficulty]
       ?? this.config.SCORING.DIFFICULTY_MULTIPLIERS[difficulty];
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
           timeBonusEnabled: true
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
| `enable_time_bonus` | Enable time bonus (faster = more points) |
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
- No changes to saved quiz format

## Examples

### Example 1: Default Settings, Medium Question, Fast Answer

- Difficulty: Medium (2×)
- Response time: 2 seconds
- Time bonus: Enabled
- Double Points: Not active

```
basePoints = 100 × 2 = 200
timeBonus = floor((10000 - 2000) × 2 / 10) = floor(1600) = 1600
totalPoints = 200 + 1600 = 1800 points
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
- Response time: 4 seconds
- Time bonus: Enabled
- Double Points: Active (2×)

```
basePoints = 100 × 1.5 = 150
timeBonus = floor((10000 - 4000) × 1.5 / 10) = floor(900) = 900
totalPoints = (150 + 900) × 2 = 2100 points
```

## UI Location

The Scoring Settings panel is located in the quiz editor, in a collapsible `<details>` element after the Power-Ups option:

```
[x] 🎮 Manual question advancement (host control)
[x] ⚡ Enable Power-Ups (50-50, +10s, 2x Points)
▶ 📊 Scoring Settings
    [x] Enable time bonus (faster = more points)
    [x] Show score breakdown (host view)
    Difficulty Multipliers:
    Easy [1] Medium [2] Hard [3]
```

Click the arrow to expand/collapse the settings.
