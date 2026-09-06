function auto_theme --on-variable fish_terminal_color_theme -d "Follow this terminal's color mode"
    set -l bg (term_background)
    set -l current (set -q __fish_theme_applied; and echo $__fish_theme_applied; or echo "")

    # Export the detected mode as a startup fallback for child shells.
    set -gx TERM_BACKGROUND $bg

    # Skip if already applied this mode
    if test "$current" = "$bg"
        return
    end

    switch $bg
        case light
            source $__fish_config_dir/colors/alabaster.fish
        case '*'
            source $__fish_config_dir/colors/dark.fish
    end

    set -g __fish_theme_applied $bg
end
