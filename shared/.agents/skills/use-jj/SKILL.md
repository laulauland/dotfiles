---
name: use-jj
description: Manage Jujutsu revisions, bookmarks, workspaces, history, selected hunks, megamerges, and durable review comments. Use for version-control work in a jj repository or when the user mentions jj, jj-hunk, megamerges, or jj-review. Use jj instead of git.
---

# Use Jujutsu (jj)

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
| Select hunks non-interactively with `jj-hunk` | [HUNK_SELECTION.md](HUNK_SELECTION.md) |
| Work above or dismantle a local megamerge | [MEGAMERGES.md](MEGAMERGES.md) |
| Record durable, threaded findings with `jj-review` | [REVIEW_COMMENTS.md](REVIEW_COMMENTS.md) |

## Completion Checks

Before finishing jj work, run the relevant checks:

- `jj status`
- `jj log --limit 5`
- For history surgery, verify moved content with `jj diff -r <rev> --stat` and check `jj op log --limit 5` if anything looks wrong.
- For conflicts, confirm `jj log -r 'conflicts()'` is empty.
