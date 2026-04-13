function tw --description 'Tmux session picker - fzf over existing sessions'
    if not tmux list-sessions &>/dev/null
        echo "No tmux sessions running"
        return 1
    end

    set -l selected (tmux list-sessions -F "#{session_name}: #{session_windows} windows (created #{t:session_created})" | fzf --prompt="Switch session: " --height=40% --layout=reverse)

    test -z "$selected"; and return

    set -l name (string split -m1 ":" -- $selected)[1]

    if test -n "$TMUX"
        tmux switch-client -t $name
    else
        tmux attach-session -t $name
    end
end
