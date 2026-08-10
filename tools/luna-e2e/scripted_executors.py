"""Deterministic scripted executors — harness self-test only.

These prove the browser/evidence/assertion plumbing works WITHOUT spending
LLM tokens. They are NOT a replacement for the Luna executor: they follow a
fixed selector path instead of behaving like a user. Keyed by flow id.
"""


def _dismiss_tour(session):
    """First visit triggers the onboarding tour; skip it if present."""
    try:
        skip = session.page.locator("#onboarding-skip")
        skip.wait_for(state="visible", timeout=4000)
        skip.click()
        session.page.wait_for_timeout(400)
    except Exception:
        pass


def _host_to_lobby(session, cfg):
    """Landing -> quick start -> select seeded quiz -> launch -> lobby PIN."""
    session.goto(cfg.app_url + "/")
    session.page.wait_for_timeout(1500)
    session.screenshot("landing")
    _dismiss_tour(session)
    session.page.click("#quick-start-btn")
    session.page.wait_for_selector("#quick-start-tree-container", timeout=10000)
    session.page.wait_for_timeout(800)
    session.page.click(f"#quick-start-tree-container >> text={cfg.test_quiz_title}")
    session.page.wait_for_timeout(600)
    session.screenshot("quiz-selected")
    session.page.click("#quick-start-launch")
    session.page.wait_for_selector("#game-pin", timeout=15000)
    session.page.wait_for_timeout(1000)
    session.screenshot("lobby")
    pin = (session.page.text_content("#game-pin") or "").strip()
    return "".join(ch for ch in pin if ch.isdigit())


def flow_host_lobby(session, cfg, app):
    pin = _host_to_lobby(session, cfg)
    ok = len(pin) >= 4
    return {"status": "PASS" if ok else "FAIL",
            "summary": f"lobby reached, PIN displayed: {pin!r}", "steps": 6}


def flow_player_join(session, cfg, app):
    pin = _host_to_lobby(session, cfg)
    if len(pin) < 4:
        return {"status": "FAIL", "summary": f"no PIN in lobby: {pin!r}", "steps": 6}
    session.open_tab("player")
    session.goto(cfg.app_url + "/")
    session.page.wait_for_timeout(1500)
    _dismiss_tour(session)
    session.page.click("#join-btn")
    session.page.wait_for_selector("#game-pin-input", timeout=10000)
    session.page.fill("#game-pin-input", pin)
    session.page.fill("#player-name", "LunaPlayer")
    session.screenshot("join-form")
    session.page.click("#join-game")
    session.page.wait_for_timeout(2500)
    session.screenshot("player-joined")
    session.switch_tab("main")
    session.page.wait_for_timeout(1000)
    session.screenshot("host-lobby-after-join")
    visible = session.page.locator("text=LunaPlayer").count() > 0
    return {"status": "PASS" if visible else "FAIL",
            "summary": f"player visible in host lobby: {visible} (pin {pin})",
            "steps": 12}


EXECUTORS = {
    "host-lobby": flow_host_lobby,
    "player-join": flow_player_join,
}
