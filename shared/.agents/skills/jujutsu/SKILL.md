---
name: jujutsu
description: Jujutsu (jj) version control commands and workflows. Use when performing version control operations, committing changes, managing branches/bookmarks, or syncing with remotes. Always use jj instead of git.
---

# Jujutsu (jj) Version Control

Use `jj` instead of `git` for all version control operations. If you are performing version control work, choose the jj command first.

## Start Here

- **Read hazards before history surgery:** [HAZARDS.md](HAZARDS.md)
- **Use only non-interactive forms:** [NON_INTERACTIVE.md](NON_INTERACTIVE.md)

## Branch Table

| When you need to... | Read |
|---|---|
| Avoid working-copy, squash, and revset/template traps | [HAZARDS.md](HAZARDS.md) |
| Run jj commands safely in an agent/non-interactive shell | [NON_INTERACTIVE.md](NON_INTERACTIVE.md) |
| Look up common commands, aliases, bookmarks, sync, and undo | [COMMANDS.md](COMMANDS.md) |
| Use multiple working copies | [WORKSPACES.md](WORKSPACES.md) |
| Squash, split, edit, or resolve conflicts during history rewrites | [HISTORY_REWRITES.md](HISTORY_REWRITES.md) |
| Follow the everyday start/review/push/update flow | [WORKFLOW.md](WORKFLOW.md) |

## Completion Checks

Before finishing jj work, run the relevant checks:

- `jj status`
- `jj log --limit 5`
- For history surgery, verify moved content with `jj diff -r <rev> --stat` and check `jj op log --limit 5` if anything looks wrong.
- For conflicts, confirm `jj log -r 'conflicts()'` is empty.
