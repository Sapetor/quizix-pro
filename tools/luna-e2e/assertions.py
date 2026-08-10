"""Deterministic post-run assertions. Code decides pass/fail, not the LLM.

Each assertion in a flow spec is {"name": ..., ...args}. Registry functions
receive (app, session, cfg, args) and return (ok: bool, detail: str).
Page assertions accept an optional "tab" arg (default: the tab that was
active when the executor finished).
"""


def _page(session, args):
    tab = args.get("tab")
    if tab:
        session.switch_tab(tab)
    return session.page


def page_contains(app, session, cfg, args):
    text = args["text"]
    n = _page(session, args).locator(f"text={text}").count()
    return n > 0, f"page contains {text!r}: {n} match(es)"


def page_not_contains(app, session, cfg, args):
    text = args["text"]
    n = _page(session, args).locator(f"text={text}").count()
    return n == 0, f"page must NOT contain {text!r}: {n} match(es)"


def element_count_min(app, session, cfg, args):
    n = _page(session, args).locator(args["selector"]).count()
    ok = n >= args.get("min", 1)
    return ok, f"{n} element(s) match {args['selector']!r} (min {args.get('min', 1)})"


def element_visible(app, session, cfg, args):
    loc = _page(session, args).locator(args["selector"]).first
    try:
        ok = loc.is_visible()
    except Exception:
        ok = False
    return bool(ok) == args.get("expected", True), \
        f"{args['selector']!r} visible={ok} (expected {args.get('expected', True)})"


def url_contains(app, session, cfg, args):
    page = _page(session, args)
    ok = args["fragment"] in page.url
    return ok, f"final url {page.url} (must contain {args['fragment']!r})"


def url_not_contains(app, session, cfg, args):
    page = _page(session, args)
    ok = args["fragment"] not in page.url
    return ok, f"final url {page.url} (must not contain {args['fragment']!r})"


def quiz_file_count_min(app, session, cfg, args):
    n = len(app.quiz_files())
    ok = n >= args.get("min", 1)
    return ok, f"{n} quiz file(s) on disk (min {args.get('min', 1)})"


def results_file_count_min(app, session, cfg, args):
    n = len(app.results_files())
    ok = n >= args.get("min", 1)
    return ok, f"{n} results file(s) on disk (min {args.get('min', 1)})"


def quiz_dir_contains(app, session, cfg, args):
    ok = app.dir_contains("quizzes", args["text"])
    return ok, f"quizzes/*.json contains {args['text']!r}: {ok}"


def results_dir_contains(app, session, cfg, args):
    ok = app.dir_contains("results", args["text"])
    return ok, f"results/*.json contains {args['text']!r}: {ok}"


def quiz_dir_not_contains(app, session, cfg, args):
    ok = not app.dir_contains("quizzes", args["text"])
    return ok, f"quizzes/*.json must NOT contain {args['text']!r}: absent={ok}"


def users_file_contains(app, session, cfg, args):
    ok = app.users_contains(args["text"])
    return ok, f"users.json contains {args['text']!r}: {ok}"


def no_console_errors(app, session, cfg, args):
    ignore = args.get("ignore_substrings", [])
    errs = [e for e in session.console_errors
            if not any(s in e for s in ignore)]
    return len(errs) == 0, f"{len(errs)} console error(s): " + "; ".join(errs[:5])


def no_http_5xx(app, session, cfg, args):
    return len(session.http_failures) == 0, \
        f"{len(session.http_failures)} 5xx: " + "; ".join(session.http_failures[:5])


REGISTRY = {f.__name__: f for f in [
    page_contains, page_not_contains, element_count_min, element_visible,
    url_contains, url_not_contains,
    quiz_file_count_min, results_file_count_min,
    quiz_dir_contains, results_dir_contains, quiz_dir_not_contains,
    users_file_contains,
    no_console_errors, no_http_5xx,
]}


def run_assertions(flow, app, session, cfg) -> list[dict]:
    results = []
    for spec in flow.get("assertions", []):
        fn = REGISTRY.get(spec["name"])
        if fn is None:
            results.append({"name": spec["name"], "ok": False,
                            "detail": "unknown assertion"})
            continue
        try:
            ok, detail = fn(app, session, cfg, spec)
        except Exception as e:
            ok, detail = False, f"assertion raised: {e}"
        results.append({"name": spec["name"], "ok": ok, "detail": detail})
    return results
