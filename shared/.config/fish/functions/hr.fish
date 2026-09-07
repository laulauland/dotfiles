function hr --description "Attach to a remote Herdr server using the server's keybindings (plugin keys work)"
    # Default to gondor; --remote-keybindings server makes server-side plugin
    # bindings (herdr-annotate prefix+a/m, herdr-jj prefix+g / prefix+shift+g) apply. Local
    # capture via prefix+a still needs upstream herdr#3380 fixed — use nvim
    # <leader>ha inside a remote pane to hand a selection to the plugin.
    if test (count $argv) -eq 0
        herdr --remote gondor --remote-keybindings server $argv
    else
        herdr --remote $argv --remote-keybindings server
    end
end
