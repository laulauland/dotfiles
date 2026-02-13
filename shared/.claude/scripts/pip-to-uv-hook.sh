#!/usr/bin/env bash

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // ""')

# Match pip, pip3, poetry as standalone commands (at start or after chain operators)
if [[ "$command" =~ (^|[[:space:]]&&[[:space:]]|[[:space:]]\|\|[[:space:]]|;[[:space:]]*|\|[[:space:]]*)(pip3?|poetry)[[:space:]] ]]; then
    tool="${BASH_REMATCH[2]}"
    case "$tool" in
        pip|pip3)
            reason="$tool is disabled. Use uv instead:\n  Install a package for a script: uv run --with PACKAGE python script.py\n  Add a dependency to the project: uv add PACKAGE"
            ;;
        poetry)
            reason="poetry is disabled. Use uv instead (uv init, uv add, uv sync, uv run)"
            ;;
    esac
    jq -n \
        --arg reason "$reason" \
        '{
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: $reason
            }
        }'
    exit 0
fi

# Match python/python3 -m pip or -m venv
if [[ "$command" =~ (^|[[:space:]]&&[[:space:]]|[[:space:]]\|\|[[:space:]]|;[[:space:]]*|\|[[:space:]]*)(python3?)[[:space:]] ]]; then
    if [[ "$command" =~ -m[[:space:]]+(pip|venv)([[:space:]]|$) ]] || [[ "$command" =~ -m(pip|venv)([[:space:]]|$) ]]; then
        module="${BASH_REMATCH[1]}"
        case "$module" in
            pip)
                reason="python -m pip is disabled. Use uv instead:\n  Install a package for a script: uv run --with PACKAGE python script.py\n  Add a dependency to the project: uv add PACKAGE"
                ;;
            venv)
                reason="python -m venv is disabled. Use uv instead:\n  Create a virtual environment: uv venv"
                ;;
        esac
    elif [[ "$command" =~ -c[[:space:]] ]]; then
        reason="python -c is disabled. Use uv run python -c instead"
    fi
    if [[ -n "$reason" ]]; then
        jq -n \
            --arg reason "$reason" \
            '{
                hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "deny",
                    permissionDecisionReason: $reason
                }
            }'
        exit 0
    fi
fi
