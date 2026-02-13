function tmux --wraps=tmux --description 'tmux wrapper that ensures config is loaded'
    # The zb build of tmux has a broken config search path (looks at /opt/zb
    # instead of ~/.config/tmux/tmux.conf). Inject -f when starting a new
    # server so the config is always loaded.
    set -l conf "$HOME/.config/tmux/tmux.conf"

    # Only add -f if the user didn't already specify one and the config exists
    if not contains -- -f $argv; and test -f "$conf"
        command tmux -f "$conf" $argv
    else
        command tmux $argv
    end
end
