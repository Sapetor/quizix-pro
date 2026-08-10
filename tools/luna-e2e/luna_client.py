"""Luna executor: the OpenAI Responses API computer-use loop.

The model is the brain; playwright_actions.BrowserSession is the hands.
If OPENAI_API_KEY or the openai SDK is missing, run_luna_flow returns a
BLOCKED result instead of raising, so the suite can still report cleanly.

NOTE: multi-actor (allow_tabs) flows are only supported by the codex
executor — the computer-use tool has no tab-switch verb. Run those with
`--executor codex`.
"""
import base64
import os
import time

TESTER_PROMPT = """You are an end-to-end product verification agent.

You are testing a non-production application through its user interface.

Your assigned user flow is:

<flow>
{flow_markdown}
</flow>

Application URL:
{app_url}

Your role:
- Behave like a careful real user.
- Inspect the current screen before acting.
- Use only the browser/computer interface provided to you.
- Find the correct UI path yourself.
- Complete the user goal if possible.
- Recover from small UI differences rather than assuming exact coordinates.
- Observe errors, broken states, confusing behavior, missing controls, bad navigation, stale state, and failed persistence.
- Do not modify source code. Do not use shell access.
- Do not call hidden/internal application APIs unless the flow explicitly permits it.
- Do not access unrelated websites. Do not expose or search for credentials.
- Do not perform irreversible real-world actions.

Evidence:
- Ensure the final UI state clearly demonstrates the result when possible.
- If the application visibly fails, stop once enough evidence exists to reproduce the failure.
- Distinguish product failure from browser/test-harness failure.
- Do not claim PASS merely because you completed clicks. PASS means the required outcome was actually observed.

At the end, return a concise structured conclusion containing:
- status: PASS | FAIL | BLOCKED | INCONCLUSIVE
- short summary
- final observed state
- any visible error
- likely reproduction steps
"""


def run_luna_flow(cfg, flow, session) -> dict:
    """Drive one flow with a Luna executor. Returns an executor-result dict."""
    if flow.get("allow_tabs"):
        return {"status": "BLOCKED", "classification": "HARNESS",
                "summary": "multi-actor flow: run with --executor codex", "steps": 0}
    if not os.environ.get("OPENAI_API_KEY"):
        return {"status": "BLOCKED", "classification": "ENVIRONMENT",
                "summary": "OPENAI_API_KEY not set; Luna executor unavailable.",
                "steps": 0}
    try:
        from openai import OpenAI
    except ImportError:
        return {"status": "BLOCKED", "classification": "ENVIRONMENT",
                "summary": "openai SDK not installed (pip install openai).",
                "steps": 0}

    client = OpenAI()
    session.goto(cfg.app_url + flow.get("start_path", "/"))
    session.screenshot("initial")

    prompt = TESTER_PROMPT.format(flow_markdown=flow["markdown"], app_url=cfg.app_url)
    deadline = time.time() + cfg.flow_timeout_ms / 1000
    steps = 0

    response = client.responses.create(
        model=cfg.luna_model,
        reasoning={"effort": cfg.reasoning_effort},
        tools=[{"type": "computer",
                "display_width": session.viewport["width"],
                "display_height": session.viewport["height"],
                "environment": "browser"}],
        input=prompt,
        truncation="auto",
    )

    final_text = ""
    while True:
        calls = [item for item in response.output if item.type == "computer_call"]
        texts = [item for item in response.output if item.type == "message"]
        if texts:
            final_text = "".join(
                c.text for m in texts for c in m.content if getattr(c, "text", None))
        if not calls:
            break
        if steps >= cfg.max_steps:
            return {"status": "INCONCLUSIVE", "classification": "AGENT",
                    "summary": f"step limit {cfg.max_steps} reached", "steps": steps,
                    "final_text": final_text}
        if time.time() > deadline:
            return {"status": "INCONCLUSIVE", "classification": "AGENT",
                    "summary": "flow wall-clock timeout", "steps": steps,
                    "final_text": final_text}
        call = calls[0]
        try:
            session.execute(call.action.model_dump()
                            if hasattr(call.action, "model_dump") else dict(call.action))
        except ValueError as e:
            # invalid/blocked action: report back to the model rather than dying
            session.action_log.append({"t": time.time(), "rejected": str(e)})
        steps += 1
        shot = session.screenshot(f"step{steps}")
        response = client.responses.create(
            model=cfg.luna_model,
            previous_response_id=response.id,
            tools=[{"type": "computer",
                    "display_width": session.viewport["width"],
                    "display_height": session.viewport["height"],
                    "environment": "browser"}],
            input=[{
                "type": "computer_call_output",
                "call_id": call.call_id,
                "output": {
                    "type": "computer_screenshot",
                    "image_url": "data:image/png;base64," + base64.b64encode(shot).decode(),
                },
            }],
            truncation="auto",
        )

    session.screenshot("final")
    status = "INCONCLUSIVE"
    up = final_text.upper()
    for s in ("PASS", "FAIL", "BLOCKED", "INCONCLUSIVE"):
        if f"STATUS: {s}" in up or f"**STATUS:** {s}" in up:
            status = s
            break
    return {"status": status, "classification": "NONE" if status == "PASS" else "UNKNOWN",
            "summary": final_text[:2000], "steps": steps, "final_text": final_text}
