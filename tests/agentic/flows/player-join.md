---
id: player-join
priority: critical
start_path: /
allow_cdn: true
allow_tabs: true
---

# A player joins the host's lobby

## Starting state

- A quiz named `E2E Test Quiz` exists. You start as an anonymous visitor on
  the landing page. An onboarding tour may appear; you may skip it.
- You can open extra isolated tabs (separate devices) with `tab_open`.

## Goal

Act as two people: in the `main` tab, host a game of `E2E Test Quiz` up to
the lobby (note the game PIN). Then open a second tab (`tab_open player`),
and as a student join the game with that PIN and the name `LunaPlayer`.

## User intent

Judge the join experience like a 12-year-old student would: is the join path
obvious from the landing page? Does the PIN field accept the PIN cleanly?
What happens with a wrong PIN (try one wrong PIN first — e.g. 000000 — and
observe the error message before joining correctly)? After joining, does the
player see a clear "you're in" state? Switch back to the host tab: did
`LunaPlayer` appear in the lobby without a refresh?

## Required outcomes

- The player joins successfully and sees a waiting/lobby state.
- The host lobby shows `LunaPlayer` in its player list (live, no reload).
- A wrong PIN produces a clear, non-technical error message.

## Forbidden shortcuts

- UI only. Do not reload the host tab to force the list to update.

## Deterministic assertions

```json
[
  {"name": "page_contains", "text": "LunaPlayer", "tab": "main"},
  {"name": "no_http_5xx"}
]
```
