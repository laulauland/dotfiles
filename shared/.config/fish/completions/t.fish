# Complete 't' with existing tmux session names
complete -c t -f -a "(tmux list-sessions -F '#{session_name}' 2>/dev/null)"
