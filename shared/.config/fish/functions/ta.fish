function ta --description 'Tmux attach: last session or by name'
    if test (count $argv) -eq 0
        tmux attach 2>/dev/null; or echo "No tmux sessions"
        return
    end

    tmux new-session -A -s $argv[1]
end
