"""Run RLM subagents with a live Rex tab view. Rex server API via `rex api call` (no Python SDK)."""
import json, os, tempfile
from rlm import bash, rlm


async def rex_api(method: str, **args):
    """Call a Rex server API method; session.* methods default to this Rex session."""
    if method.startswith("session."):
        args.setdefault("session_id", os.environ["REX_SESSION"])
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(args, f)
    try:
        r = await bash(f"rex api call {method} @{f.name}", yield_after=30)
    finally:
        os.unlink(f.name)
    if r.exit_code != 0:
        raise RuntimeError(r.output)
    return json.loads(r.output) if r.output.strip() else None


async def watch_in_rex(handle, *, focus: bool = False):
    """Open a Rex tab attached live to an existing rlm.spawn child. Returns the new_window result."""
    sid = next(s.session_id for s in await rlm.list_subagents() if s.rlm_child_id == handle.rlm_child_id)
    return await rex_api("session.new_window", window_label=handle.name, focus=focus, layout={"block": {
        "flavor": "com.superlogical.terminal.shell", "label": handle.name,
        "options": {"command": ["prime-agent", "--resume", sid], "cwd": os.getcwd()}}})


async def spawn_in_rex(prompt: str, *, name: str, focus: bool = False, **spawn_kw):
    """rlm.spawn a subagent and open its live Rex tab. Returns (handle, window)."""
    handle = await rlm.spawn(prompt, name=name, **spawn_kw)
    return handle, await watch_in_rex(handle, focus=focus)


run = spawn_in_rex


async def close_rex_window(window):
    await rex_api("session.close_window", window_id=window["window_id"])
