# Terminal appearance

The terminal on the client device owns the light/dark mode. Ghostty follows the
macOS appearance and selects Alabaster or Ghostty Default Style Dark. SSH carries
terminal queries and replies to Gondor; no SSH environment forwarding is needed.

Fish uses its native `fish_terminal_color_theme` notification to apply
session-local colors. It exports `TERM_BACKGROUND` only as a startup fallback for
child shells. Two shells on Gondor can therefore use different modes.

Neovim leaves `background` unset so its native terminal detection stays active.
Alabaster and the custom highlights reload when the terminal reports a change.
Do not set `background` in startup configuration or derive it from the server OS.
Starship uses terminal palette colors and needs no separate switch.

After deploying, start a new Fish shell (`exec fish`) and restart Neovim to load
the handlers, then reload Ghostty configuration. Old shells may still have the
former universal color settings; new shells mask those with session-local
settings.

Check both directions while attached from each Mac:

1. Change macOS appearance from light to dark and back.
2. In Fish, check `echo $fish_terminal_color_theme $TERM_BACKGROUND`.
3. In Neovim, check `:set background?` and the Markdown code highlights.
4. Repeat through `ssh gondor`.

A terminal that does not report colors uses the inherited shell mode, or dark
when no mode is available.

## Verified behavior and limits

The September 2026 checks used real Fish and Neovim processes in a PTY, with
light/dark terminal protocol replies. Local Fish, local Neovim, and SSH to
Gondor passed light -> dark -> light checks.
The eight theme configuration files were compared byte for byte on all devices.

Ghostty configuration validation passed on both Macs. Reload succeeded locally;
Rivendell's AppleScript reload timed out, so reload its configuration manually.

The sync preserves the local app-owned Karabiner file rather than replacing it
with a dotfile link.
