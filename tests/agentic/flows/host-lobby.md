---
id: host-lobby
priority: critical
start_path: /
allow_cdn: true
---

# Host a live game and reach the lobby

## Starting state

- A quiz named `E2E Test Quiz` (2 questions) already exists on this server.
- You are an anonymous visitor on the landing page. A first-visit onboarding
  tour may appear; you may skip it (but note how it behaves).

## Goal

As a teacher/host: from the landing page, start hosting a live game of
`E2E Test Quiz` and reach the game lobby that players would join.

## User intent

Find the hosting path yourself (the landing page advertises hosting; there
may also be a "quick start" shortcut). Select the quiz `E2E Test Quiz` and
launch the game. In the lobby, judge what a real teacher would need: is a
game PIN clearly displayed? Is there a QR code or join URL for students? Is
it obvious how to start the game once players join?

## Required outcomes

- A lobby screen with a legible numeric game PIN is reached.
- The lobby shows a way for players to join (PIN and/or QR/URL).

## Forbidden shortcuts

- UI only; no direct API calls, no URL guessing beyond the landing page.

## Deterministic assertions

```json
[
  {"name": "element_visible", "selector": "#game-pin"},
  {"name": "no_http_5xx"}
]
```
