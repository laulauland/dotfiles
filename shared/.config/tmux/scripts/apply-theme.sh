#!/usr/bin/env bash

set -euo pipefail

socket_path=${1:-}
tmux_cmd=(tmux)
if [[ -n "$socket_path" ]]; then
  tmux_cmd+=( -S "$socket_path" )
fi

normalize_mode() {
  local value=${1:-}
  value=${value,,}
  case "$value" in
    light|dark)
      printf '%s\n' "$value"
      ;;
    *)
      return 1
      ;;
  esac
}

detect_mode() {
  local mode

  for value in "${TMUX_THEME_MODE:-}" "${PI_THEME_MODE:-}"; do
    if mode=$(normalize_mode "$value"); then
      printf '%s\n' "$mode"
      return 0
    fi
  done

  if [[ $(uname -s) == "Darwin" ]]; then
    if defaults read -g AppleInterfaceStyle >/dev/null 2>&1; then
      printf 'dark\n'
    else
      printf 'light\n'
    fi
    return 0
  fi

  for value in "${TERM_BACKGROUND:-}" "${DFT_BACKGROUND:-}"; do
    if mode=$(normalize_mode "$value"); then
      printf '%s\n' "$mode"
      return 0
    fi
  done

  printf 'dark\n'
}

mode=$(detect_mode)
current_mode=$("${tmux_cmd[@]}" show-options -gv @theme-mode 2>/dev/null || true)

if [[ "$current_mode" == "$mode" ]]; then
  exit 0
fi

declare -A theme_for_mode=(
  [light]=alabaster
  [dark]=usgc-reticle-it
)
theme_file="$HOME/.config/tmux/themes/${theme_for_mode[$mode]}-${mode}.conf"
if [[ ! -f "$theme_file" ]]; then
  exit 0
fi

"${tmux_cmd[@]}" source-file "$theme_file"
"${tmux_cmd[@]}" set-option -gq @theme-mode "$mode"
"${tmux_cmd[@]}" refresh-client -S >/dev/null 2>&1 || true
