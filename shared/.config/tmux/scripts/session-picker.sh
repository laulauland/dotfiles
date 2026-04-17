#!/usr/bin/env bash

# Session picker - fzf over tmux sessions, auto-selects on single match

set -e

sessions=$(tmux list-sessions -F "#{session_name}" | sort)
[[ -z "$sessions" ]] && exit 0

selected=$(echo "$sessions" | \
    fzf --exact --sync --prompt="Switch session: " --height=100% --layout=reverse --select-1 --bind 'one:accept')

[[ -z "$selected" ]] && exit 0

tmux switch-client -t "$selected"
