# zerobrew
# set -gx ZEROBREW_ROOT /opt/zb
# set -gx ZEROBREW_PREFIX /opt/zb
# fish_add_path /opt/zb/bin

set -x EDITOR nvim
set -x VISUAL nvim

# Default terminal background fallback for auto_theme (light|dark)
set --export DFT_BACKGROUND light

if test (uname) = Linux; and test -z "$SSH_CONNECTION"; and type -q sway
    set XDG_SESSION_TYPE wayland
    set -x XDG_SESSION_DESKTOP sway
    set -x XDG_CURRENT_DESKTOP sway
end

# mise setup
if type -q mise
    if status is-interactive
        mise activate fish | source
        # Auto-detect light/dark terminal and apply matching fish colors
        auto_theme
    else
        mise activate fish --shims | source
    end
else if status is-interactive
    auto_theme
end

if status is-interactive
    abbr -a v nvim
    abbr -a e nvim
    abbr -a gl "git pull"
    abbr -a gc "git commit"
    abbr -a gs "git status"
    abbr -a ga "git add"
    abbr -a gls "git ls-files"

    abbr -a pnf "pnpm --filter"

    # if test -n "$GHOSTTY_RESOURCES_DIR"
    #     source $GHOSTTY_RESOURCES_DIR/shell-integration/fish/vendor_conf.d/ghostty-shell-integration.fish
    # end

    function mark_prompt_start --on-event fish_prompt
        echo -en "\e]133;A\e\\"
    end

    # function update_cwd_osc --on-variable PWD --description 'Notify terminals when $PWD changes'
    # 		if status --is-command-substitution || set -q INSIDE_EMACS
    # 				return
    # 		end
    # 		printf \e\]7\;file://%s%s\e\\ $hostname (string escape --style=url $PWD)
    # end
    #
    # update_cwd_osc # Run once since we might have inherited PWD from a parent shell

    set fzf_directory_opts --bind "enter:become(nvim {} &> /dev/tty)"

    set --export fzf_history_opts "--nth=4.."
    set fzf_preview_dir_cmd eza -1 --color=always
    set fzf_preview_file_cmd bat --color=always

    function _find_gitignore
        set -l dir (pwd)
        while test "$dir" != /
            if test -f "$dir/.gitignore"
                echo "$dir/.gitignore"
                return 0
            end
            set dir (dirname "$dir")
        end
        return 1
    end

    function _open_fzf
        set -l ignore_args --exclude .git --exclude .jj
        set -l gitignore (_find_gitignore)
        if test -n "$gitignore"
            set ignore_args $ignore_args --ignore-file "$gitignore"
        end
        fd --type f --hidden --follow $ignore_args |
            fzf \
                --height=30% \
                --layout=reverse \
                --ansi \
                --preview "$fzf_preview_file_cmd {}" \
                --bind "enter:become($EDITOR {})"
    end

    function _rg_fzf_nvim
        set -l gitignore (_find_gitignore)
        set -l ignore_file ""
        if test -n "$gitignore"
            set ignore_file "--ignore-file $gitignore"
        end
        set RG_PREFIX "rg --column --line-number --no-heading --color=always --smart-case --glob '!.jj' $ignore_file "

        : | fzf --ansi --disabled --query "" \
            --bind "start:reload:$RG_PREFIX {q}" \
            --bind "change:reload:sleep 0.1; $RG_PREFIX {q} || true" \
            --delimiter : \
            --preview "bat --color=always {1} --highlight-line {2}" \
            --bind "enter:become($EDITOR {1} +{2})"
    end

    bind \co _open_fzf
    bind \e\co _rg_fzf_nvim

    # fnm env embeds a per-shell multishell path, so it must run live (not cached).
    if type -q fnm
        fnm env --use-on-cd --corepack-enabled --shell fish | source
    end

    # Static init scripts: cache to a file and source it instead of re-forking the
    # tool every startup. __cache_init busts the cache when the binary is upgraded.
    if type -q atuin
        __cache_init atuin atuin init fish --disable-up-arrow
    end
    if type -q atuin-ai
        __cache_init atuin-ai atuin ai init
    end
    if type -q zoxide
        __cache_init zoxide zoxide init fish
    end
    if type -q starship
        __cache_init starship starship init fish --print-full-init
    end

    # Defer direnv until first prompt/directory change
    if type -q direnv
        function __direnv_deferred_init --on-event fish_prompt
            functions --erase __direnv_deferred_init
            direnv hook fish | source
        end
    end
end

# bun
set --export BUN_INSTALL "$HOME/.bun"
set --export PATH $BUN_INSTALL/bin $PATH
# cargo
fish_add_path "$HOME/.cargo/bin"

# Custom scripts
fish_add_path "$HOME/.local/bin"

# Added by OrbStack: command-line tools and integration
# This won't be added again if you remove it.
source ~/.orbstack/shell/init2.fish 2>/dev/null || :

if test -d "$HOME/.cache/lm-studio/bin"
    fish_add_path "$HOME/.cache/lm-studio/bin"
end

#claude code env vars
export CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1

# opencode
fish_add_path "$HOME/.opencode/bin"

# Ghostty mode switcher
function gmode --description 'Switch between Ghostty normal and tmux modes'
    set -l choice (printf "normal\ntmux" | fzf --prompt="Ghostty mode > ")

    if test -z "$choice"
        return
    end

    # Just manually edit the config file
    set -l config_file "$HOME/Code/laulauland/dotfiles/shared/.config/ghostty/config"
    if not test -f "$config_file"
        echo "Ghostty config not found: $config_file"
        return 1
    end
    string replace "config-file = mode/normal" "config-file = mode/$choice" <"$config_file" | string replace "config-file = mode/tmux" "config-file = mode/$choice" >"$config_file.tmp"
    mv "$config_file.tmp" "$config_file"

    echo "Switched to $choice mode"
end

if test -d "$HOME/.amp/bin"
    fish_add_path "$HOME/.amp/bin"
end

# zmx
functions -c fish_prompt _original_fish_prompt 2>/dev/null

function fish_prompt --description 'Write out the prompt'
    if set -q ZMX_SESSION
        echo -n "[$ZMX_SESSION] "
    end
    _original_fish_prompt
end

if type -q zmx
    __cache_init zmx zmx completions fish
end

#zmx end
