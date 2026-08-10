---
id: render-audit
priority: medium
start_path: /
allow_cdn: true
allow_tabs: true
---

# LaTeX/math rendering audit during a hosted game

## Starting state

- A quiz `LaTeX Render Quiz` exists with 3 questions containing inline math
  `\(a^2 + b^2\)`, display math `$$\int_0^1 x^2\,dx$$`, and literal-text
  edge cases (`3 * 4 * 5 = 60`, `snake_case_name`, `a\* literal asterisk`,
  `<b>angle brackets</b>` that must show as text, not bold).
- You can open extra isolated tabs with `tab_open` (host + player).

## Goal

Host `LaTeX Render Quiz`, join as `RenderProbe` from a second tab, start the
game, and audit how every question renders on BOTH the host screen and the
player screen. Answer anything to advance; correctness doesn't matter here.

## User intent

You are auditing typography like a picky math teacher:

- Math must render as typeset math (no raw `\(`, `\)`, `$$`, or backslash
  soup visible; no permanently unstyled flash).
- Literal text must survive: `3 * 4 * 5 = 60` keeps its asterisks,
  `snake_case_name` keeps its underscores, `<b>angle brackets</b>` shows as
  literal text (if it renders BOLD, that's an HTML-injection rendering bug —
  report it).
- Options, explanations (if shown after answering), and the question text
  all count. Compare host vs player rendering and note any mismatch.

## Required outcomes

- All three questions were observed on both screens and rendering judged.
- No raw math delimiters visible on either screen once a question is shown.

## Forbidden shortcuts

- UI only.

## Deterministic assertions

```json
[
  {"name": "no_http_5xx"}
]
```
