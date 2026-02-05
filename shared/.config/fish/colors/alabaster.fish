#!/usr/bin/env fish
# Alabaster light theme colors for fish shell
# Matches Ghostty's Alabaster theme

# Syntax highlighting
set -U fish_color_normal 000000              # Default text
set -U fish_color_command 325cc0             # Commands (Alabaster blue)
set -U fish_color_keyword 7a3e9d             # Keywords (Alabaster magenta)
set -U fish_color_quote 448c27               # Quoted strings (Alabaster green)
set -U fish_color_redirection 0083b2         # Redirections (Alabaster cyan)
set -U fish_color_end 7a3e9d                 # End of command (;, &)
set -U fish_color_error aa3731               # Errors (Alabaster red)
set -U fish_color_param 000000               # Parameters
set -U fish_color_option 325cc0              # Options (--flag)
set -U fish_color_comment 777777             # Comments (Alabaster bright black)
set -U fish_color_operator 0083b2            # Operators
set -U fish_color_escape 0083b2              # Escape sequences
set -U fish_color_autosuggestion b7b7b7      # Autosuggestions (Alabaster white/gray)

# UI colors
set -U fish_color_cancel --reverse
set -U fish_color_cwd 325cc0                 # Current working directory
set -U fish_color_cwd_root aa3731            # Root cwd
set -U fish_color_host normal
set -U fish_color_host_remote cb9000         # Remote host (Alabaster yellow)
set -U fish_color_user 448c27                # Username
set -U fish_color_status aa3731              # Non-zero exit status
set -U fish_color_valid_path --underline
set -U fish_color_history_current --bold

# Selection & search
set -U fish_color_match --background=bfdbfe             # Matching parens (Alabaster selection blue)
set -U fish_color_search_match --background=bfdbfe       # Search matches
set -U fish_color_selection 000000 --bold --background=bfdbfe  # Selection

# Pager (completions menu)
set -U fish_pager_color_progress 777777
set -U fish_pager_color_prefix 325cc0 --bold
set -U fish_pager_color_completion 000000
set -U fish_pager_color_description 777777
set -U fish_pager_color_selected_background --background=bfdbfe
