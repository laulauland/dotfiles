#!/bin/bash

# Read JSON input
input=$(cat)

# Extract values from JSON (without jq)
cwd=$(echo "$input" | sed -n 's/.*"current_dir":"\([^"]*\)".*/\1/p')

# Check if this is a jj repository
if command -v jj >/dev/null 2>&1 && jj -R "$cwd" root >/dev/null 2>&1; then
  # Get repo name relative to Code/code directory
  repo_name=$(echo "$cwd" | sed "s|^.*/[Cc]ode/||")

  # Get current bookmarks (jj equivalent of git branch)
  bookmarks=$(jj -R "$cwd" log -r @ -T 'bookmarks' --no-graph 2>/dev/null | tr '\n' ' ' | sed 's/[[:space:]]*$//')

  # If no bookmarks, try to get nearest ancestor bookmark
  if [ -z "$bookmarks" ] || [ "$bookmarks" = "(no bookmarks)" ]; then
    nearest=$(jj -R "$cwd" log -r 'ancestors(@) & bookmarks()' --limit 1 --no-graph -T 'bookmarks' 2>/dev/null | head -1 | sed 's/[[:space:]]*$//')
    if [ -n "$nearest" ] && [ "$nearest" != "(no bookmarks)" ]; then
      bookmarks="~$nearest"
    else
      bookmarks="(no bookmark)"
    fi
  fi

  # Get status and count changes
  status_output=$(jj -R "$cwd" status 2>/dev/null)

  # Count modified files (lines starting with "M ")
  modified=$(echo "$status_output" | grep "^M " | wc -l | tr -d ' ')

  # Count added files (lines starting with "A ")
  added=$(echo "$status_output" | grep "^A " | wc -l | tr -d ' ')

  # Count removed files (lines starting with "R " or "D ")
  removed=$(echo "$status_output" | grep "^[RD] " | wc -l | tr -d ' ')

  printf '\033[01;34m%s\033[00m \033[90m|\033[00m \033[01;35m%s\033[00m \033[90m|\033[00m M: \033[33m%s\033[00m \033[90m|\033[00m A: \033[32m%s\033[00m \033[90m|\033[00m R: \033[31m%s\033[00m' \
    "$repo_name" "$bookmarks" "$modified" "$added" "$removed"
else
  # Not a jj repo
  printf '\033[01;36m%s\033[00m' "$cwd"
fi
