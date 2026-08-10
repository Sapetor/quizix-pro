#!/usr/bin/env python3
"""Browser control CLI for the Codex executor.

The harness (codex_executor.py) runs a local command bridge; a Codex agent
calls this script to see and drive the flow's browser session. Coordinates
are pixels in the current tab's viewport, as shown in the screenshots.

Usage:
    browser_ctl.py screenshot            -> prints path of a fresh PNG
    browser_ctl.py text                  -> prints visible page text
    browser_ctl.py url                   -> prints current URL
    browser_ctl.py goto <path>           -> navigate within the app (e.g. /)
    browser_ctl.py click <x> <y>
    browser_ctl.py dblclick <x> <y>
    browser_ctl.py rclick <x> <y>       -> right-click (context menu)
    browser_ctl.py type <text...>        -> types into the focused element
    browser_ctl.py press <key>           -> e.g. Enter, Tab, Escape, Control+a
    browser_ctl.py scroll <dy>           -> positive = down
    browser_ctl.py wait <ms>
    browser_ctl.py back
    browser_ctl.py tabs                  -> list tabs (multi-actor flows only)
    browser_ctl.py tab_open <name> [mobile]
    browser_ctl.py tab <name>            -> switch current tab
"""
import json
import os
import sys
import urllib.request


def main():
    port = os.environ.get("BROWSER_CTL_PORT")
    if not port:
        print("BROWSER_CTL_PORT not set — is the harness running?", file=sys.stderr)
        return 2
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    op = sys.argv[1]
    args = sys.argv[2:]
    if op == "type":
        payload = {"op": op, "text": " ".join(args)}
    else:
        payload = {"op": op, "args": args}
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/cmd",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            out = json.loads(resp.read())
    except Exception as e:
        print(f"bridge error: {e}", file=sys.stderr)
        return 1
    if not out.get("ok"):
        print(f"ERROR: {out.get('error')}", file=sys.stderr)
        return 1
    if out.get("result") is not None:
        print(out["result"])
    else:
        print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
