---
name: tmux
description: Tmux terminal multiplexer commands and workflows. Use when managing tmux sessions, windows, panes, or capturing terminal output for debugging.
---

# Tmux Controls

## Listing Sessions, Windows, and Panes

```bash
tmux list-sessions -F '#{session_name}'
tmux list-windows -a -F '#{session_name}:#{window_index} #{window_name}'
tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index} #{pane_id} #{pane_active} #{pane_current_command}'
```

## Capturing Scrollback

### Log Watching

```bash
# Last 2000 lines
tmux capture-pane -t agent:main.0 -p -S -2000 -J

# Search for errors
tmux capture-pane -t agent:main.0 -p -S -50000 -J | rg 'ERROR|FATAL'
```

### Failure Triage

```bash
# Most recent READY
tmux capture-pane -t agent:main.0 -p -S -50000 -J | tac | rg -m1 'READY'

# Capture with 2 lines context
tmux capture-pane -t agent:main.0 -p -S -50000 -J | rg -C2 'failed|timeout'
```

### Report Building

```bash
# Extract block between sentinels
tmux capture-pane -t agent:main.0 -p -S -50000 -J | rg -U -o 'BEGIN<<[\s\S]*?>>END'
```

## Finding Panes by Content

```bash
# Find panes containing a keyword
tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index}' | \
  xargs -I{} sh -c 'tmux capture-pane -t {} -p -S -5000 -J | rg -q "KEYWORD" && echo {}'

# Match by running command
tmux list-panes -a -F '#{pane_id} #{pane_current_command}' | rg '\s(node|python)$'
```

## Creating Windows and Panes

```bash
# New window & split
tmux new-window -t agent -n work
tmux split-window -t agent:work -h

# Send keys to pane
tmux send-keys -t agent:work.0 'echo hello' C-m
```

## capture-pane Flags Reference

| Flag | Description |
|------|-------------|
| `-t` | Target pane (session:window.pane) |
| `-p` | Print to stdout |
| `-S` | Start line (negative = from end) |
| `-J` | Join wrapped lines |
| `-e` | Include escape sequences (colors) |

