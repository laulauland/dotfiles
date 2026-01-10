function tailbat --description "tail -f with bat syntax highlighting"
    if test (count $argv) -eq 0
        echo "Usage: tailbat <file> [language]"
        return 1
    end
    
    set -l file $argv[1]
    set -l lang (test (count $argv) -ge 2; and echo $argv[2]; or echo "log")
    
    tail -f $file | bat --paging=never -l $lang
end
