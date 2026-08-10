"""Configuration for the Quizix Luna E2E harness. All values env-overridable."""
import os
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


@dataclass
class E2EConfig:
    luna_model: str = os.environ.get("LUNA_MODEL", "gpt-5.6-luna")
    app_host: str = "127.0.0.1"
    # 3000/3001/3009/3010/3210/3400 are taken or shadowed on this machine;
    # the harness allocates app_port + flow-index when running with --jobs.
    app_port: int = int(os.environ.get("E2E_APP_PORT", "8931"))
    artifact_dir: Path = field(
        default_factory=lambda: REPO_ROOT / os.environ.get("E2E_ARTIFACT_DIR", ".artifacts/luna-e2e")
    )
    max_steps: int = int(os.environ.get("E2E_MAX_STEPS", "80"))
    flow_timeout_ms: int = int(os.environ.get("E2E_FLOW_TIMEOUT_MS", "420000"))
    viewport = {"width": 1280, "height": 720}
    # Pixel-class Android phone. device_scale_factor stays 1 so screenshot
    # pixels == CSS pixels — the agent reads click coordinates off screenshots.
    mobile_viewport = {"width": 412, "height": 915}
    mobile_user_agent = (
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36")
    reasoning_effort: str = os.environ.get("E2E_REASONING_EFFORT", "high")

    # Synthetic test identities (never production credentials)
    test_username: str = "lunatester"
    test_password: str = "luna-test-pass-1"
    test_quiz_title: str = "E2E Test Quiz"

    @property
    def app_url(self) -> str:
        return f"http://{self.app_host}:{self.app_port}"

    @property
    def allowed_hosts(self) -> set[str]:
        return {f"{self.app_host}:{self.app_port}", self.app_host}

    # CDN hosts index.html references (MathJax, Chart.js, socket.io fallback,
    # fonts). Flows opt in via `allow_cdn: true` frontmatter. NOTE: socket.io
    # is normally served from the app itself; cdn.socket.io is a fallback.
    cdn_hosts: frozenset = frozenset({
        "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "cdn.socket.io",
        "fonts.googleapis.com", "fonts.gstatic.com",
    })
