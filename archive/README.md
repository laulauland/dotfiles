# Archived configs

`linux-desktop/` contains the old generic Linux stow layer. It was archived
because it was really a desktop profile: Sway, Foot, Electron flags, MIME
defaults, Zed, and `/usr/bin/gh` Git credential assumptions.

If a Linux desktop returns later, move it back as an explicit profile such as
`linux-desktop/` and teach `./stow` about that profile directly. The current
`arch/` profile is intentionally server-safe for `rohan`.
