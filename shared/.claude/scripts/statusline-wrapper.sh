#!/bin/bash

# Read JSON input once
input=$(cat)

# Get jj info from existing script
jj_info=$(echo "$input" | bash ~/.claude/scripts/statusline-command.sh)

# Get context percentage from ccstatusline
context_pct=$(echo "$input" | npx ccstatusline)

# Combine outputs
printf '%s | %s' "$jj_info" "$context_pct"
