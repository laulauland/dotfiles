function rgh-deleted --description 'Find deleted code in git history'
    # Search for pattern in commits that deleted files
    git log --diff-filter=D --format='%H' --all | while read commit
        git grep -n "$argv[1]" $commit^ 2>/dev/null | while read match
            set -l parts (string split ":" $match)
            set -l commit_info (git log -1 --format='%h|%ad|%an|DELETED' --date=short $commit)
            set -l commit_parts (string split "|" $commit_info)

            printf "%s %s %s %s %s:%s: %s\n" \
                (set_color yellow)$commit_parts[1](set_color normal) \
                (set_color green)$commit_parts[2](set_color normal) \
                (set_color blue)$commit_parts[3](set_color normal) \
                (set_color red)$commit_parts[4](set_color normal) \
                $parts[2] $parts[3] \
                (string trim (string join ":" $parts[4..-1]))
        end
    end | fzf --ansi --reverse --no-sort \
        --preview "echo {} | sed 's/[^ ]* [^ ]* [^ ]* [^ ]* //' | cut -d: -f1,2 | xargs -I{} git show {} | bat --color=always" \
        --bind "enter:execute(echo {} | sed 's/[^ ]* [^ ]* [^ ]* [^ ]* //' | cut -d: -f1,2 | xargs -I{} fish -c 'rgh-show-file {}')+abort"
end
