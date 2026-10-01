function hr --description "Attach to a remote Herdr server using the server's keybindings (plugin keys work)"
    # Use server-side plugin bindings (herdr-jj).
    herdr --remote-keybindings server $argv
end
