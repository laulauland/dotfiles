#!/usr/bin/env bash

# Session picker - fzf over tmux sessions, auto-selects on single match.
# Annotates sessions with the terminal app(s) attached to them, and starts
# fzf with the cursor on the current session.
#
# Resolving the terminal app means walking each tmux client's process
# ancestry up to launchd, which costs ~100ms — perceptible. Tmux client
# PIDs are stable across invocations, so we cache pid→app on disk and
# only re-walk ancestry for new clients.

set -e

CACHE_FILE="${TMPDIR:-/tmp}/tmux-session-picker-cache"

current_session=""
[[ -n $TMUX ]] && current_session=$(tmux display-message -p '#S')

sessions=$(tmux list-sessions -F '#{session_name}' | sort)
[[ -z $sessions ]] && exit 0

declare -A pid_app
if [[ -f $CACHE_FILE ]]; then
    while IFS=$'\t' read -r cached_pid cached_app; do
        [[ -z $cached_pid ]] && continue
        pid_app[$cached_pid]=$cached_app
    done < "$CACHE_FILE"
fi

declare -A pid_session live_pid
client_pids=()
need_lookup=()
while IFS='|' read -r session_name pid; do
    [[ -z $pid ]] && continue
    pid_session[$pid]=$session_name
    live_pid[$pid]=1
    client_pids+=("$pid")
    [[ -z ${pid_app[$pid]:-} ]] && need_lookup+=("$pid")
done < <(tmux list-clients -F '#{client_session}|#{client_pid}' 2>/dev/null || true)

if [[ ${#need_lookup[@]} -gt 0 ]]; then
    declare -A pid_parent pid_comm
    to_query=("${need_lookup[@]}")
    while [[ ${#to_query[@]} -gt 0 ]]; do
        pid_csv=$(IFS=,; printf '%s' "${to_query[*]}")
        next_query=()
        while read -r p pp comm; do
            [[ -z $p ]] && continue
            pid_parent[$p]=$pp
            pid_comm[$p]=$comm
            if [[ $pp != "1" && $pp != "0" && -z ${pid_comm[$pp]:-} ]]; then
                next_query+=("$pp")
            fi
        done < <(ps -p "$pid_csv" -o pid=,ppid=,comm= 2>/dev/null)
        to_query=("${next_query[@]}")
    done

    for client_pid in "${need_lookup[@]}"; do
        p=$client_pid
        while [[ -n ${pid_parent[$p]:-} && ${pid_parent[$p]} != "1" && ${pid_parent[$p]} != "0" ]]; do
            p=${pid_parent[$p]}
        done
        app=${pid_comm[$p]##*/}
        [[ -n $app ]] && pid_app[$client_pid]=$app
    done

    {
        for pid in "${!pid_app[@]}"; do
            [[ -n ${live_pid[$pid]:-} ]] || continue
            printf '%s\t%s\n' "$pid" "${pid_app[$pid]}"
        done
    } > "$CACHE_FILE.tmp" && mv "$CACHE_FILE.tmp" "$CACHE_FILE"
fi

declare -A session_apps
for client_pid in "${client_pids[@]}"; do
    app=${pid_app[$client_pid]:-}
    [[ -z $app ]] && continue
    session_name=${pid_session[$client_pid]}
    if [[ -n ${session_apps[$session_name]:-} ]]; then
        session_apps[$session_name]+=", $app"
    else
        session_apps[$session_name]=$app
    fi
done

max_len=$(awk '{ if (length > m) m = length } END { print m }' <<< "$sessions")
display=$(while IFS= read -r name; do
    apps=${session_apps[$name]:-}
    suffix=""
    if [[ -n $apps ]]; then
        suffix="● $apps"
        [[ $name == "$current_session" ]] && suffix+=" (current)"
    fi
    printf '%-*s  %s\n' "$max_len" "$name" "$suffix"
done <<< "$sessions")

pos_args=()
if [[ -n $current_session ]]; then
    line_no=$(awk -v s="$current_session" '$1 == s { print NR; exit }' <<< "$display")
    [[ -n $line_no ]] && pos_args=(--bind "start:pos($line_no)")
fi

selected=$(printf '%s\n' "$display" | \
    fzf --exact --sync --prompt="Switch session: " \
        --height=100% --layout=reverse \
        --select-1 --bind 'one:accept' \
        "${pos_args[@]}" | awk '{print $1}')

[[ -z $selected ]] && exit 0

tmux switch-client -t "$selected"
