"""Codex executor: drives a flow with the local Codex CLI (ChatGPT-plan auth).

Same see-act loop as the Luna executor, but the brain is `codex exec` and the
hands are browser_ctl.py talking to a command bridge in this process. Sync
Playwright is greenlet-bound, so the HTTP bridge thread only enqueues
commands; this (main) thread executes them against the browser while the
Codex subprocess runs.
"""
import json
import os
import re
import subprocess
import tempfile
import threading
import time
import queue
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from config import REPO_ROOT

CODEX_PROMPT = """You are an end-to-end product verification agent testing a local
non-production web application (Quizix Pro, an interactive quiz platform)
through its user interface, like a careful real user.

Your assigned user flow is:

<flow>
{flow_markdown}
</flow>

Application URL: {app_url}
The browser is already open on the flow's starting page.

## How to see and act

You control a real Chromium browser ONLY through this command (run it from the
repo root with Bash):

    python3 tools/luna-e2e/browser_ctl.py <op> [args]

Ops: screenshot | text | url | goto <path> | click <x> <y> | dblclick <x> <y> |
rclick <x> <y> (right-click/context menu) | type <text> | press <key> |
scroll <dy> | wait <ms> | back

- The viewport is {vw}x{vh}{mobile_note}; click coordinates are pixels in the
  screenshot.
{tabs_note}
- `screenshot` prints the path of a fresh PNG — VIEW that image to see the
  screen.
- `text` prints the page's visible text; `url` prints the current URL.
- Always take and view a screenshot before deciding where to click, and after
  meaningful actions to confirm what happened.
- To fill a field: click it, then `type`. `press Enter` submits.

## Rules

- Interact with the app ONLY via browser_ctl.py. Do not curl the app, do not
  call its API, do not read or modify the application source code or its data
  directories, do not use selectors or devtools — behave as a user who only
  sees the screen.
- Do not visit anything outside the application URL.
- Recover from small UI differences rather than assuming exact positions.
- Do not claim PASS merely because you completed clicks: PASS means the
  required outcome was actually observed on screen.
- If the application visibly fails, stop once you have enough evidence.
- Beyond pass/fail, actively note anything a real user would find broken,
  confusing, dead (buttons that do nothing), untranslated, misaligned, or
  slow — report these in `polish_notes` even when the flow PASSES.

## Final answer (required)

End your final message with exactly one JSON object on its own line:

{{"status": "PASS|FAIL|BLOCKED|INCONCLUSIVE", "summary": "<what you did and observed>", "visible_error": "<any error seen or empty>", "repro": "<short repro steps if failed, else empty>", "polish_notes": "<UI/UX issues noticed along the way, or empty>"}}
"""

TABS_NOTE = """- This flow involves MULTIPLE actors (e.g. a quiz host and a player). Extra
  ops let you act as several independent devices:
    tab_open <name>          open a NEW isolated browser tab/device (fresh
                             session, starts on the app home page)
    tab_open <name> mobile   same, but phone-sized (412x915)
    tab <name>               switch which tab your see/act ops target
    tabs                     list tabs (current one marked with *)
  The initial tab is named `main`. screenshot/text/url/click/etc. always act
  on the CURRENT tab. Screenshots include the tab name in their filename."""


class _Bridge:
    """HTTP command bridge: server thread enqueues, browser thread executes."""

    def __init__(self, session, cfg, flow=None, app=None):
        self.session = session
        self.cfg = cfg
        self.flow = flow or {}
        self.app = app
        self.q = queue.Queue()
        self.steps = 0
        bridge = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
                try:
                    cmd = json.loads(body)
                except json.JSONDecodeError:
                    cmd = {}
                done = threading.Event()
                slot = {}
                bridge.q.put((cmd, slot, done))
                done.wait(timeout=60)
                out = slot.get("out", {"ok": False, "error": "browser loop timeout"})
                data = json.dumps(out).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def _exec(self, cmd) -> dict:
        s, cfg = self.session, self.cfg
        op = cmd.get("op")
        args = cmd.get("args", [])
        self.steps += 1
        if self.steps > cfg.max_steps:
            return {"ok": False, "error": f"step limit {cfg.max_steps} reached — wrap up and report"}
        if op == "screenshot":
            s.screenshot("codex")
            return {"ok": True, "result": str(s._last_shot_path)}
        if op == "text":
            txt = s.page.evaluate("document.body.innerText") or ""
            return {"ok": True, "result": txt[:8000]}
        if op == "url":
            return {"ok": True, "result": s.page.url}
        if op == "goto":
            path = args[0] if args else "/"
            if not path.startswith("/"):
                return {"ok": False, "error": "goto takes an app-relative path like /"}
            s.goto(cfg.app_url + path)
            return {"ok": True, "result": s.page.url}
        if op in ("click", "dblclick", "rclick"):
            x, y = int(args[0]), int(args[1])
            if op == "dblclick":
                s.execute({"type": "double_click", "x": x, "y": y})
            else:
                s.execute({"type": "click", "x": x, "y": y,
                           **({"button": "right"} if op == "rclick" else {})})
            return {"ok": True}
        if op == "type":
            s.execute({"type": "type", "text": cmd.get("text", "")})
            return {"ok": True}
        if op == "press":
            s.execute({"type": "keypress", "keys": args[0].split("+")})
            return {"ok": True}
        if op == "scroll":
            s.execute({"type": "scroll", "scroll_y": int(args[0])})
            return {"ok": True}
        if op == "wait":
            s.execute({"type": "wait", "ms": int(args[0])})
            return {"ok": True}
        if op == "back":
            s.page.go_back(wait_until="domcontentloaded")
            return {"ok": True, "result": s.page.url}
        if op == "tabs":
            if not self.flow.get("allow_tabs"):
                return {"ok": False, "error": "tabs not permitted in this flow"}
            names = [f"*{n}" if n == s.current else n for n in s.tabs]
            return {"ok": True, "result": " ".join(names)}
        if op == "tab_open":
            if not self.flow.get("allow_tabs"):
                return {"ok": False, "error": "tab_open not permitted in this flow"}
            if not args:
                return {"ok": False, "error": "usage: tab_open <name> [mobile]"}
            mobile = len(args) > 1 and args[1] == "mobile"
            s.open_tab(args[0], mobile=mobile)
            s.goto(cfg.app_url + "/")
            return {"ok": True, "result": f"tab {args[0]} open on {s.page.url}"}
        if op == "tab":
            if not self.flow.get("allow_tabs"):
                return {"ok": False, "error": "tab switching not permitted in this flow"}
            if not args:
                return {"ok": False, "error": "usage: tab <name>"}
            s.switch_tab(args[0])
            return {"ok": True, "result": f"now on tab {args[0]} at {s.page.url}"}
        return {"ok": False, "error": f"unknown op {op!r}"}

    def pump(self, until):
        """Run on the browser thread: execute queued commands until `until()`."""
        while not until():
            try:
                cmd, slot, done = self.q.get(timeout=0.25)
            except queue.Empty:
                continue
            try:
                slot["out"] = self._exec(cmd)
            except Exception as e:
                slot["out"] = {"ok": False, "error": f"{type(e).__name__}: {e}"}
            done.set()

    def close(self):
        self.server.shutdown()


