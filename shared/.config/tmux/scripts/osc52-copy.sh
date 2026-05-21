#!/usr/bin/env bash
set -euo pipefail

# Copy stdin to the local terminal clipboard via OSC52, using tmux's DCS
# passthrough mechanism (requires `set -g allow-passthrough on` in tmux.conf).
#
# We write the OSC52 escape to the *pane's* tty wrapped in a DCS-tmux passthrough
# envelope. tmux unwraps it and emits the bare OSC52 to the client terminal as
# part of its normal rendering pipeline.
#
# Two important caveats observed (tmux 3.6a on macOS, Ghostty over SSH):
#
#   1. While the pane is in copy-mode, tmux defers processing of new pane-tty
#      input — DCS passthrough sequences arriving then aren't emitted until
#      copy-mode exits. So both `y` and mouse-drag bindings must use
#      `copy-pipe-and-cancel`, not `copy-pipe`.
#
#   2. Even with `-and-cancel`, the post-copy pane redraw briefly drops DCS
#      passthrough arriving during that window. A 50ms sleep sidesteps it.
#
# Works over SSH/mosh to any terminal that honors OSC52 (Ghostty, iTerm2,
# kitty, WezTerm, etc.).
#
# Intended invocation from tmux:
#   bind-key -T copy-mode-vi y \
#     send-keys -X copy-pipe-and-cancel "~/.config/tmux/scripts/osc52-copy.sh #{q:pane_tty}"
#   bind-key -T copy-mode-vi MouseDragEnd1Pane \
#     send-keys -X copy-pipe-and-cancel "~/.config/tmux/scripts/osc52-copy.sh #{q:pane_tty}"

pane_tty="${1:-/dev/tty}"

payload="$(cat)"
encoded="$(printf '%s' "$payload" | base64 | tr -d '\n')"

sleep 0.05

# DCS-tmux envelope: ESC P tmux ; <inner with each ESC doubled> ESC \
# Inner sequence is OSC52: ESC ] 52 ; c ; <base64> BEL
printf '\033Ptmux;\033\033]52;c;%s\a\033\\' "$encoded" > "$pane_tty"
