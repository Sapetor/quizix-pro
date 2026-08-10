---
id: results-analytics
priority: high
start_path: /
allow_cdn: true
---

# Past game results and analytics render real data

## Starting state

- A finished game's results are already stored on the server: quiz
  `Seeded History Game`, game PIN 424242, players `Alice` (score 1850) and
  `Bob` (score 900), 3 questions.
- Anonymous visitor on the landing page; skip the tour if it appears.

## Goal

Find where a host reviews PAST game results (results/analytics area, likely
reachable from the host/editor side) and open the seeded game's results.

## User intent

Behave like a teacher reviewing yesterday's class round. Judge:

- Does the results list show the seeded game with a sensible label/date?
- Open it: are per-player scores shown and do they match (Alice 1850,
  Bob 900)? Are per-question stats (correct rates, difficulty) present?
- If there are charts, do they actually render (no empty boxes / spinners)?
- Try any export/download or detail affordances you find and note whether
  they work (if a download is blocked by the browser, note it and move on).

## Required outcomes

- The seeded game is findable and opens.
- Player names and scores displayed match the seeded data.

## Forbidden shortcuts

- UI only; no API calls.

## Deterministic assertions

```json
[
  {"name": "page_contains", "text": "Alice"},
  {"name": "no_http_5xx"}
]
```
