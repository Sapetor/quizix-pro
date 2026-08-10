"""Flow spec loader.

A flow is Markdown with simple `key: value` front matter plus one fenced
```json block under '## Deterministic assertions' holding the machine-readable
assertion list. Intent stays in prose for the Luna executor; assertions stay
in JSON for code.
"""
import json
import re
from pathlib import Path

FLOWS_DIR = Path(__file__).resolve().parents[2] / "tests" / "agentic" / "flows"


def load_flow(path: Path) -> dict:
    text = path.read_text()
    flow = {"path": path, "markdown": text, "assertions": []}
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                v = v.strip()
                flow[k.strip()] = {"true": True, "false": False}.get(v.lower(), v)
        flow["markdown"] = text[m.end():]
    jm = re.search(r"## Deterministic assertions.*?```json\n(.*?)```", text, re.S)
    if jm:
        flow["assertions"] = json.loads(jm.group(1))
        # the executor doesn't need to see the assertion internals
        flow["markdown"] = re.sub(r"```json\n.*?```", "(checked by code after the run)",
                                  flow["markdown"], flags=re.S)
    if "id" not in flow:
        flow["id"] = path.stem
    return flow


def load_all() -> list[dict]:
    return [load_flow(p) for p in sorted(FLOWS_DIR.glob("*.md"))]
