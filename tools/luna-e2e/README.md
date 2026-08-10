# Luna agentic E2E harness (Quizix Pro port)

Agentic end-to-end verification for Quizix Pro, ported from
SimpleChat/tools/luna-e2e: an LLM executor behaves like a real user in a
local Playwright browser; deterministic code-side assertions decide
pass/fail.

## What it does

Per flow (fully isolated):

1. Boots a **disposable** Quizix instance: `node server.js` from a temp cwd
   with fresh `quizzes/` + `results/` dirs and a symlinked `public/` (fresh
   `uploads/`). Never touches the repo's quizzes, results, or uploads. Ports
   start at 8931 (+1 per flow), clear of 3000/3001/3009/3010/3210/3400.
2. Seeds a playable quiz `E2E Test Quiz` and a user `lunatester` via the API
   (quizzes must be registered via `POST /api/save-quiz` — dropped files are
   invisible to the picker), plus per-flow seeds (results history, LaTeX
   quiz, disposable quizzes).
3. Opens an isolated Chromium context (video + trace + console + network
   capture, **host-allowlisted** to the test instance; CDN hosts only for
   `allow_cdn` flows). Flows with `allow_tabs` can open extra **tabs** —
   each its own browser context (isolated storage), because quiz games are
   multi-actor: host screen + player devices. `viewport: mobile` runs the
   whole flow as a Pixel-class phone.
4. Runs the executor:
   - `luna` (default): OpenAI Responses API computer-use loop — requires
     `OPENAI_API_KEY` (no multi-tab support; `allow_tabs` flows are BLOCKED).
   - `--executor codex`: local Codex CLI as the brain (ChatGPT-plan auth).
     Codex sees screenshots and drives the browser via `browser_ctl.py` ->
     a localhost command bridge, including tab ops for multi-actor flows.
     `E2E_CODEX_EFFORT` (minimal|low|medium|high|xhigh, default medium);
     `E2E_CODEX_MODEL` — `gpt-5.6-luna` is selectable on the ChatGPT plan:
     `E2E_CODEX_MODEL=gpt-5.6-luna E2E_CODEX_EFFORT=xhigh \
        python3 tools/luna-e2e/run_suite.py --executor codex --jobs 3`
   - `--scripted`: deterministic self-test executors, no LLM, no cost.
5. Runs the flow's deterministic assertions (quiz/results/users files in the
   temp instance, DOM checks, console/5xx checks). **Assertions override the
   executor's opinion.**
6. Writes `report.md`, `result.json`, screenshots, `trace.zip`, video,
   `console.log`, `network.log` under `.artifacts/luna-e2e/<run-id>/<flow>/`
   plus a suite `summary.md`. Agents also file `polish_notes` (UX issues,
   dead controls, untranslated strings) even on PASS.

## Usage

```bash
# harness self-test, no LLM (host-lobby + player-join have scripted paths)
python3 tools/luna-e2e/run_suite.py --scripted host-lobby player-join

# full swarm, 3 at a time
E2E_CODEX_MODEL=gpt-5.6-luna E2E_CODEX_EFFORT=xhigh \
  python3 tools/luna-e2e/run_suite.py --executor codex --jobs 3
```

Exit status is nonzero if a `critical` flow has a PRODUCT failure.

## Flow specs

`tests/agentic/flows/*.md` — Markdown with `key: value` front matter; the
assertion list is the fenced ```json block under "## Deterministic
assertions" (stripped from what the executor sees). Frontmatter keys:
`priority`, `start_path`, `allow_cdn`, `allow_tabs`, `viewport: mobile`.
Specify **intent and required outcome**, not selectors.

## Environment

- `OPENAI_API_KEY` — required for the Luna executor only.
- `LUNA_MODEL` (default `gpt-5.6-luna`), `E2E_APP_PORT` (8931),
  `E2E_MAX_STEPS` (80), `E2E_FLOW_TIMEOUT_MS` (420000),
  `E2E_ARTIFACT_DIR` (.artifacts/luna-e2e), `E2E_REASONING_EFFORT` (high),
  `E2E_CODEX_MODEL`, `E2E_CODEX_EFFORT`.

## Safety

- Synthetic credentials only; disposable data dirs, removed on teardown.
- Browser contexts block every host except the local test instance (+CDNs
  when a flow opts in).
- Retry at most once, only for environment-classified failures; a retry that
  flips a failure to pass is reported FLAKY, not PASS.

## Quizix-specific gotchas encoded here

- Quizzes/results/uploads resolve relative to the server's **cwd**; static
  assets resolve via `__dirname` — that's what makes the temp-cwd trick work.
- `quizzes/` also holds `users.json` and `quiz-metadata.json`; quiz-count
  assertions exclude them.
- The first-visit onboarding tour will appear to agents (fresh storage every
  run); flows tell agents they may skip it — and to report if it misbehaves.
- The server persists results itself at game end (`endGame()`), so
  `results_file_count_min` is a valid post-game assertion.
