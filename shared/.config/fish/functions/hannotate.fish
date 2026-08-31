function hannotate --description "Capture the focused Herdr pane's selection on gondor via the socket API (no keypress, so the selection survives)"
    # Workaround for herdrdev/herdr#3380: keybound plugin actions never receive
    # selected_text on headless servers, because any keypress clears the
    # selection first. The CLI invoke path reads the selection through Herdr's
    # API instead. Select text in the herdr pane, then run this from the laptop.
    set -l session_env
    if set -q HERDR_SESSION
        set session_env "HERDR_SESSION=$HERDR_SESSION"
    end
    ssh gondor $session_env ~/.local/bin/herdr plugin action invoke annotate.capture $argv
end
