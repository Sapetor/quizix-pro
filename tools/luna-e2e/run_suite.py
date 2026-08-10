#!/usr/bin/env python3
"""Run agentic E2E flows, each against a fresh disposable Quizix instance.

Usage:
    python3 tools/luna-e2e/run_suite.py                 # all flows, Luna executor
    python3 tools/luna-e2e/run_suite.py --scripted      # harness self-test, no LLM
    python3 tools/luna-e2e/run_suite.py --executor codex --jobs 3
    python3 tools/luna-e2e/run_suite.py host-lobby full-game
Exit status is nonzero if any critical flow has a PRODUCT-classified failure.
"""
import argparse
import dataclasses
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import E2EConfig, REPO_ROOT
from app_env import TestApp
from playwright_actions import BrowserSession
from flows import load_all
from assertions import run_assertions
from report import write_flow_report, write_summary

TRANSIENT_MARKERS = ("did not become healthy", "browser", "Timeout", "ECONNREFUSED")


def run_one(cfg: E2EConfig, flow: dict, flow_dir: Path, executor: str) -> tuple[dict, list[dict]]:
    app = TestApp(cfg)
    session = None
    try:
        app.start()
        app.seed()
        from seeds import SEEDS
        seed_fn = SEEDS.get(flow["id"])
        if seed_fn:
            seed_fn(app, cfg, flow_dir)
        extra = set(cfg.cdn_hosts) if flow.get("allow_cdn") else set()
        session = BrowserSession(cfg, flow_dir, extra_hosts=extra,
                                 mobile=flow.get("viewport") == "mobile")
        if executor == "scripted":
            from scripted_executors import EXECUTORS
            fn = EXECUTORS.get(flow["id"])
            if fn is None:
                result = {"status": "BLOCKED", "classification": "HARNESS",
                          "summary": f"no scripted executor for {flow['id']}", "steps": 0}
            else:
                result = fn(session, cfg, app)
        elif executor == "codex":
            from codex_executor import run_codex_flow
            result = run_codex_flow(cfg, flow, session, app=app)
        else:
            from luna_client import run_luna_flow
            result = run_luna_flow(cfg, flow, session)

        assertion_results = run_assertions(flow, app, session, cfg)
        result["console_error_count"] = len(session.console_errors)
        result["http_5xx_count"] = len(session.http_failures)
        result["blocked_nav_count"] = len(session.blocked_navigations)
        result["final_url"] = session.page.url
        # deterministic precedence: assertions override the executor's opinion
        if assertion_results:
            if any(not a["ok"] for a in assertion_results):
                result["status"] = "FAIL"
                result["classification"] = "PRODUCT"
            elif result["status"] not in ("BLOCKED", "INCONCLUSIVE"):
                result["status"] = "PASS"
                result["classification"] = "NONE"
        return result, assertion_results
    except Exception as e:
        return ({"status": "BLOCKED",
                 "classification": "ENVIRONMENT" if any(m in str(e) for m in TRANSIENT_MARKERS)
                 else "HARNESS",
                 "summary": f"{type(e).__name__}: {e}", "steps": 0}, [])
    finally:
        if session:
            try:
                session.close()
            except Exception:
                pass
        app.stop()


def run_flow_with_retry(cfg, flow, run_dir, executor):
    flow_dir = run_dir / flow["id"]
    flow_dir.mkdir(parents=True, exist_ok=True)
    attempts = 1
    result, asserts = run_one(cfg, flow, flow_dir, executor)
    first_status = result["status"]
    if result["status"] == "BLOCKED" and result.get("classification") == "ENVIRONMENT" \
            and "OPENAI_API_KEY" not in result.get("summary", ""):
        attempts = 2
        time.sleep(2)
        result, asserts = run_one(cfg, flow, flow_dir, executor)
        if result["status"] == "PASS" and first_status != "PASS":
            result["status"] = "FLAKY"
    write_flow_report(flow_dir, flow, result, asserts, executor, attempts)
    print(f"=== {flow['id']} -> {result['status']} "
          f"({result.get('classification', 'NONE')}): "
          f"{result.get('summary', '')[:120]}")
    return {"flow": flow["id"], "priority": flow.get("priority", "?"),
            "status": result["status"],
            "classification": result.get("classification", "NONE"),
            "attempts": attempts,
            "_critical_fail": (result["status"] == "FAIL"
                               and result.get("classification") == "PRODUCT"
                               and flow.get("priority") == "critical")}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("flows", nargs="*", help="flow ids to run (default: all)")
    ap.add_argument("--executor", choices=["luna", "codex", "scripted"], default="luna",
                    help="luna: OpenAI Responses API (needs OPENAI_API_KEY); "
                         "codex: local Codex CLI (ChatGPT-plan auth); "
                         "scripted: deterministic self-test, no LLM")
    ap.add_argument("--scripted", action="store_true",
                    help="shorthand for --executor scripted")
    ap.add_argument("--jobs", type=int, default=1,
                    help="flows to run in parallel (each gets its own app port)")
    args = ap.parse_args()
    executor = "scripted" if args.scripted else args.executor

    base_cfg = E2EConfig()
    run_id = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    run_dir = base_cfg.artifact_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    all_flows = load_all()
    if args.flows:
        all_flows = [f for f in all_flows if f["id"] in args.flows]
    if not all_flows:
        print("no flows matched", file=sys.stderr)
        return 2

    meta = {
        "branch": subprocess.run(["git", "branch", "--show-current"], cwd=REPO_ROOT,
                                 capture_output=True, text=True).stdout.strip(),
        "commit": subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO_ROOT,
                                 capture_output=True, text=True).stdout.strip(),
        "app_url": base_cfg.app_url + (" (+N per parallel flow)" if args.jobs > 1 else ""),
        "executor": executor,
        "started": datetime.now(timezone.utc).isoformat(),
    }

    # each flow gets a distinct port so runs never collide, jobs or not
    jobs = max(1, args.jobs)
    tasks = [(dataclasses.replace(base_cfg, app_port=base_cfg.app_port + i), f)
             for i, f in enumerate(all_flows)]
    if jobs == 1:
        rows = [run_flow_with_retry(cfg, f, run_dir, executor) for cfg, f in tasks]
    else:
        with ThreadPoolExecutor(max_workers=jobs) as pool:
            rows = list(pool.map(
                lambda t: run_flow_with_retry(t[0], t[1], run_dir, executor), tasks))

    exit_bad = any([r.pop("_critical_fail", False) for r in rows])
    meta["completed"] = datetime.now(timezone.utc).isoformat()
    print("\n" + write_summary(run_dir, meta, rows))
    print(f"artifacts: {run_dir}")
    return 1 if exit_bad else 0


if __name__ == "__main__":
    sys.exit(main())
