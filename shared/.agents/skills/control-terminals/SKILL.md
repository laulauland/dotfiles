---
name: control-terminals
description: Control terminal sessions with Herdr or tmux. Use Herdr only when the user explicitly names it; use tmux to inspect panes, drive terminal interfaces, or automate terminal UI checks.
---

# Control Terminals

Choose the named terminal system and load its reference before acting:

- For Herdr workspaces, tabs, panes, agents, commands, or waits, read [HERDR.md](HERDR.md). Do not select Herdr merely because background execution could help.
- For tmux sessions, panes, captured output, or terminal UI automation, read [TMUX.md](TMUX.md).

The action is complete only when the requested terminal state or observable output has been verified with the selected tool.
