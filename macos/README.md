# macOS Workstation Notes

This dotfile overlay contains macOS-only application configuration. It is
intended for preferences that are portable enough to recreate a working machine
without committing app state, histories, tokens, caches, or databases.

Raycast notes:

- Track `~/.config/raycast/scripts/*` script commands when they are plain shell
  scripts.
- Do not track `~/.config/raycast/extensions` or `~/.config/raycast-x/extensions`:
  these are generated extension caches with compiled JavaScript, source maps,
  and extension-local state. Reinstall extensions through Raycast instead.

Manual app notes:

- Helium is installed as bundle id `net.imput.helium`. Do not use Homebrew's
  `helium` cask for this app; that cask is a different, deprecated Android
  utility.
