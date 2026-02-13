#!/usr/bin/env bash

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // ""')

PIP_RE='(^|[[:space:](!])([^[:space:]]+/)?pip3?([[:space:]]|$)'
POETRY_RE='(^|[[:space:](!])([^[:space:]]+/)?poetry([[:space:]]|$)'
UV_RUN_RE='^uv[[:space:]]+run([[:space:]]|$)'
PYTHON_RE='(^|[[:space:](!])(command[[:space:]]+)?(env[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*([^[:space:]]+/)?python([23](\.[0-9]+)?)?([[:space:]]|$)'
M_PIP_RE='-m[[:space:]]+pip([[:space:]]|$)|-mpip([[:space:]]|$)'
M_VENV_RE='-m[[:space:]]+venv([[:space:]]|$)|-mvenv([[:space:]]|$)'

emit_deny() {
    local reason="$1"
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
}

trim() {
    local s="$1"
    s="${s#"${s%%[![:space:]]*}"}"
    s="${s%"${s##*[![:space:]]}"}"
    printf '%s' "$s"
}

split_segments() {
    local normalized
    normalized=$(printf '%s' "$1" | tr '\n' ';')
    normalized=$(printf '%s' "$normalized" | sed -E 's/&&/;/g; s/\|\|/;/g; s/\|/;/g')
    printf '%s' "$normalized"
}

if [[ "$command" =~ $PIP_RE ]]; then
    emit_deny "pip is disabled. Use uv instead:\n  Install a package for a script: uv run --with PACKAGE python script.py\n  Add a dependency to the project: uv add PACKAGE"
fi

if [[ "$command" =~ $POETRY_RE ]]; then
    emit_deny "poetry is disabled. Use uv instead (uv init, uv add, uv sync, uv run)"
fi

segments=$(split_segments "$command")
IFS=';' read -r -a parts <<< "$segments"
for raw in "${parts[@]}"; do
    segment=$(trim "$raw")
    [[ -z "$segment" ]] && continue

    if [[ "$segment" =~ $UV_RUN_RE ]]; then
        continue
    fi

    if [[ "$segment" =~ $PYTHON_RE ]]; then
        if [[ "$segment" =~ $M_PIP_RE ]]; then
            emit_deny "python -m pip is disabled. Use uv instead:\n  Install a package for a script: uv run --with PACKAGE python script.py\n  Add a dependency to the project: uv add PACKAGE"
        fi

        if [[ "$segment" =~ $M_VENV_RE ]]; then
            emit_deny "python -m venv is disabled. Use uv instead:\n  Create a virtual environment: uv venv"
        fi

        emit_deny "Direct python/python3 commands are disabled. Use uv instead:\n  Run scripts: uv run python script.py\n  One-off deps: uv run --with PACKAGE python script.py"
    fi
done
