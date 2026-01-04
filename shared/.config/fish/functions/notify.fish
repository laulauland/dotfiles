function notify --description "Send a terminal notification (OSC 9)"
    set -l message (string join " " $argv)
    if test -z "$message"
        set message "Done"
    end
    printf '\e]9;%s\a' "$message"
end
