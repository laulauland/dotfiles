---
name: rex-subagents
description: Spawn rlm.spawn subagents with a live Rex tab so the user can follow them, and call the Rex server API from Python. Use for long-running or user-watchable subagents when running inside Rex (REX_SESSION set).
---

# Rex subagents

Subagents are always created with `rlm.spawn`. This skill adds a background Rex
tab that runs `prime-agent --resume <child session_id>`, a live viewer of the
daemon session. The child stays my child: `agent_message`, `rlm.collect`, and
`rlm.list_subagents` work. Closing the tab does not stop the child. The user can
type into the tab.

```python
h, win = await rex_subagents(prompt, name="worker")  # = spawn_in_rex; extra kwargs go to rlm.spawn
win = await rex_subagents.watch_in_rex(h)       # tab for an already-spawned child
await rex_subagents.close_rex_window(win)       # on cleanup
await rex_subagents.rex_api("session.view")     # any Rex API method; session.* default to $REX_SESSION
```

`rex_api` wraps `rex api call METHOD @args.json`. Discover methods with
`rex api list` and `rex api describe METHOD --json`. Rex has no Python SDK; do
not talk to its socket directly.

## Rules

- Use it for long-running workers or fan-outs worth watching, not trivial one-shots.
- Keep the handle and window; close the tab when the child is done or deleted.
- A new child receives its prompt only after my turn ends. While I wait in-turn it
  looks idle (messageCount 0). End the turn; do not re-send the task.
