#!/bin/sh
# Returns inactive pane list for a given window: 2:vim 3:htop
# Active pane is already shown via #W in the status format
# Usage: pane-status.sh session:window

target="$1"
tmux list-panes -t "$target" -F '#{pane_active} #{pane_index}:#{pane_current_command}' | grep '^0 ' | cut -d' ' -f2 | tr '\n' ' '
