"""Boot a disposable Quizix Pro instance for one E2E flow.

Quizix stores quizzes/, results/ and public/uploads relative to process.cwd()
(static assets and index.html resolve via __dirname). So isolation = run
`node <repo>/server.js` from a temp cwd that has fresh quizzes/ + results/
dirs and a `public/` made of symlinks to the real public assets, with a
fresh real uploads/ dir. Nothing here ever touches the repo's quizzes/,
results/ or uploads.
"""
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

from config import E2EConfig, REPO_ROOT

# Generous time limits so an LLM agent (or a human) can keep up with the game.
BASE_QUIZ_QUESTIONS = [
    {"question": "What is 2 + 2?", "type": "multiple-choice",
     "options": ["3", "4", "5", "22"], "correctAnswer": 1,
     "difficulty": "easy", "timeLimit": 60,
     "explanation": "2 + 2 = 4."},
    {"question": "The sky is blue on a clear day.", "type": "true-false",
     "options": ["True", "False"], "correctAnswer": "true",
     "difficulty": "easy", "timeLimit": 60,
     "explanation": "Rayleigh scattering makes it blue."},
]


class TestApp:
    def __init__(self, cfg: E2EConfig):
        self.cfg = cfg
        self.tmpdir: str | None = None
        self.proc = None
        self.quiz_filename = None  # filename of the seeded base quiz
        self.token = None          # JWT of the seeded test user, if login works

    # ---- API helper (seeding/assertions only; the executor never uses it) ---
    def _api(self, method: str, path: str, body: dict | None = None,
             token: str | None = None):
        req = urllib.request.Request(
            f"{self.cfg.app_url}{path}",
            data=json.dumps(body).encode() if body is not None else None,
            method=method,
            headers={
                "Content-Type": "application/json",
                **({"Authorization": f"Bearer {token}"} if token else {}),
            },
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read()
            return json.loads(data) if data else None

    def start(self):
        self.tmpdir = tempfile.mkdtemp(prefix="luna-e2e-quizix-")
        root = Path(self.tmpdir)
        (root / "quizzes").mkdir()
        (root / "results").mkdir()
        # public/: symlink every real asset, but give uploads a fresh real dir
        pub = root / "public"
        pub.mkdir()
        for entry in (REPO_ROOT / "public").iterdir():
            if entry.name != "uploads":
                (pub / entry.name).symlink_to(entry)
        (pub / "uploads").mkdir()

        env = {
            "PATH": os.environ.get("PATH", ""),
            "HOME": os.environ.get("HOME", ""),
            "PORT": str(self.cfg.app_port),
            # NODE_ENV deliberately unset -> dev mode, BASE_PATH '/'
        }
        self.proc = subprocess.Popen(
            ["node", str(REPO_ROOT / "server.js")],
            cwd=self.tmpdir,
            env=env,
            stdout=open(root / "server.log", "w"),
            stderr=subprocess.STDOUT,
        )
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                self._api("GET", "/health")
                return
            except (urllib.error.URLError, ConnectionError, OSError):
                if self.proc.poll() is not None:
                    raise RuntimeError(
                        f"app exited early; see {self.tmpdir}/server.log")
                time.sleep(0.3)
        raise RuntimeError("app did not become healthy within 30s")

    def seed(self):
        """Seed one playable quiz and one registered user account.

        Quizzes MUST be registered via POST /api/save-quiz — files dropped
        into quizzes/ are invisible to the picker (no rescan on restart).
        """
        res = self._api("POST", "/api/save-quiz", {
            "title": self.cfg.test_quiz_title,
            "questions": BASE_QUIZ_QUESTIONS,
        })
        self.quiz_filename = res.get("filename") if isinstance(res, dict) else None
        self._api("POST", "/api/auth/signup", {
            "username": self.cfg.test_username,
            "password": self.cfg.test_password,
        })
        try:
            login = self._api("POST", "/api/auth/login", {
                "username": self.cfg.test_username,
                "password": self.cfg.test_password,
            })
            if isinstance(login, dict):
                self.token = login.get("token") or login.get("access_token")
        except urllib.error.HTTPError:
            self.token = None  # login-by-API optional; flows log in via UI

    def save_quiz(self, title: str, questions: list, **extra) -> dict:
        return self._api("POST", "/api/save-quiz",
                         {"title": title, "questions": questions, **extra})

    def save_results(self, payload: dict) -> dict:
        return self._api("POST", "/api/save-results", payload)

    # ---- filesystem evidence for assertions --------------------------------
    # quizzes/ also holds bookkeeping files that are not quizzes
    _NON_QUIZ = {"users.json", "quiz-metadata.json"}

    def quiz_files(self) -> list[Path]:
        return sorted(p for p in Path(self.tmpdir, "quizzes").glob("*.json")
                      if p.name not in self._NON_QUIZ)

    def results_files(self) -> list[Path]:
        return sorted(Path(self.tmpdir, "results").glob("*.json"))

    def dir_contains(self, which: str, text: str) -> bool:
        files = self.quiz_files() if which == "quizzes" else self.results_files()
        return any(text in f.read_text(encoding="utf-8", errors="replace")
                   for f in files)

    def users_contains(self, text: str) -> bool:
        p = Path(self.tmpdir, "quizzes", "users.json")
        return p.is_file() and text in p.read_text(encoding="utf-8", errors="replace")

    def server_log(self) -> str:
        try:
            return (Path(self.tmpdir) / "server.log").read_text()
        except OSError:
            return ""

    def stop(self):
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        if self.tmpdir:
            shutil.rmtree(self.tmpdir, ignore_errors=True)
