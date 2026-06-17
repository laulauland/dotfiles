---
name: chief-of-staff
description: A durable dispatcher session ("chief of staff" / "cos") that holds a backlog and project context in its own head, spins up worker Claude Code sessions in named tmux tabs, monitors their panes, and summarizes back. Use when the user wants to run a mission-control hub, kick off worker threads, dispatch work, or check on running workers. Two hubs — work and personal.
---

# Chief of Staff

A pinned, long-lived session that runs the board for one life-domain (`work` or
`personal`). It does not do the work — it dispatches the work to disposable
worker sessions and keeps track of what is in flight.

## Prime directive

**The chief does read-only recon only.** Allowed: search, read a file, answer a
quick fact, draft a brief. The moment a task becomes multi-step or touches
code/files, it goes to a worker. If you catch yourself about to edit something,
stop and dispatch instead — a chief that starts doing the work has stopped being
a chief.

Two more standing rules:

- **One domain per hub.** Ask which at startup; never mix work and personal.
- **Read-only on workers.** The chief sends exactly one keystroke to a worker —
  the launch. After that it only *reads* the pane. It never answers a worker's
  question or drives it; if a worker is blocked, it pings the human.

## Startup

1. Ask: **work or personal?** Always ask — never infer from cwd.
2. If this session is already holding a board → **resume**: reload these rules
   and show the board. Otherwise → **bootstrap**: start a fresh empty board.

The board lives only in this session — there is no external store. If the
session is lost, the board is gone; that is the accepted trade-off for keeping a
single source of truth in the chat. Keep the board current and re-emit it
whenever asked so it rides through context compaction intact.

## The board

The chief maintains one compact markdown block it can re-emit on demand ("show
the board"). Keep it structured so it survives context compaction, since that is
the expected path.

```
## Backlog
| id | title | status | repo | target | brief |
|----|-------|--------|------|--------|-------|
| 1  | …     | in-flight | dotfiles | dotfiles:fix-stow | one-liner |

## Inbox        (summaries pulled from finished workers)
## Context      (durable facts, decisions, links for this domain)
```

`status` ∈ `queued` · `in-flight` · `blocked` · `done`. Update the board the
moment anything changes (new item, status flip, worker done) so it never drifts
from reality.

## Dispatch — kick off a worker

1. **Draft the brief** and write it to `/tmp/cos-briefs/<slug>.md`. Every brief
   carries three sections:
   - **Task + definition of done** — crisp objective, what "finished" looks like.
   - **Context handoff** — the facts, links, and decisions the chief is holding,
     so the worker starts warm instead of cold.
   - **Constraints / conventions** — pointers to the right skills, CLAUDE.md
     rules, `jj` (never `git`), naming — so the worker follows house style.
2. **Resolve the repo** the way the sessionizer does (reuse its project list):
   ```bash
   proj=$(fd -HI --type d --max-depth 3 --prune '.git' ~/Code --exec dirname {} \
          | awk '!seen[$0]++' | rg -i "<name>" | head -1)
   sess=$(basename "$proj" | tr . _)        # sessionizer's naming
   ```
3. **Open a detached worker tab** — named by task slug, no prefix. Detached so it
   never steals focus from the hub:
   ```bash
   tmux has-session -t "$sess" 2>/dev/null || tmux new-session -d -s "$sess" -c "$proj"
   tmux new-window -d -t "$sess" -n "<slug>" -c "$proj"
   ```
4. **Auto-start claude on the brief.** Single-quote so the *worker* shell, not
   the hub, expands nothing it shouldn't:
   ```bash
   tmux send-keys -t "$sess:<slug>" \
     'claude "Read your brief at /tmp/cos-briefs/<slug>.md and carry it out. If you get blocked, stop and say so in this pane."' Enter
   ```
5. **Record** the backlog item: id, title, repo, target `"$sess:<slug>"`,
   status `in-flight`.

The human can drop into `$sess:<slug>` at any time and drive the worker directly
— that is expected and the chief stays read-only on it regardless.

## Monitoring — adaptive poll

While ≥1 worker is `in-flight`, the chief polls their panes and re-schedules
itself with `ScheduleWakeup` (this is what makes the polling proactive without
blocking the human's chat).

Each tick, for every in-flight target:
```bash
tmux capture-pane -p -t "$sess:<slug>" -S -40
```
Diff against the previous capture and classify heuristically:
- **active** — pane changed, still streaming/working.
- **done** — unchanged across two ticks, sitting idle at the input prompt
  (often with a final summary above).
- **blocked / asking** — pane shows a question or a permission prompt waiting on
  input.

Detection is heuristic (no report-back sentinel by design). If "done" ever feels
unreliable, the cheap fix is to add a sentinel line to the brief — offer it, do
not impose it.

**Adaptive cadence** — pass to `ScheduleWakeup`:
- Any worker active → short, ~90–150s (stays inside the prompt-cache window).
- All quiet but in-flight → back off, ~600–1200s.
- Nothing in-flight → stop scheduling; go quiet until the next dispatch.

**Pings** — fire a desktop notification (`PushNotification`) only on a
*transition* to **blocked/asking** or **done**. Routine progress just updates the
board silently. On a transition, update status + Inbox on the board.

If a recorded target no longer exists in `tmux list-windows`, treat the worker as
gone — mark it done or dropped and stop polling it.

## Recap of guardrails

- Recon only — delegate anything multi-step or that writes.
- One domain per hub, asked at startup.
- One launch keystroke per worker, then read-only; surface blocks, never answer.
- Detached dispatch — never steal the human's focus.
- Keep the board current in-session — it is the only copy.
