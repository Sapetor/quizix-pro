---
id: editor-save
priority: critical
start_path: /
allow_cdn: true
---

# Create a quiz in the editor and save it

## Starting state

- Anonymous visitor on the landing page. An onboarding tour may appear; you
  may skip it. A quiz `E2E Test Quiz` already exists (don't touch it).

## Goal

Using the quiz editor, create a NEW quiz titled `Editor Smoke Quiz` with two
questions, and save it so it appears in the quiz list:

1. A multiple-choice question: "Which planet is red?" with options
   Mars / Venus / Pluto / Moon, correct answer Mars.
2. A true/false question: "Fire is cold." — correct answer False.

## User intent

Behave like a teacher writing their first quiz. Find the editor from the
host area. Judge the editing experience: is it clear how to set the title,
add a question, choose the question type, mark the correct answer? Do any
controls silently do nothing? After saving, verify the quiz actually shows
up in the quiz picker/list (e.g. where you'd select a quiz to host).

## Required outcomes

- The quiz saves without error and `Editor Smoke Quiz` is visible in the
  quiz list afterwards.
- The saved quiz contains both questions (checked by code after the run).

## Forbidden shortcuts

- UI only; no API calls, no import feature — type the questions in.

## Deterministic assertions

```json
[
  {"name": "quiz_dir_contains", "text": "Editor Smoke Quiz"},
  {"name": "quiz_dir_contains", "text": "Which planet is red?"},
  {"name": "quiz_dir_contains", "text": "Fire is cold."},
  {"name": "no_http_5xx"}
]
```
