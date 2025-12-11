#!/bin/bash

# Read JSON input once
input=$(cat)

# DEBUG: Uncomment to see available JSON fields
# echo "$input" > /tmp/claude-statusline-debug.json

# Get jj info from existing script
jj_info=$(echo "$input" | bash ~/.claude/scripts/statusline-command.sh)

# Calculate context percentage from context_window data
# Note: Claude Code only exposes cumulative session totals, not current context
# After compaction/clear, these don't reset - they track total session usage
total_input=$(echo "$input" | sed -n 's/.*"total_input_tokens":\s*\([0-9]*\).*/\1/p')
total_output=$(echo "$input" | sed -n 's/.*"total_output_tokens":\s*\([0-9]*\).*/\1/p')
context_size=$(echo "$input" | sed -n 's/.*"context_window_size":\s*\([0-9]*\).*/\1/p')

# Calculate tokens used and percentage
if [ -n "$total_input" ] && [ -n "$total_output" ] && [ -n "$context_size" ] && [ "$context_size" -gt 0 ]; then
  total_tokens=$((total_input + total_output))
  percentage=$((total_tokens * 100 / context_size))

  # Color code based on usage
  if [ "$percentage" -ge 90 ]; then
    color='\033[01;31m'  # Bright red
  elif [ "$percentage" -ge 75 ]; then
    color='\033[01;33m'  # Bright yellow
  elif [ "$percentage" -ge 50 ]; then
    color='\033[01;36m'  # Bright cyan
  else
    color='\033[01;32m'  # Bright green
  fi

  context_pct=$(printf "${color}%d%%\033[00m \033[90m(%d/%dk)\033[00m" "$percentage" "$total_tokens" "$((context_size / 1000))")
else
  context_pct=$(printf '\033[90m--%%\033[00m')
fi

# Combine outputs
printf '%s \033[90m|\033[00m %s' "$jj_info" "$context_pct"
