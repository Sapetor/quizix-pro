---
id: full-game
priority: critical
start_path: /
allow_cdn: true
allow_tabs: true
---

# Play a full game end-to-end (host + one player)

## Starting state

- Quiz `E2E Test Quiz` exists: question 1 is multiple-choice "What is
  2 + 2?" (correct: 4), question 2 is true/false "The sky is blue on a clear
  day." (correct: True). Each has a generous time limit.
- You can open extra isolated tabs (separate devices) with `tab_open`.
- An onboarding tour may appear on first visit; you may skip it.

## Goal

Host a complete game of `E2E Test Quiz` with one player (`LunaPlayer`,
joined from a second tab) and finish it through to the final results/podium.

## User intent

Run the game like a real classroom round:

1. Host to the lobby in `main`; join as `LunaPlayer` from a `player` tab.
2. Start the game from the host tab.
3. For each question: check both screens — does the host show the question
   and some answer/progress indication; does the player get tappable answer
   options? Answer CORRECTLY as the player both times (4, then True).
4. Observe scoring: after each question does the player see feedback
   (correct/points), and does the host show results/leaderboard? Advance
   using the host controls when needed.
5. Finish the game. Judge the final screen(s): is there a podium/winner
   display on the host, and a personal result on the player side? Do the
   points make sense for two correct answers (non-zero, consistent between
   screens)?

## Required outcomes

- The game reaches a final results state on the host.
- `LunaPlayer` finished with a NON-ZERO score shown somewhere (host podium
  or player result).
- A results file is persisted server-side (checked by code after the run).

## Forbidden shortcuts

- UI only. Do not skip questions by reloading or URL tricks.

## Deterministic assertions

```json
[
  {"name": "results_file_count_min", "min": 1},
  {"name": "results_dir_contains", "text": "LunaPlayer"},
  {"name": "no_http_5xx"}
]
```
