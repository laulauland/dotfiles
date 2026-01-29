#!/usr/bin/env bash

# Session picker - type letters to filter, auto-selects on unique match
# Highlights the shortest unique prefix for each session
# Arrow keys to navigate, Enter to select

set -e

# Get sessions
mapfile -t sessions < <(tmux list-sessions -F "#{session_name}" | sort)

if [[ ${#sessions[@]} -eq 0 ]]; then
    echo "No sessions found"
    sleep 1
    exit 1
fi

if [[ ${#sessions[@]} -eq 1 ]]; then
    tmux switch-client -t "${sessions[0]}"
    exit 0
fi

# Calculate shortest unique prefix for each session
declare -A unique_prefix_len

calculate_unique_prefixes() {
    local items=("$@")
    unique_prefix_len=()
    for i in "${!items[@]}"; do
        local name="${items[$i]}"
        local name_lower="${name,,}"
        local len=1
        
        while [[ $len -le ${#name} ]]; do
            local prefix="${name_lower:0:$len}"
            local unique=true
            
            for j in "${!items[@]}"; do
                if [[ $i -ne $j ]]; then
                    local other="${items[$j],,}"
                    if [[ "$other" == "$prefix"* ]]; then
                        unique=false
                        break
                    fi
                fi
            done
            
            if $unique; then
                unique_prefix_len["$name"]=$len
                break
            fi
            ((len++))
        done
        
        # If no unique prefix found, use full length
        if [[ -z "${unique_prefix_len[$name]}" ]]; then
            unique_prefix_len["$name"]=${#name}
        fi
    done
}

# Format session name with highlighted unique prefix
format_session() {
    local name="$1"
    local is_selected="$2"
    local prefix_len="${unique_prefix_len[$name]}"
    local prefix="${name:0:$prefix_len}"
    local rest="${name:$prefix_len}"
    
    if [[ "$is_selected" == "1" ]]; then
        # Selected: reverse video with cyan prefix
        printf '\033[7m>\033[0m \033[1;36m%s\033[0m%s' "$prefix" "$rest"
    else
        # Normal: cyan prefix
        printf '  \033[1;36m%s\033[0m%s' "$prefix" "$rest"
    fi
}

# Get matching sessions (case-insensitive prefix match)
get_matches() {
    local f="${1,,}"
    for s in "${sessions[@]}"; do
        local sl="${s,,}"
        if [[ -z "$f" || "$sl" == "$f"* ]]; then
            echo "$s"
        fi
    done
}

filter=""
selected=0
last_display=""

# Hide cursor, setup cleanup
tput civis
trap 'tput cnorm; tput sgr0' EXIT

# Display function
display() {
    local matches
    mapfile -t matches < <(get_matches "$filter")
    
    # Clamp selected index
    if [[ ${#matches[@]} -eq 0 ]]; then
        selected=0
    elif [[ $selected -ge ${#matches[@]} ]]; then
        selected=$((${#matches[@]} - 1))
    elif [[ $selected -lt 0 ]]; then
        selected=0
    fi
    
    # Recalculate prefixes for current matches
    if [[ ${#matches[@]} -gt 0 ]]; then
        calculate_unique_prefixes "${matches[@]}"
    fi
    
    # Build display
    tput home
    tput ed
    
    printf 'Filter: %s_\n\n' "$filter"
    
    if [[ ${#matches[@]} -eq 0 ]]; then
        printf '(no matches)\n'
    else
        for i in "${!matches[@]}"; do
            local is_sel=0
            [[ $i -eq $selected ]] && is_sel=1
            format_session "${matches[$i]}" "$is_sel"
            printf '\n'
        done
    fi
}

# Clear screen once at start
tput clear

# Main loop
while true; do
    display
    
    mapfile -t matches < <(get_matches "$filter")
    
    # Auto-select if exactly one match and filter is not empty
    if [[ ${#matches[@]} -eq 1 && -n "$filter" ]]; then
        tmux switch-client -t "${matches[0]}"
        exit 0
    fi
    
    # Read single character
    IFS= read -rsn1 char
    
    if [[ -z "$char" ]]; then
        # Enter - select highlighted match
        if [[ ${#matches[@]} -gt 0 ]]; then
            tmux switch-client -t "${matches[$selected]}"
            exit 0
        fi
    elif [[ "$char" == $'\x1b' ]]; then
        # Escape sequence - read more
        read -rsn1 -t 0.1 next
        if [[ -z "$next" ]]; then
            # Plain escape - cancel
            exit 0
        elif [[ "$next" == "[" ]]; then
            read -rsn1 -t 0.1 arrow
            case "$arrow" in
                A) # Up arrow
                    ((selected--)) || :
                    [[ $selected -lt 0 ]] && selected=$((${#matches[@]} - 1))
                    ;;
                B) # Down arrow
                    ((selected++)) || :
                    [[ $selected -ge ${#matches[@]} ]] && selected=0
                    ;;
            esac
        fi
    elif [[ "$char" == $'\x7f' || "$char" == $'\b' ]]; then
        filter="${filter%?}"
        selected=0
    elif [[ "$char" =~ ^[a-zA-Z0-9._-]$ ]]; then
        filter+="$char"
        selected=0
    fi
done
