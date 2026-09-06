# Terminal appearance

The terminal on the client device owns the light/dark mode. Ghostty follows the
macOS appearance and selects Alabaster or Ghostty Default Style Dark. SSH carries
terminal queries and replies to Gondor; no SSH environment forwarding is needed.

Herdr uses `theme.auto_switch` for its UI and passes the terminal's default colors
to its panes. Fish uses its native `fish_terminal_color_theme` notification to
apply session-local colors. It exports `TERM_BACKGROUND` only as a startup fallback
for child shells. Two shells on Gondor can therefore use different modes.

Neovim leaves `background` unset so its native terminal detection stays active.
Alabaster and the custom highlights reload when the terminal reports a change.
Do not set `background` in startup configuration or derive it from the server OS.
Starship uses terminal palette colors and needs no separate switch.

After deploying, start a new Fish shell (`exec fish`) and restart Neovim to load
the handlers. Reload Ghostty configuration and use `herdr server reload-config`
for a running Herdr server. Old shells may still have the former universal color
settings; new shells mask those with session-local settings.

Check both directions while attached from each Mac:

1. Change macOS appearance from light to dark and back.
2. In Fish, check `echo $fish_terminal_color_theme $TERM_BACKGROUND`.
3. In Neovim, check `:set background?` and the Markdown code highlights.
4. Repeat through `ssh gondor` and `herdr --remote gondor`.

A terminal that does not report colors uses the inherited shell mode, or dark
when no mode is available. A shared Herdr pane has one terminal state; clients
with different appearances cannot give that same running pane two modes.

## Verified behavior and limits

The September 2026 checks used real Fish and Neovim processes in a PTY, with
light/dark terminal protocol replies. Local Fish, local Neovim, SSH to Gondor,
and Neovim inside Herdr on Gondor passed light -> dark -> light checks.
The eight theme configuration files were compared byte for byte on all devices.

Through Rivendell, the Herdr Fish pane passed both changes after a new prompt,
but did not reliably update while idle. Press Enter once if that pane retains
its old colors. This remains a Herdr/terminal notification limitation; these
configs do not read from the PTY or poll it from a second process.

Ghostty configuration validation passed on both Macs. Reload succeeded locally;
Rivendell's AppleScript reload timed out, so reload its configuration manually.
Herdr configuration reload succeeded on all three devices.

The sync preserves the local app-owned Karabiner file and Gondor's installed
Herdr binary rather than replacing either with a dotfile link.