def run_codex_flow(cfg, flow, session, app=None) -> dict:
    session.goto(cfg.app_url + flow.get("start_path", "/"))
    session.screenshot("initial")
    bridge = _Bridge(session, cfg, flow=flow, app=app)
    last_msg = Path(tempfile.mkstemp(prefix="codex-e2e-", suffix=".txt")[1])
    prompt = CODEX_PROMPT.format(
        flow_markdown=flow["markdown"], app_url=cfg.app_url,
        vw=session.viewport["width"], vh=session.viewport["height"],
        mobile_note=(" (a MOBILE phone screen: touch UI, drawer/overlay "
                     "navigation)" if session.mobile else ""),
        tabs_note=(TABS_NOTE if flow.get("allow_tabs") else
                   "- This flow is single-actor: one tab only."))
    codex_log = session.artifact_dir / "codex.log"
    effort = os.environ.get("E2E_CODEX_EFFORT", "medium")
    model = os.environ.get("E2E_CODEX_MODEL", "")  # e.g. gpt-5.6-luna
    env = {**os.environ, "BROWSER_CTL_PORT": str(bridge.port)}

    proc = subprocess.Popen(
        ["codex", "exec",
         *(["-m", model] if model else []),
         "--sandbox", "workspace-write",
         "-c", "sandbox_workspace_write.network_access=true",
         "-c", f'model_reasoning_effort="{effort}"',
         "--cd", str(REPO_ROOT),
         "--output-last-message", str(last_msg),
         prompt],
        cwd=str(REPO_ROOT), env=env,
        stdout=open(codex_log, "w"), stderr=subprocess.STDOUT,
    )
    deadline = time.time() + cfg.flow_timeout_ms / 1000
    try:
        bridge.pump(until=lambda: proc.poll() is not None or time.time() > deadline)
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
            return {"status": "INCONCLUSIVE", "classification": "AGENT",
                    "summary": f"codex executor hit the {cfg.flow_timeout_ms}ms flow timeout",
                    "steps": bridge.steps}
    finally:
        bridge.close()

    session.screenshot("final")
    text = last_msg.read_text() if last_msg.exists() else ""
    last_msg.unlink(missing_ok=True)
    verdict = None
    for m in re.finditer(r"\{[^{}]*\"status\"[^{}]*\}", text, re.S):
        try:
            verdict = json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    if proc.returncode != 0 and not verdict:
        return {"status": "BLOCKED", "classification": "ENVIRONMENT",
                "summary": f"codex exec exited {proc.returncode}; see codex.log",
                "steps": bridge.steps}
    if not verdict:
        return {"status": "INCONCLUSIVE", "classification": "AGENT",
                "summary": ("no JSON verdict in final message: " + text[:500]),
                "steps": bridge.steps}
    status = str(verdict.get("status", "INCONCLUSIVE")).upper()
    if status not in ("PASS", "FAIL", "BLOCKED", "INCONCLUSIVE"):
        status = "INCONCLUSIVE"
    return {"status": status,
            "classification": "NONE" if status == "PASS" else "UNKNOWN",
            "summary": verdict.get("summary", ""),
            "visible_error": verdict.get("visible_error", ""),
            "repro": verdict.get("repro", ""),
            "polish_notes": verdict.get("polish_notes", ""),
            "steps": bridge.steps}
