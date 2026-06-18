function __cache_init --description 'Source a tool init script from cache, regenerating when the binary changes'
    # Usage: __cache_init <key> <generator command...>
    # Caches the (static) output of an init/completions generator to a file and
    # sources that instead of re-forking the tool on every shell start. The cache
    # is keyed by the binary's mtime, so upgrading the tool busts it automatically.
    set -l key $argv[1]
    set -l generator $argv[2..-1]

    set -l bin (command -v $generator[1])
    test -z "$bin"; and return 1

    # Version stamp via the `path mtime` builtin — no subprocess fork.
    set -l stamp (path mtime "$bin")
    set -l cache_dir $HOME/.cache/fish-init
    set -l cache_file "$cache_dir/$key.$stamp.fish"

    if not test -f "$cache_file"
        mkdir -p "$cache_dir"
        for stale in $cache_dir/$key.*.fish
            rm -f "$stale"
        end
        $generator >"$cache_file" 2>/dev/null
    end

    source "$cache_file"
end
