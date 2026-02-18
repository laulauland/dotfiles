function term_background -d "Detect terminal background: light or dark"
    # Fallback order:
    # 1) Explicit override via DFT_BACKGROUND
    # 2) macOS appearance
    # 3) dark
    set -l fallback ""

    if set -q DFT_BACKGROUND
        set -l dft_bg (string lower -- $DFT_BACKGROUND)
        if contains -- $dft_bg light dark
            set fallback $dft_bg
        end
    end

    if test -z "$fallback"; and test (uname) = "Darwin"
        set -l appearance (defaults read -g AppleInterfaceStyle 2>/dev/null)
        if test "$appearance" = "Dark"
            set fallback dark
        else
            set fallback light
        end
    end

    if test -z "$fallback"
        set fallback dark
    end

    # Only send OSC 11 query to terminal emulators known to support it.
    # Over SSH (e.g. Zed remote dev), the response leaks into the PTY and
    # corrupts OS-detection output. Whitelist real local terminals only.
    if not contains -- "$TERM_PROGRAM" ghostty iTerm.app Apple_Terminal kitty alacritty WezTerm tmux
        echo $fallback
        return
    end

    # Need a controlling TTY for OSC query
    command tty -s >/dev/null 2>&1
    or begin
        echo $fallback
        return
    end

    # Use stty to read raw terminal response without echo
    set -l old_settings (command stty -g </dev/tty 2>/dev/null)
    if test -z "$old_settings"
        echo $fallback
        return
    end

    command stty raw -echo min 0 time 5 </dev/tty 2>/dev/null

    # Send OSC 11 query
    printf '\e]11;?\e\\' >/dev/tty

    # Read response directly
    set -l response ""
    set response (dd bs=256 count=1 </dev/tty 2>/dev/null)

    # Restore terminal settings
    command stty $old_settings </dev/tty 2>/dev/null

    # Parse rgb:RRRR/GGGG/BBBB
    set -l parts (string match -r 'rgb:([0-9a-fA-F]+)/([0-9a-fA-F]+)/([0-9a-fA-F]+)' -- $response)
    or begin
        echo $fallback
        return
    end

    set -l r_hex $parts[2]
    set -l g_hex $parts[3]
    set -l b_hex $parts[4]

    # Convert to 0-255 (terminals may send 2 or 4 hex digits)
    set -l r (math "0x$r_hex")
    set -l g (math "0x$g_hex")
    set -l b (math "0x$b_hex")

    if test (string length $r_hex) -ge 4
        set r (math "$r / 256")
        set g (math "$g / 256")
        set b (math "$b / 256")
    end

    # Perceived luminance (ITU-R BT.601)
    set -l luminance (math "0.299 * $r + 0.587 * $g + 0.114 * $b")

    if test (math "$luminance") -gt 128
        echo light
    else
        echo dark
    end
end
