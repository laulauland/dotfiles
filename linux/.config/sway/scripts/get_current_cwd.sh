#!/usr/bin/env bash

get_current_cwd() {
	focused_pid=$(swaymsg -t get_tree | jq -r '.. | select(.focused==true and .app_id=="foot")? | .pid') || { echo "Error: swaymsg failed" >&2; exit 1; }

	if [ -n "$focused_pid" ]; then
		shell_pid=$(pgrep -P $focused_pid | head -n 1)
		[ -n "$shell_pid" ] && readlink /proc/"$shell_pid"/cwd || echo "$HOME" 
	else
		echo "$HOME"
	fi
}

