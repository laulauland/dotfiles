function notify --description "Send a terminal notification (OSC 9/777)"
    set -l title "Terminal"
    set -l body (string join " " $argv)
    
    if test -z "$body"
        set body "Done"
    end
    
    # Use OSC 777 (rxvt-style) which has explicit title;body format
    # Format: ESC ] 777 ; notify ; title ; body ST
    # This is more reliable than OSC 9 which can conflict with ConEmu extensions
    
    # Inside tmux, wrap OSC sequences in DCS passthrough
    if set -q TMUX
        printf '\ePtmux;\e\e]777;notify;%s;%s\a\e\\' "$title" "$body"
    else
        printf '\e]777;notify;%s;%s\a' "$title" "$body"
    end
end
