function hr --description "Attach to a remote Herdr server using the server's keybindings (plugin keys work)"
    # Use server-side plugin bindings (herdr-annotate and herdr-jj).
    # capture via prefix+a still needs upstream herdr#3380 fixed — use nvim
    # <leader>ha inside a remote pane to hand a selection to the plugin.
    herdr --remote-keybindings server $argv
end
