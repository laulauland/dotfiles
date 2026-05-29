#!/usr/bin/env bash
set -eu

# Send a tmux copy-mode selection into an fzf picker, seeded with the selection.
# fzf runs in its own tmux window (not a popup). Browse with a bat preview, then:
#   enter   -> open the pick in nvim IN THIS WINDOW (the fzf window becomes nvim)
#   ctrl-s  -> open the pick in a split next to the ORIGINAL pane; close fzf
#   esc     -> close the fzf window, nothing opened
# No nvim IPC: every open is a fresh nvim.
#
# A selection that looks like a filename (extension, no spaces) seeds an fd file
# finder; anything else (identifiers, routes like /v1/charges) seeds a live rg
# content grep that re-filters as you type.
#
# Two roles in one file:
#   (launcher)  invoked by the tmux binding with the selection on stdin plus the
#               source pane path and id as args. Reads the selection, picks the
#               mode, opens a new tmux window that re-execs this script as --window.
#   --window    runs inside that window; builds and runs the picker.
#
# Bound from tmux.conf:
#   bind-key -T copy-mode-vi C-o send-keys -X copy-pipe-and-cancel \
#     "~/.config/tmux/scripts/fzf-open.sh #{q:pane_current_path} #{pane_id}"

self="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"

if [ "${1:-}" = "--window" ]; then
	query="${FZFOPEN_QUERY:-}"
	mode="${FZFOPEN_MODE:-grep}"
	src_pane="${FZFOPEN_SRC_PANE:-}"

	# ctrl-s splits the original pane (so the file lands next to your work) and
	# lets this fzf window close as the become command exits. Fall back to the
	# fzf window if the source pane id wasn't passed.
	split_target=""
	[ -n "$src_pane" ] && split_target="-t '$src_pane'"

	hdr='enter: this window  ·  ctrl-s: split by original  ·  esc: cancel'

	# $PWD here is the window's cwd (the source pane's path, set by new-window
	# -c below), so relative paths from rg/fd resolve in the opened nvim.
	if [ "$mode" = files ]; then
		fd --type f --hidden --follow --exclude .git --exclude .jj |
			fzf --ansi --query "$query" \
				--preview "bat --color=always --style=numbers {}" \
				--bind "enter:become(nvim {})" \
				--bind "ctrl-s:become(tmux split-window -h $split_target -c '$PWD' nvim {})" \
				--header "$hdr" || true
	else
		RG_PREFIX="rg --column --line-number --no-heading --color=always --smart-case --glob '!.jj'"
		: | fzf --ansi --disabled --query "$query" --delimiter : \
			--bind "start:reload:$RG_PREFIX {q}" \
			--bind "change:reload:sleep 0.1; $RG_PREFIX {q} || true" \
			--preview "bat --color=always --highlight-line {2} {1}" \
			--bind "enter:become(nvim {1} +{2})" \
			--bind "ctrl-s:become(tmux split-window -h $split_target -c '$PWD' nvim {1} +{2})" \
			--header "$hdr" || true
	fi
	exit 0
fi

# --- launcher role ---

src_path="${1:-$PWD}"
src_pane="${2:-}"

# Flatten newlines, then trim surrounding whitespace.
selection="$(cat | tr '\n' ' ')"
selection="${selection#"${selection%%[![:space:]]*}"}"
selection="${selection%"${selection##*[![:space:]]}"}"
[ -z "$selection" ] && exit 0

if [[ "$selection" != *" "* && "$selection" =~ \.[[:alnum:]]+$ ]]; then
	mode=files
else
	mode=grep
fi

exec tmux new-window -c "$src_path" \
	-e "FZFOPEN_MODE=$mode" -e "FZFOPEN_QUERY=$selection" -e "FZFOPEN_SRC_PANE=$src_pane" \
	"$self --window"
