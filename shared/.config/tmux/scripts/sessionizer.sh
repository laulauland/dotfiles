#!/usr/bin/env bash

# Tmux Sessionizer - Find git repos and create/switch to tmux sessions

# Find git repositories using fd
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

# Get session name from project directory
selected_name=$(basename "$selected" | tr . _)

# Create session if it doesn't exist
if ! tmux has-session -t="$selected_name" 2>/dev/null; then
    tmux new-session -d -s "$selected_name" -c "$selected"
fi

# Switch to session
if [[ -z $TMUX ]]; then
    tmux attach-session -t "$selected_name"
else
    tmux switch-client -t "$selected_name"
fi
