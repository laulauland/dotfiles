#!/usr/bin/env bash

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // ""')

# Check if command contains git
if [[ "$command" =~ ^[[:space:]]*git[[:space:]]+(commit|push|pull|checkout|branch|merge|rebase|status|diff|log|add|reset|stash|clone|init|fetch|tag|show|rm|mv|restore|switch|remote|config|clean|cherry-pick|revert|bisect|blame|grep|shortlog|describe|archive|bundle|submodule|worktree|reflog) ]]; then
    jq -n \
        --arg cmd "$command" \
        '{
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: "Git commands are disabled. Use jj instead. See: https://martinvonz.github.io/jj/latest/git-comparison/"
            }
        }'
fi
