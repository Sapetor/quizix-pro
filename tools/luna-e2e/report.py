"""Per-flow report.md / result.json and suite summary.md writers."""
import json
from pathlib import Path


def write_flow_report(flow_dir: Path, flow: dict, result: dict,
                      assertion_results: list[dict], executor: str, attempts: int):
    checks = "\n".join(
        f"- [{'x' if a['ok'] else ' '}] `{a['name']}` — {a['detail']}"
        for a in assertion_results) or "- (none defined)"
    polish = result.get("polish_notes", "")
    md = f"""# E2E Verification: {flow['id']}

## Result

**Status:** {result['status']}
**Classification:** {result.get('classification', 'NONE')}
**Executor:** {executor}
**Attempts:** {attempts}

## Summary

{result.get('summary', '')}

## Polish notes (agent observations)

{polish or '(none)'}

## Deterministic assertions

{checks}

## Browser/runtime evidence

- Console errors: {result.get('console_error_count', 0)}
- HTTP 5xx: {result.get('http_5xx_count', 0)}
- Blocked navigations: {result.get('blocked_nav_count', 0)}
- Final URL: {result.get('final_url', '?')}
- Steps executed: {result.get('steps', '?')}

## Evidence files

- `screenshots/` — numbered PNGs (initial → final; tab name in filename)
- `trace.zip` — Playwright trace (`playwright show-trace trace.zip`)
- `console.log`, `network.log`
"""
    (flow_dir / "report.md").write_text(md)
    (flow_dir / "result.json").write_text(json.dumps(
        {"flow": flow["id"], "executor": executor, "attempts": attempts,
         **{k: v for k, v in result.items() if k != "final_text"},
         "assertions": assertion_results}, indent=2))


def write_summary(run_dir: Path, meta: dict, rows: list[dict]):
    table = "\n".join(
        f"| {r['flow']} | {r.get('priority', '?')} | {r['status']} | "
        f"{r.get('classification', 'NONE')} | {r['attempts']} |"
        for r in rows)
    totals = {}
    for r in rows:
        totals[r["status"]] = totals.get(r["status"], 0) + 1
    totals_md = "\n".join(f"- {k}: {v}" for k, v in sorted(totals.items()))
    md = f"""# Quizix Luna E2E Verification Summary

## Scope

- Branch: {meta.get('branch', '?')}
- Commit: {meta.get('commit', '?')}
- Application URL: {meta.get('app_url', '?')}
- Executor: {meta.get('executor', '?')}
- Started: {meta.get('started', '?')}
- Completed: {meta.get('completed', '?')}

## Results

| Flow | Priority | Result | Classification | Attempts |
|---|---|---|---|---:|
{table}

## Totals

{totals_md}
"""
    (run_dir / "summary.md").write_text(md)
    return md
