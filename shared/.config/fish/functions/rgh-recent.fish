function rgh-recent --description 'Search git history from last N days'
    set -l days $argv[1]
    set -l pattern $argv[2]
    rgh "$pattern" --since="$days.days.ago"
end
