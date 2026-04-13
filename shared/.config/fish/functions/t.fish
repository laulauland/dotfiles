function t --description 'Tmux session helper: list sessions or attach/create by name'
    if test (count $argv) -eq 0
        tmux list-sessions 2>/dev/null; or echo "No tmux sessions"
        return
    end

    tmux new-session -A -s $argv[1]
end
