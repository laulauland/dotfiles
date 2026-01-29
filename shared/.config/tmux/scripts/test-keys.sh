#!/usr/bin/env bash

LOG="/tmp/keytest.log"
echo "Key test started at $(date)" > "$LOG"
echo "Press keys (Ctrl+C to exit). Output logged to $LOG"
echo "=================================================="

while true; do
    IFS= read -rsn1 char
    
    if [[ -z "$char" ]]; then
        echo "[Enter]" | tee -a "$LOG"
    else
        # Print hex value
        hex=$(printf '%02x' "'$char")
        
        if [[ "$char" == $'\x1b' ]]; then
            output="[ESC:$hex]"
            # Try to read more
            if IFS= read -rsn1 -t 0.5 next; then
                hex2=$(printf '%02x' "'$next")
                output+="[$next:$hex2]"
                if [[ "$next" == "[" ]] || [[ "$next" == "O" ]]; then
                    if IFS= read -rsn1 -t 0.5 arrow; then
                        hex3=$(printf '%02x' "'$arrow")
                        output+="[$arrow:$hex3]"
                    else
                        output+="[timeout]"
                    fi
                fi
            else
                output+="[timeout - plain ESC]"
            fi
            echo "$output" | tee -a "$LOG"
        else
            echo "[char:$char hex:$hex]" | tee -a "$LOG"
        fi
    fi
done
