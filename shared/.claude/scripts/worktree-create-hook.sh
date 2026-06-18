#!/usr/bin/env bash
#
# WorktreeCreate hook — back Claude Code worktrees with pando CoW workspaces.
#
# Fires for `claude --worktree`, the EnterWorktree tool, and subagent
# `isolation: worktree`. Replaces git's default worktree logic entirely.
#
# Contract (https://code.claude.com/docs/en/hooks#worktreecreate):
#   - read a JSON event on stdin
#   - print the path to the created working directory on stdout
#   - exit 0 on success; ANY non-zero exit aborts worktree creation
#
# Strategy: pando (carries untracked build/deps state) -> jj workspace ->
# git worktree. The fallbacks keep this hook safe to install globally, even in
# plain-git repositories where pando/jj don't apply.

set -euo pipefail

input=$(cat)
name=$(printf '%s' "$input" | jq -r '.worktree_name // .name // empty')
base_ref=$(printf '%s' "$input" | jq -r '.base_ref // .base // empty')
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')

# Claude usually supplies a name; synthesize a stable one if it didn't.
[[ -n "$name" ]] || name="worktree-$$"

# pando/jj/git all clone the *current* directory, so run from the session cwd.
if [[ -n "$cwd" && -d "$cwd" ]]; then
  cd "$cwd"
fi

emit_path() {
  # Only the path goes to stdout; all tool chatter is routed to stderr.
  printf '%s\n' "$1"
  exit 0
}

# 1) Preferred: pando copy-on-write workspace.
#    base_ref is intentionally not mapped to --from: pando's value is cloning
#    the current working state (dirty tree + untracked artifacts), which is the
#    whole reason to prefer it over a fresh git worktree.
if command -v pando >/dev/null 2>&1; then
  if out=$(pando create "$name" 2>/dev/null); then
    emit_path "$(printf '%s\n' "$out" | tail -n1)"
  fi
  # Name already taken — reuse the existing workspace instead of failing.
  if existing=$(pando info --json "$name" 2>/dev/null | jq -r '.workspace_path // empty') \
     && [[ -n "$existing" ]]; then
    emit_path "$existing"
  fi
fi

# 2) Fallback: native jj workspace under .claude/worktrees/<name>.
if command -v jj >/dev/null 2>&1 && repo_root=$(jj root 2>/dev/null); then
  dest="$repo_root/.claude/worktrees/$name"
  mkdir -p "$(dirname "$dest")"
  if jj workspace add "$dest" >&2; then
    emit_path "$dest"
  fi
fi

# 3) Last resort: plain git worktree, mirroring Claude's default placement.
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  repo_root=$(git rev-parse --show-toplevel)
  dest="$repo_root/.claude/worktrees/$name"
  if git worktree add -b "worktree-$name" "$dest" "${base_ref:-HEAD}" >&2; then
    emit_path "$dest"
  fi
fi

echo "worktree-create-hook: could not create a workspace for '$name'" >&2
exit 1
