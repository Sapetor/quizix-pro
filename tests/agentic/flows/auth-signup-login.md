---
id: auth-signup-login
priority: high
start_path: /
allow_cdn: true
---

# Account sign-up, logout, and login

## Starting state

- An account `lunatester` (password `luna-test-pass-1`) already exists.
- You are an anonymous visitor. An onboarding tour may appear; skip it.

## Goal

Exercise the (optional) account system end-to-end:

1. Find the sign-up/login entry point (likely in the header chrome).
2. Create a NEW account `lunafresh` with password `fresh-pass-12345`.
3. Confirm the UI reflects being signed in (name shown, sign-out available).
4. Sign out; confirm the signed-out state.
5. Sign in as the EXISTING `lunatester` account and confirm it works.
6. Also probe one failure path: try logging in as `lunatester` with a wrong
   password and judge the error message.

## User intent

Judge like a privacy-conscious teacher: are the forms labeled, do password
rules get explained when violated, does the signed-in state persist across
a page reload, is signing out unambiguous?

## Required outcomes

- `lunafresh` is created and usable; signed-in state visible.
- Login as `lunatester` succeeds; wrong password is rejected with a clear
  message.

## Forbidden shortcuts

- UI only; no API calls.

## Deterministic assertions

```json
[
  {"name": "users_file_contains", "text": "lunafresh"},
  {"name": "no_http_5xx"}
]
```
