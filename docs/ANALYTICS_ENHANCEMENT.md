# Quiz Analytics

Post-game analytics for identifying weak questions, misconceptions, and concept
gaps. This document describes what the code actually does; earlier revisions
described a server-side analytics pipeline (`questionAnalytics`,
`questionMetadata`, `gameMetrics` written into the result file) that was never
implemented.

## Where the work happens

| Concern | File |
|---|---|
| Saving results | `services/results-service.js` (`saveResults`) |
| CSV export (analytics + simple) | `services/results-service.js` |
| Reading saved answers (labels, correct answer) | `public/js/utils/results-viewer/answer-format.js` |
| Analytics maths, modal, charts | `public/js/utils/results-viewer/results-analytics.js` |
| Chart colours & theme | `public/js/utils/results-viewer/chart-theme.js` |
| PDF / Excel export | `public/js/utils/results-viewer/results-exporter.js` |
| Cross-session comparison modals | `public/js/utils/results-viewer/results-comparison.js` |
| Orchestration & wiring | `public/js/utils/results-viewer.js` |

Analytics are **computed on demand in the browser** from the saved result file.
Nothing analytical is persisted, so improvements to the maths apply retroactively
to every game already on disk.

## Saved result format

```json
{
  "quizTitle": "Quiz Name",
  "gamePin": "123456",
  "startTime": "2026-01-01T10:00:00Z",
  "endTime": "2026-01-01T10:30:00Z",
  "saved": "2026-01-01T10:30:02Z",
  "questions": [
    {
      "questionNumber": 1,
      "text": "What is the capital of France?",
      "type": "multiple-choice",
      "options": ["London", "Paris", "Berlin", "Madrid"],
      "correctAnswer": 1,
      "difficulty": "medium",
      "timeLimit": 60,
      "concepts": ["Geography"]
    }
  ],
  "results": [
    {
      "name": "Ana",
      "score": 2183,
      "answers": [
        { "answer": 1, "isCorrect": true, "points": 2183, "timeMs": 484,
          "breakdown": { "basePoints": 200, "timeBonus": 1983,
                         "difficultyMultiplier": 2, "doublePointsMultiplier": 1 } }
      ]
    }
  ]
}
```

Notes that matter when reading this data:

- **Answers are option indices**, not text, for `multiple-choice`,
  `multiple-correct` and `ordering`. Anything user-facing must resolve them
  against `question.options` — `formatAnswerLabel()` / `_formatAnswerValue()`.
- **The correct answer lives in a different field per type**: `correctAnswer`
  (multiple-choice, true-false, numeric), `correctAnswers` (multiple-correct),
  `correctOrder` (ordering). Use `getCorrectAnswerValue()` /
  `_formatCorrectAnswer()` rather than reading `correctAnswer` directly; both
  defer to `ScoringService.getCorrectAnswerKey()`'s field priority.
- **A missing answer is a `null` slot**, left by players who never reached the
  question (99 of them across the corpus). Test for presence, not truthiness:
  an answer of `0` (option A) or `false` is a real response.
- **Verdicts are read, never recomputed.** `isCorrect` is whatever the server
  recorded while grading; nothing in the analytics path re-grades an answer.
- **Points are not percentages.** Difficulty multipliers and time bonuses make a
  single question worth thousands of points, so any "success rate" must be
  computed from `isCorrect` counts, never from a points ratio.
- The listing endpoint (`GET /api/results`) omits the per-player `results`
  array and sends `participantCount` + `averageScore` instead; the detail
  endpoint (`GET /api/results/:filename`) returns the full file.

## Per-question analytics

`calculateQuestionAnalytics(result)` returns one object per question:

