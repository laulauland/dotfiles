function rgh --description 'Search git history with ripgrep interactively'
    # If no pattern provided, do interactive search
    if test (count $argv) -eq 0
        set -l RG_PREFIX "git grep --no-index"

        # Interactive search through all git history
        : | fzf --ansi --disabled --query "" \
            --bind "start:reload:git rev-list --all | xargs git grep --color=always -n {q} || true" \
            --bind "change:reload:sleep 0.1; git rev-list --all | xargs git grep --color=always -n {q} || true" \
            --delimiter : \
            --preview "echo {} | cut -d: -f1,2 | xargs -I{} git show {} | bat --color=always --language=(echo {} | cut -d: -f2 | xargs basename | sed 's/.*\.//')" \
            --bind "enter:execute(echo {} | cut -d: -f1,2 | xargs -I{} fish -c 'rgh-show-file {}')+abort"
        return
    end

    set -l pattern $argv[1]
    set -l git_cmd "git rev-list --all"

    # Parse additional arguments
    if test (count $argv) -gt 1
        for i in (seq 2 (count $argv))
            switch $argv[$i]
                case '--author=*'
                    set git_cmd "$git_cmd --author='$(string replace '--author=' '' $argv[$i])'"
                case '--since=*'
                    set git_cmd "$git_cmd --since='$(string replace '--since=' '' $argv[$i])'"
                case '--path=*'
                    set git_cmd "$git_cmd -- '$(string replace '--path=' '' $argv[$i])'"
            end
        end
    end

    # Search and show actual content matches
    eval $git_cmd | while read commit
        git grep -n "$pattern" $commit 2>/dev/null | while read match
            set -l parts (string split ":" $match)
            set -l commit_file $parts[1]:$parts[2]
            set -l line_num $parts[3]
            set -l content (string join ":" $parts[4..-1])

            # Get commit info
            set -l commit_info (git log -1 --format='%h|%ad|%an' --date=short $commit)
            set -l commit_parts (string split "|" $commit_info)

            # Format output: commit:file:line: content with commit metadata
            printf "%s %s %s %s:%s: %s\n" \
                (set_color yellow)$commit_parts[1](set_color normal) \
                (set_color green)$commit_parts[2](set_color normal) \
                (set_color blue)$commit_parts[3](set_color normal) \
                $parts[2] $line_num \
                (string trim $content)
        end
    end | fzf --ansi --reverse --no-sort \
        --preview "echo {} | sed 's/[^ ]* [^ ]* [^ ]* //' | cut -d: -f1,2 | xargs -I{} git show {} | bat --color=always --highlight-line=$(echo {} | sed 's/[^ ]* [^ ]* [^ ]* //' | cut -d: -f2)" \
        --bind "enter:execute(echo {} | sed 's/[^ ]* [^ ]* [^ ]* //' | cut -d: -f1,2 | xargs -I{} fish -c 'rgh-show-file {}')+abort"
end
