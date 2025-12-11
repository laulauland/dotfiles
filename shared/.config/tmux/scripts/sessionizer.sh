#!/usr/bin/env bash

# Tmux Sessionizer - Find git repos and create/switch to tmux sessions
# In normal (non-tmux) mode, opens a new Ghostty window instead

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

# Ghostty normal mode: open new window in selected directory
if [[ -z $TMUX ]]; then
    open -na Ghostty.app --args --quit-after-last-window-closed=true --working-directory="$selected"
    exit 0
fi

# Tmux mode: create/switch sessions
selected_name=$(basename "$selected" | tr . _)

if ! tmux has-session -t="$selected_name" 2>/dev/null; then
    tmux new-session -d -s "$selected_name" -c "$selected"
fi

tmux switch-client -t "$selected_name"
