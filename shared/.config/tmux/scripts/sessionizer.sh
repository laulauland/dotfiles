#!/usr/bin/env bash

# Sessionizer — pick a project under ~/Code, then switch to (or create) a
# session in the active multiplexer. Detects cmux vs tmux at runtime.

if [[ $# -eq 1 ]]; then
    selected=$1
else
    # Support both ~/Code (macOS) and ~/code (Linux)
    code_dir=~/Code
    [[ -d ~/code ]] && code_dir=~/code

    projects=$(fd -HI --type d --max-depth 3 --prune '.git' "$code_dir" --exec dirname {} | awk '!seen[$0]++')
    selected=$(echo "$projects" | fzf --prompt="Select project: " --height=50% --layout=reverse)
fi

[[ -z $selected ]] && exit 0

selected_name=$(basename "$selected" | tr . _)
selected_abs=$(cd "$selected" 2>/dev/null && pwd -P) || selected_abs=$selected

cmux_switch() {
    local id
    id=$(cmux --json list-workspaces 2>/dev/null \
        | jq -r --arg p "$selected_abs" '.workspaces[] | select(.current_directory == $p) | .ref' \
        | head -n1)
    if [[ -z $id ]]; then
        cmux new-workspace --cwd "$selected_abs" --focus true >/dev/null
    else
        cmux select-workspace --workspace "$id" >/dev/null
    fi
}

tmux_switch() {
    if ! tmux has-session -t="$selected_name" 2>/dev/null; then
        tmux new-session -d -s "$selected_name" -c "$selected"
    fi
    if [[ -n $TMUX ]]; then
        tmux switch-client -t "$selected_name"
    else
        tmux attach-session -t "$selected_name"
    fi
}

if [[ -n $TMUX ]]; then
    tmux_switch
elif [[ -n $CMUX_WORKSPACE_ID ]]; then
    cmux_switch
elif command -v cmux >/dev/null 2>&1; then
    cmux_switch
else
    tmux_switch
fi
