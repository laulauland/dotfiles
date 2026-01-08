#!/usr/bin/env bash

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // ""')

# Interactive jj commands that open an editor or diff viewer:
#
# Always interactive (open diff editor):
#   jj split       - Opens diff editor to split commits (default when no filesets)
#   jj diffedit    - Opens diff editor to edit changes
#   jj resolve     - Opens merge tool (unless --list)
#
# Opens text editor without -m/--message:
#   jj squash      - Opens editor for commit message
#
# Opens text editor without -m/--message/--stdin:
#   jj describe    - Opens editor for commit message
#   jj commit      - Opens editor for commit message
#
# Interactive with -i/--interactive or --tool:
#   jj commit -i   - Interactive commit
#   jj restore -i  - Interactive restore
#   jj split -i    - Explicitly interactive split

# Pattern prefix to match jj at start or after command chain operators (&&, ||, ;, |)
JJ_PREFIX='(^|[[:space:]]&&[[:space:]]|[[:space:]]\|\|[[:space:]]|;[[:space:]]*|\|[[:space:]]*)'

# Commands that always open a diff editor
if [[ "$command" =~ ${JJ_PREFIX}jj[[:space:]]+(diffedit)([[:space:]]|$) ]]; then
    jq -n '{
        hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: "jj diffedit always opens a diff editor. Use jj restore for non-interactive alternatives."
        }
    }'
    exit 0
fi

# jj squash without -m/--message opens editor
if [[ "$command" =~ ${JJ_PREFIX}jj[[:space:]]+(squash)([[:space:]]|$) ]] && [[ ! "$command" =~ (-m[[:space:]]|--message[[:space:]]|-m\"|-m\'|--message=) ]]; then
    jq -n '{
        hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: "jj squash without -m opens an editor. Use: jj squash -m \"message\""
        }
    }'
    exit 0
fi

# jj split with -i/--interactive or without filesets or without -m opens editor
# Allow: jj split -m "msg" <files> (has both message and filesets)
# Block: jj split, jj split <files>, jj split -m "msg", jj split -i <files>
if [[ "$command" =~ ${JJ_PREFIX}jj[[:space:]]+(split)([[:space:]]|$) ]]; then
    # Block if -i or --interactive is present
    if [[ "$command" =~ [[:space:]](-i|--interactive)([[:space:]]|$) ]]; then
        jq -n '{
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: "jj split -i opens a diff editor interactively."
            }
        }'
        exit 0
    fi
    # Block if -m/--message is missing (opens editor for commit message)
    if [[ ! "$command" =~ (-m[[:space:]]|--message[[:space:]]|-m\"|-m\'|--message=) ]]; then
        jq -n '{
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: "jj split without -m opens an editor. Use: jj split -m \"message\" <files>"
            }
        }'
        exit 0
    fi
    # Check if there are filesets (non-option arguments after jj split)
    # Strip jj split and known options, see if anything remains
    remaining=$(echo "$command" | sed -E 's/^[[:space:]]*jj[[:space:]]+split[[:space:]]*//' | sed -E 's/(-r|--revision|-d|--destination|-A|--insert-after|-B|--insert-before|-m|--message)[[:space:]]+("[^"]*"|'\''[^'\'']*'\''|[^[:space:]]+)[[:space:]]*//g' | sed -E 's/(-p|--parallel)[[:space:]]*//g' | sed -E 's/^[[:space:]]+//' | sed -E 's/[[:space:]]+$//')
    if [[ -z "$remaining" ]]; then
        jq -n '{
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: "jj split without filesets opens a diff editor. Provide filesets: jj split -m \"message\" <files>"
            }
        }'
        exit 0
    fi
fi

# jj resolve opens merge tool (unless --list/-l is used)
if [[ "$command" =~ ${JJ_PREFIX}jj[[:space:]]+(resolve)([[:space:]]|$) ]] && [[ ! "$command" =~ (-l|--list)([[:space:]]|$) ]]; then
    jq -n '{
        hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: "jj resolve opens a merge tool. Use jj resolve --list to view conflicts, or resolve conflicts by editing conflict markers directly."
        }
    }'
    exit 0
fi

# jj describe without -m/--message/--stdin opens editor
if [[ "$command" =~ ${JJ_PREFIX}jj[[:space:]]+(describe|desc)([[:space:]]|$) ]] && [[ ! "$command" =~ (-m[[:space:]]|--message[[:space:]]|-m\"|-m\'|--message=|--stdin) ]]; then
    jq -n '{
        hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: "jj describe without -m opens an editor. Use: jj describe -m \"message\""
        }
    }'
    exit 0
fi

# jj commit without -m/--message/--stdin opens editor
if [[ "$command" =~ ${JJ_PREFIX}jj[[:space:]]+(commit|ci)([[:space:]]|$) ]] && [[ ! "$command" =~ (-m[[:space:]]|--message[[:space:]]|-m\"|-m\'|--message=|--stdin) ]]; then
    jq -n '{
        hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: "jj commit without -m opens an editor. Use: jj commit -m \"message\""
        }
    }'
    exit 0
fi

# Commands with -i/--interactive or --tool flag
if [[ "$command" =~ ${JJ_PREFIX}jj[[:space:]]+(commit|ci|restore)[[:space:]] ]] && [[ "$command" =~ ([[:space:]](-i|--interactive|--tool)[[:space:]]|[[:space:]](-i|--interactive|--tool)$) ]]; then
    jq -n '{
        hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: "Interactive jj command blocked (-i/--interactive/--tool opens a diff editor)."
        }
    }'
    exit 0
fi

# Allow all other commands
exit 0
