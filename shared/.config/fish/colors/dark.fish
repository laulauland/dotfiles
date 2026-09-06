#!/usr/bin/env fish
# Ghostty Default Style Dark theme colors for fish shell
# Matches Ghostty's default dark palette

# Syntax highlighting
set -g fish_color_normal normal
set -g fish_color_command 82a2be
set -g fish_color_keyword b294bb
set -g fish_color_quote f0c674
set -g fish_color_redirection 8abeb7
set -g fish_color_end b294bb
set -g fish_color_error cc6566
set -g fish_color_param b6bd68
set -g fish_color_option 82a2be
set -g fish_color_comment 999999
set -g fish_color_operator b294bb
set -g fish_color_escape b294bb
set -g fish_color_autosuggestion 868d96

# UI colors
set -g fish_color_cancel --reverse
set -g fish_color_cwd b6bd68
set -g fish_color_cwd_root cc6566
set -g fish_color_host normal
set -g fish_color_host_remote f0c674
set -g fish_color_user f0c674
set -g fish_color_status cc6566
set -g fish_color_valid_path --underline
set -g fish_color_history_current --bold

# Selection & search
set -g fish_color_match --background=353a44
set -g fish_color_search_match f0c674 --background=353a44
set -g fish_color_selection f0c674 --bold --background=353a44

# Pager (completions menu)
set -g fish_pager_color_progress 999999
set -g fish_pager_color_prefix 82a2be --bold
set -g fish_pager_color_completion normal
set -g fish_pager_color_description 999999
set -g fish_pager_color_selected_background --background=353a44
