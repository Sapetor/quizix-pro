---
id: language-switch
priority: medium
start_path: /
allow_cdn: true
---

# Language switching translates the UI and persists

## Starting state

- Anonymous visitor on the landing page (English by default). A language
  selector exists somewhere in the header chrome. Skip the tour if shown.

## Goal

Switch the interface language to Spanish, verify the UI actually translates,
then verify the choice persists, and finally switch back to English.

## User intent

1. Find the language control and switch to Español. Sweep the landing page,
   the join screen, and the host area: did headings, buttons, and helper
   text translate? Hunt for leftovers — untranslated English strings,
   raw i18n keys (things like `error_auth_required` or `lobby_title`
   showing literally), or `undefined` text.
2. Reload the page: is it still Spanish?
3. Switch to one more language you find (e.g. Deutsch or Français) and spot-
   check a screen, then return to English and confirm the round trip is
   clean.

## Required outcomes

- Switching visibly translates the main screens (not just one label).
- The language survives a reload.
- No raw translation keys or `undefined` strings anywhere you looked.

## Forbidden shortcuts

- UI only; do not edit localStorage directly.

## Deterministic assertions

```json
[
  {"name": "page_not_contains", "text": "undefined"},
  {"name": "no_http_5xx"}
]
```
