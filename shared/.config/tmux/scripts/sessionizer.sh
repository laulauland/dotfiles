#!/usr/bin/env bash

# Tmux Sessionizer - Find git repos and create/switch to tmux sessions

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

if ! tmux has-session -t="$selected_name" 2>/dev/null; then
    tmux new-session -d -s "$selected_name" -c "$selected"
fi

if [[ -n $TMUX ]]; then
    tmux switch-client -t "$selected_name"
else
    tmux attach-session -t "$selected_name"
fi
