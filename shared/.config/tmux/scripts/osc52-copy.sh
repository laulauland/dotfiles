#!/usr/bin/env bash
set -euo pipefail

# Copy stdin to the local terminal clipboard via OSC52.
# Intended for tmux over SSH/mosh: tmux pipes the selection here, and this
# writes the OSC52 escape directly to the attached client tty.

client_tty="${1:-/dev/tty}"

payload="$(cat)"
encoded="$(printf '%s' "$payload" | base64 | tr -d '\n')"

# Use the system clipboard selector (`c`) and BEL terminator. Mosh supports this
# exact OSC52 form.
printf '\033]52;c;%s\a' "$encoded" > "$client_tty"
