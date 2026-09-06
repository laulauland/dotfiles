function term_background -d "Return this terminal's light or dark mode"
    # The terminal owns appearance, including over SSH and inside Herdr.
    if contains -- "$fish_terminal_color_theme" light dark
        echo $fish_terminal_color_theme
    else if contains -- "$TERM_BACKGROUND" light dark
        # Startup fallback for child shells before their first terminal reply.
        echo $TERM_BACKGROUND
    else
        echo dark
    end
end
