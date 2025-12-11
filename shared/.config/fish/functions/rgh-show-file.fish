function rgh-show-file --description 'Show a specific file version from git history'
    set -l commit_file $argv[1]
    set -l parts (string split ":" $commit_file)
    set -l commit $parts[1]
    set -l file $parts[2]

    # Show commit info
    echo (set_color yellow)"Commit:"(set_color normal)
    git log -1 --format='  %H%n  Author: %an <%ae>%n  Date: %ad%n  %n  %s%n' --date=iso $commit

    echo (set_color green)"File: $file"(set_color normal)
    echo

    # Show file content with syntax highlighting
    git show "$commit:$file" | bat --color=always --language=(echo $file | sed 's/.*\.//')

    echo
    echo (set_color blue)"Options:"(set_color normal)
    echo "  • Copy to clipboard: git show $commit:$file | pbcopy"
    echo "  • Save as new file: git show $commit:$file > $file.from-$commit"
    echo "  • Replace current: git show $commit:$file > $file"
    echo "  • Open in editor: git show $commit:$file | $EDITOR -"
    echo "  • See full commit: git show $commit"
end
