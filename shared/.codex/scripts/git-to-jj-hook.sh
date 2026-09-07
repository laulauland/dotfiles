#!/usr/bin/env bash

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // ""')

# Allow read-only Git inspection (for example log, diff, show, status, grep,
# and blame), but block repository, worktree, config, and remote mutations.
# Matches Git at the start or after shell command-chain operators.
if [[ "$command" =~ (^|[[:space:]]&&[[:space:]]|[[:space:]]\|\|[[:space:]]|;[[:space:]]*|\|[[:space:]]*)git[[:space:]]+(-[a-zA-Z][[:space:]]+[^[:space:]]+[[:space:]]+)*(commit|push|pull|checkout|branch|merge|rebase|add|reset|stash|clone|init|fetch|tag|rm|mv|restore|switch|remote|config|clean|cherry-pick|revert|bisect|archive|bundle|submodule|worktree|reflog|am|apply|gc|maintenance|notes|prune|repack|replace|sparse-checkout|update-index|update-ref)([[:space:]]|$) ]]; then
    jq -n \
        --arg cmd "$command" \
        '{
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: "Git write commands are disabled. Read-only inspection with git log, diff, show, status, grep, and blame is allowed; use jj for changes. See: https://jj-vcs.github.io/jj/latest/git-comparison/"
            }
        }'
fi
