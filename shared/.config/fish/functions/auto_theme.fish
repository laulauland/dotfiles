function auto_theme -d "Auto-detect terminal background and apply matching fish theme"
    set -l bg (term_background)
    set -l current (set -q __fish_theme_applied; and echo $__fish_theme_applied; or echo "")

    # Skip if already applied this mode
    if test "$current" = "$bg"
        return
    end

    switch $bg
        case light
            source ~/.config/fish/colors/alabaster.fish
        case '*'
            source ~/.config/fish/colors/dark.fish
    end

    set -g __fish_theme_applied $bg
end
