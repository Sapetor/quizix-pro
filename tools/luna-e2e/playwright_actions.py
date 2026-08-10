"""Playwright browser session: the 'hands and eyes' of a Luna executor.

Executes computer actions, enforces the host allowlist, and captures
screenshots, console output, network failures, video, and traces.

Quizix twist: quiz games are inherently multi-actor (a host screen plus
player devices). A session therefore supports named TABS, where each tab is
its own browser CONTEXT (isolated localStorage/session — same-context tabs
would collide because host and player state share the origin). The executor
sees and drives exactly one tab at a time.
"""
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

from config import E2EConfig

KEY_MAP = {
    "ENTER": "Enter", "RETURN": "Enter", "TAB": "Tab", "ESC": "Escape",
    "ESCAPE": "Escape", "BACKSPACE": "Backspace", "DELETE": "Delete",
    "SPACE": " ", "UP": "ArrowUp", "DOWN": "ArrowDown",
    "LEFT": "ArrowLeft", "RIGHT": "ArrowRight",
    "PAGE_UP": "PageUp", "PAGE_DOWN": "PageDown", "HOME": "Home", "END": "End",
    "CTRL": "Control", "ALT": "Alt", "SHIFT": "Shift", "CMD": "Meta",
}


class BrowserSession:
    def __init__(self, cfg: E2EConfig, artifact_dir: Path,
                 extra_hosts: set[str] | None = None, mobile: bool = False):
        self.cfg = cfg
        self.mobile = mobile
        self.viewport = cfg.mobile_viewport if mobile else cfg.viewport
        self.allowed_hosts = set(cfg.allowed_hosts) | (extra_hosts or set())
        self.artifact_dir = artifact_dir
        self.console_lines: list[str] = []
        self.console_errors: list[str] = []
        self.http_failures: list[str] = []
        self.action_log: list[dict] = []
        self.blocked_navigations: list[str] = []
        (artifact_dir / "screenshots").mkdir(parents=True, exist_ok=True)
        self._pw = sync_playwright().start()
        self.browser = self._pw.chromium.launch(
            headless=True,
            chromium_sandbox=False,  # WSL2 has no userns sandbox; app is local & test-only
            env={},
            args=["--disable-extensions"],
        )
        self.tabs: dict[str, dict] = {}
        self.current = "main"
        self._shot_n = 0
        self._open_tab("main", mobile=mobile, trace=True)

    # ---- tabs ---------------------------------------------------------------
    def _open_tab(self, name: str, mobile: bool = False, trace: bool = False):
        vp = self.cfg.mobile_viewport if mobile else self.cfg.viewport
        context = self.browser.new_context(
            viewport=vp,
            record_video_dir=str(self.artifact_dir),
            **({"is_mobile": True, "has_touch": True,
                "user_agent": self.cfg.mobile_user_agent} if mobile else {}),
        )
        if trace:
            context.tracing.start(screenshots=True, snapshots=True)
        page = context.new_page()
        page.on("console", lambda m, tab=name: self._on_console(tab, m))
        page.on("response", self._on_response)
        page.on("pageerror",
                lambda e, tab=name: self.console_errors.append(f"[{tab}] pageerror: {e}"))
        # The app uses native confirm() for logout / delete-quiz; Playwright
        # would silently DISMISS them (looks like a dead button to the agent).
        # Accept instead, and log it so reports show a dialog fired.
        page.on("dialog", lambda d, tab=name: (
            self.console_lines.append(f"[{tab}][dialog:{d.type}] {d.message} -> accepted"),
            d.accept()))
        context.route("**/*", self._enforce_allowlist)
        self.tabs[name] = {"context": context, "page": page,
                           "mobile": mobile, "trace": trace}

    def open_tab(self, name: str, mobile: bool = False):
        if name in self.tabs:
            raise ValueError(f"tab {name!r} already exists")
        self._open_tab(name, mobile=mobile)
        self.current = name

    def switch_tab(self, name: str):
        if name not in self.tabs:
            raise ValueError(f"no such tab {name!r} (have: {sorted(self.tabs)})")
        self.current = name

    @property
    def page(self):
        return self.tabs[self.current]["page"]

    @property
    def current_viewport(self):
        return (self.cfg.mobile_viewport if self.tabs[self.current]["mobile"]
                else self.cfg.viewport)

    def _on_console(self, tab, msg):
        line = f"[{tab}][{msg.type}] {msg.text}"
        self.console_lines.append(line)
        if msg.type == "error":
            self.console_errors.append(line)

    def _on_response(self, resp):
        if resp.status >= 500:
            self.http_failures.append(f"{resp.status} {resp.url}")

    def _enforce_allowlist(self, route):
        from urllib.parse import urlparse
        u = urlparse(route.request.url)
        if u.scheme in ("http", "https") and u.netloc in self.allowed_hosts:
            route.continue_()
        elif u.scheme == "data":
            route.continue_()
        else:
            self.blocked_navigations.append(route.request.url)
            route.abort()

    # ---- computer actions ---------------------------------------------------
    def screenshot(self, label: str = "") -> bytes:
        self._shot_n += 1
        tag = f"-{self.current}" if self.current != "main" else ""
        name = f"{self._shot_n:03d}{tag}{'-' + label if label else ''}.png"
        path = self.artifact_dir / "screenshots" / name
        self._last_shot_path = path
        img = self.page.screenshot(path=str(path))
        return img

    def _check_xy(self, x, y):
        vp = self.current_viewport
        if not (0 <= x <= vp["width"] and 0 <= y <= vp["height"]):
            raise ValueError(f"coordinates out of viewport: ({x},{y})")

    def execute(self, action: dict):
        """Execute one computer-action dict; logs it; returns nothing."""
        t = action.get("type")
        self.action_log.append({"t": time.time(), "tab": self.current, "action": action})
        if t == "screenshot":
            pass  # a fresh screenshot is taken after every batch anyway
        elif t == "click":
            self._check_xy(action["x"], action["y"])
            self.page.mouse.click(action["x"], action["y"],
                                  button=action.get("button", "left"))
        elif t == "double_click":
            self._check_xy(action["x"], action["y"])
            self.page.mouse.dblclick(action["x"], action["y"])
        elif t == "scroll":
            vp = self.current_viewport
            self.page.mouse.move(action.get("x", vp["width"] // 2),
                                 action.get("y", vp["height"] // 2))
            self.page.mouse.wheel(action.get("scroll_x", 0), action.get("scroll_y", 0))
        elif t == "type":
            self.page.keyboard.type(action["text"])
        elif t == "keypress":
            keys = action.get("keys", [])
            mapped = [KEY_MAP.get(k.upper(), k) for k in keys]
            if len(mapped) > 1:
                self.page.keyboard.press("+".join(mapped))
            elif mapped:
                self.page.keyboard.press(mapped[0])
        elif t == "drag":
            path = action.get("path", [])
            if path:
                self.page.mouse.move(path[0]["x"], path[0]["y"])
                self.page.mouse.down()
                for p in path[1:]:
                    self.page.mouse.move(p["x"], p["y"])
                self.page.mouse.up()
        elif t == "move":
            self._check_xy(action["x"], action["y"])
            self.page.mouse.move(action["x"], action["y"])
        elif t == "wait":
            self.page.wait_for_timeout(min(action.get("ms", 1000), 5000))
        else:
            raise ValueError(f"unsupported action type: {t}")
        self.page.wait_for_timeout(150)  # let the UI settle

    def goto(self, url: str):
        self.page.goto(url, wait_until="domcontentloaded")

    def close(self):
        for name, tab in self.tabs.items():
            if tab["trace"]:
                try:
                    tab["context"].tracing.stop(path=str(self.artifact_dir / "trace.zip"))
                except Exception:
                    pass
        (self.artifact_dir / "console.log").write_text("\n".join(self.console_lines))
        (self.artifact_dir / "network.log").write_text(
            "\n".join(self.http_failures + [f"BLOCKED {u}" for u in self.blocked_navigations]))
        try:
            for tab in self.tabs.values():
                tab["context"].close()
            self.browser.close()
        finally:
            self._pw.stop()
