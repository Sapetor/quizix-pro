---
id: mobile-join-gate
priority: high
start_path: /
allow_cdn: true
viewport: mobile
---

# Phone UX: join-and-play only, hosting gated

## Starting state

- You are on a PHONE (412x915 touch screen). Quiz `E2E Test Quiz` exists.
- Product rule: phones are join-and-play ONLY — hosting/editing is
  desktop-only and the phone UI is supposed to route phone users toward
  joining a game instead of hosting one.

## Goal

Verify the phone experience honors that rule and that the join path is
comfortable on a small screen.

## User intent

1. Land on the home page as a phone user. Is the layout usable (no
   horizontal scrolling, tap targets big enough, header not overflowing)?
2. Try to HOST: tap whatever hosting affordances exist. Expected: you are
   gated or redirected toward joining — NOT dropped into a desktop hosting
   or editor screen. Note exactly what happens.
3. Go to the join screen: is the PIN entry usable with a phone keyboard?
   Enter a fake PIN like 999999 and a name, submit, and judge the error
   handling ("game not found" style message, not a hang or crash).
4. Note anything overlapping, clipped, untranslated, or too small to tap.

## Required outcomes

- Hosting is not reachable as a functioning desktop-style host/editor
  screen on the phone; the user is guided to join instead.
- The join form is usable and a bad PIN yields a clear error.

## Forbidden shortcuts

- UI only; stay in the phone viewport (no zooming out tricks).

## Deterministic assertions

```json
[
  {"name": "no_http_5xx"}
]
```
