#!/usr/bin/env bash

# Session picker - fzf over tmux sessions, auto-selects on single match

set -e

sessions=$(tmux list-sessions -F "#{session_name}" | grep -v '^_link_' | sort)
[[ -z "$sessions" ]] && exit 0

selected=$(echo "$sessions" | \
    fzf --exact --sync --prompt="Switch session: " --height=100% --layout=reverse --select-1 --bind 'one:accept')

[[ -z "$selected" ]] && exit 0

# Create a linked session for independent window tracking, auto-destroys on detach
linked="_link_${selected}_$$"
tmux new-session -d -t "$selected" -s "$linked"
tmux switch-client -t "$linked"
tmux set-option -t "$linked" destroy-unattached on