| Field | Meaning |
|---|---|
| `totalResponses` / `correctResponses` | Answer counts (an index-`0` answer counts) |
| `timedResponses` | Responses that carry a `timeMs`; averages use this, not `totalResponses` |
| `successRate` | `correctResponses / totalResponses × 100` |
| `averageTime` / `averagePoints` | Averaged over timed / all responses |
| `correctAnswerLabel` | Correct answer as display text |
| `commonWrongAnswers` | `{ "London": 2 }` — keyed by option text |
| `unanswered` | `true` when nobody reached the question |
| `problemFlags` | Review flags (see below) |

A question with zero responses is marked `unanswered`, is never flagged, and is
excluded from the summary averages and from hardest/easiest — a 0% rate there
means "no data", not "everyone failed".

### Review flags

| Flag | Trigger |
|---|---|
| `low_success` (high) | success rate < 40% |
| `moderate_success` (medium) | success rate 40–59% |
| `time_vs_success` (high) | avg time > 15s and success < 50% (needs timing) |
| `quick_wrong` (medium) | avg time < 8s and success < 70% (needs timing) |
| `common_wrong_answer` (medium) | one wrong option took ≥ 40% of responses |

Flag messages are translated (`analytics_flag_*` keys, all 10 locales).

## Concept mastery

Questions may carry a `concepts` array. `calculateConceptMastery()` aggregates
per-concept success into four bands (mastered ≥ 80, proficient ≥ 60,
developing ≥ 40, needs-work). `inferConceptDependencies()` looks for concept
pairs where the same players are weak in both and suggests strengthening the
weaker one. This is a co-occurrence heuristic, not a causal claim — it needs at
least 3 players with data in both concepts before it says anything.

## Charts

`chart-theme.js` owns colour. Chart chrome (tick text, gridlines) follows the
app's design tokens so charts stay legible in both themes; data colour comes
from a fixed, validated palette:

- one series colour, plus one emphasis colour for questions flagged for review
  (light `#2563eb`/`#b91c1c`, dark `#3b82f6`/`#ef4444`);
- a six-slot categorical set for the cross-session comparison chart, assigned by
  position and never cycled.

Both palettes pass lightness-band, chroma, CVD-separation, normal-vision and
contrast checks in both modes. The previous green/amber/orange/red ramp did not:
its middle two steps were ΔE 4.1 apart in normal vision (0.1 under
deuteranopia), and it double-encoded bar length as hue. Mastery *bands* still
appear as colour in the concepts list, where each row carries an icon and the
legend names the levels.

## Exports

| Export | Produced by | Contents |
|---|---|---|
| Analytics CSV | server | One row per question: correct answer, per-player answer/time/points/verdict, success rate, avg time, total points earned, hardest-for, most common wrong answer, plus a game summary block |
| Simple CSV | server | One row per player-answer |
| Excel (XLSX) | client (SheetJS) | Summary / Question analysis / Player results / Common wrong answers sheets |
| PDF | client (jsPDF, lazy-loaded) | Summary page plus per-question analysis (first 20 questions) |
| Comparison PDF | client | Session-over-session trends |

All CSV values pass through `_sanitizeCsvValue()` (formula-injection defence).
The analytics CSV's "Overall Success Rate" is a correctness ratio; it is not
derived from points.

## Entry points

- Results viewer → per-result **Analytics** button.
- Results viewer → result row → detail modal → **Quiz Analytics** button.
- Analytics modal → **Questions** tab → click a question for the drill-down
  (answer distribution, response-time buckets, common wrong answers).
- Results viewer → **Compare Sessions** (quizzes with 2+ saved sessions).

## Tests

| Scope | File |
|---|---|
| Analytics maths | `tests/unit/results-analytics.dom.test.js` |
| Modal DOM & tab scoping | `tests/unit/results-analytics-modal.dom.test.js` |
| Comparison modal DOM | `tests/unit/results-comparison.dom.test.js` |
| Server export/CSV | `tests/unit/results-service.test.js` |
| End-to-end wiring | `tests/e2e/analytics-modal.spec.js` (seeds and removes its own result file) |
