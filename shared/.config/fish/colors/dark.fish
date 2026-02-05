#!/usr/bin/env fish
# Tomorrow Night dark theme colors for fish shell
# Matches Ghostty's default dark theme

# Syntax highlighting
set -U fish_color_normal normal
set -U fish_color_command c397d8
set -U fish_color_keyword c397d8
set -U fish_color_quote b9ca4a
set -U fish_color_redirection 70c0b1
set -U fish_color_end c397d8
set -U fish_color_error d54e53
set -U fish_color_param 7aa6da
set -U fish_color_option 7aa6da
set -U fish_color_comment e7c547
set -U fish_color_operator 00a6b2
set -U fish_color_escape 00a6b2
set -U fish_color_autosuggestion 969896

# UI colors
set -U fish_color_cancel --reverse
set -U fish_color_cwd green
set -U fish_color_cwd_root red
set -U fish_color_host normal
set -U fish_color_host_remote yellow
set -U fish_color_user brgreen
set -U fish_color_status red
set -U fish_color_valid_path --underline
set -U fish_color_history_current --bold

# Selection & search
set -U fish_color_match --background=brblue
set -U fish_color_search_match bryellow --background=brblack
set -U fish_color_selection white --bold --background=brblack

# Pager (completions menu)
set -U fish_pager_color_progress brwhite
set -U fish_pager_color_prefix 7aa6da --bold
set -U fish_pager_color_completion normal
set -U fish_pager_color_description 969896
set -U fish_pager_color_selected_background --background=brblack
