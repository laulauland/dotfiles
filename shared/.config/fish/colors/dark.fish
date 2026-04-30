#!/usr/bin/env fish
# USGC-RETICLE-IT dark theme colors for fish shell
# Matches Ghostty's USGC-RETICLE-IT theme

# Syntax highlighting
set -U fish_color_normal normal
set -U fish_color_command 3477f6
set -U fish_color_keyword 6b40ef
set -U fish_color_quote f6c443
set -U fish_color_redirection ee7b3b
set -U fish_color_end 6b40ef
set -U fish_color_error cd0400
set -U fish_color_param 459a65
set -U fish_color_option 3477f6
set -U fish_color_comment 484747
set -U fish_color_operator ea3d8d
set -U fish_color_escape ea3d8d
set -U fish_color_autosuggestion 868d96

# UI colors
set -U fish_color_cancel --reverse
set -U fish_color_cwd 459a65
set -U fish_color_cwd_root cd0400
set -U fish_color_host normal
set -U fish_color_host_remote f6c443
set -U fish_color_user ebbc40
set -U fish_color_status cd0400
set -U fish_color_valid_path --underline
set -U fish_color_history_current --bold

# Selection & search
set -U fish_color_match --background=01057c
set -U fish_color_search_match f6c443 --background=01057c
set -U fish_color_selection f6c443 --bold --background=01057c

# Pager (completions menu)
set -U fish_pager_color_progress 484747
set -U fish_pager_color_prefix 3477f6 --bold
set -U fish_pager_color_completion normal
set -U fish_pager_color_description 484747
set -U fish_pager_color_selected_background --background=01057c
