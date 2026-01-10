#!/usr/bin/env bash
set -euo pipefail

# Claude Code hook scripts receive JSON on stdin.
# See: https://code.claude.com/docs/en/hooks#notification

payload="$(cat)"

notification_type="$(printf '%s' "$payload" | jq -r '.notification_type // empty' 2>/dev/null || true)"
message="$(printf '%s' "$payload" | jq -r '.message // empty' 2>/dev/null || true)"
cwd="$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null || true)"

if [[ -z "$notification_type" && -z "$message" ]]; then
  exit 0
fi

body="Claude"
if [[ -n "$notification_type" ]]; then
  body+=" ($notification_type)"
fi
if [[ -n "$message" ]]; then
  body+=": $message"
fi
if [[ -n "$cwd" ]]; then
  body+=" [$cwd]"
fi

# Prefer writing to the controlling TTY so OSC sequences reach the terminal
# even if Claude captures stdout.
if [[ -w /dev/tty ]]; then
  fish -lc 'notify $argv' -- "$body" > /dev/tty 2>/dev/null || true
else
  fish -lc 'notify $argv' -- "$body" 2>/dev/null || true
fi

exit 0
