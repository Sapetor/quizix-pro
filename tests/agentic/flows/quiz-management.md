---
id: quiz-management
priority: medium
start_path: /
allow_cdn: true
---

# Quiz library management: browse, preview, delete

## Starting state

- Quizzes on the server: `E2E Test Quiz`, `Disposable Quiz Alpha`,
  `Disposable Quiz Beta`. Skip the onboarding tour if it appears.

## Goal

From the host side, exercise the quiz library: browse the list, load/preview
a quiz, and DELETE `Disposable Quiz Beta` (and only that one).

## User intent

Act like a teacher tidying their library:

1. Find where existing quizzes are listed (load/browse in the host/editor
   area). Do all three seeded quizzes appear?
2. Open/load `Disposable Quiz Alpha` and judge what you see — does it show
   its question(s) somewhere sensible (editor or preview)?
3. Delete `Disposable Quiz Beta`. Is there a confirmation step? Does the
   list update immediately? Is there any way to recover/undo (note it)?
4. Confirm `E2E Test Quiz` and `Disposable Quiz Alpha` still exist and
   `Disposable Quiz Beta` is gone (also after a reload).

## Required outcomes

- `Disposable Quiz Beta` is deleted via the UI and stays gone after reload.
- The other two quizzes remain listed.

## Forbidden shortcuts

- UI only; no API calls.

## Deterministic assertions

```json
[
  {"name": "quiz_dir_not_contains", "text": "Disposable Quiz Beta"},
  {"name": "quiz_dir_contains", "text": "Disposable Quiz Alpha"},
  {"name": "quiz_dir_contains", "text": "E2E Test Quiz"},
  {"name": "no_http_5xx"}
]
```
