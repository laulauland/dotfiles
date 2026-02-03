set -x EDITOR nvim
set -x VISUAL nvim

if test (uname) = "Linux"
	set XDG_SESSION_TYPE "wayland"
	set -x XDG_SESSION_DESKTOP "sway"
	set -x XDG_CURRENT_DESKTOP "sway"
end

# Auto-attach tmux on SSH (non-Mac only)
if status is-interactive; and test -n "$SSH_CONNECTION"; and test -z "$TMUX"; and test (uname) != "Darwin"
    tmux attach; or tmux new-session
end

# mise setup
if status is-interactive
  mise activate fish | source
else
  mise activate fish --shims | source
end

if status is-interactive
	abbr -a v "nvim"
	abbr -a e "nvim"
	abbr -a gl "git pull"
	abbr -a gc "git commit"
	abbr -a gs "git status"
	abbr -a ga "git add"
	abbr -a gls "git ls-files"

	abbr -a pnf "pnpm --filter"

    if test -n "$GHOSTTY_RESOURCES_DIR"
        source $GHOSTTY_RESOURCES_DIR/shell-integration/fish/vendor_conf.d/ghostty-shell-integration.fish
    end

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
			while test "$dir" != "/"
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

	fnm env --use-on-cd --corepack-enabled --shell fish | source
	atuin init fish --disable-up-arrow | source
	zoxide init fish | source

	# Cache starship init for faster startup
	set -l starship_cache ~/.cache/starship/init.fish
	if not test -f $starship_cache
		mkdir -p (dirname $starship_cache)
		starship init fish --print-full-init > $starship_cache
	end
	source $starship_cache

	# Defer direnv until first prompt/directory change
	function __direnv_deferred_init --on-event fish_prompt
		functions --erase __direnv_deferred_init
		direnv hook fish | source
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

# Added by LM Studio CLI (lms)
set -gx PATH $PATH "$HOME/.cache/lm-studio/bin"
# End of LM Studio CLI section


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
    string replace "config-file = mode/normal" "config-file = mode/$choice" < "$config_file" | string replace "config-file = mode/tmux" "config-file = mode/$choice" > "$config_file.tmp"
    mv "$config_file.tmp" "$config_file"
    
    echo "Switched to $choice mode"
end

# Amp CLI
export PATH="/Users/laurynas-fp/.amp/bin:$PATH"

# Added by LM Studio CLI (lms)
set -gx PATH $PATH /Users/laurynas-fp/.cache/lm-studio/bin
# End of LM Studio CLI section

