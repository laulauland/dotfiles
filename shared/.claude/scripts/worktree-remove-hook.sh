#!/usr/bin/env bash
#
# WorktreeRemove hook — tear down the pando workspace that
# worktree-create-hook.sh stood up. Side-effect only: no stdout contract.
#
# Fires at session exit or when a subagent finishes and Claude has decided to
# remove the worktree. To avoid destroying the wrong directory on a misparse,
# this only removes a workspace pando actually knows about.

set -uo pipefail

input=$(cat)
name=$(printf '%s' "$input" | jq -r '.worktree_name // .name // empty')
path=$(printf '%s' "$input" | jq -r '.worktree_path // .path // .cwd // empty')

# Recover the name from the path if the event didn't carry one:
# pando workspaces live at <state>/pando/<name>/workspace.
if [[ -z "$name" && "$path" =~ /pando/([^/]+)/workspace/?$ ]]; then
  name="${BASH_REMATCH[1]}"
fi

if [[ -n "$name" ]] && command -v pando >/dev/null 2>&1; then
  if pando info --json "$name" >/dev/null 2>&1; then
    pando remove "$name" >/dev/null 2>&1 || true
  fi
fi

exit 0
