# Arch server layer

This dotfile overlay is intentionally small and server-safe. `shared/` carries
the portable shell, editor, tmux, jj, and agent configuration; `arch/` should
only contain Arch-specific overrides.

For a fresh Arch box, clone this repo and run:

```bash
./bootstrap
```

The bootstrap script installs base pacman prerequisites, installs `yay` when it
is missing, trusts the shared mise config, installs mise-managed tools, and then
applies mise dotfiles for `shared/` plus `arch/`.

Keep AUR-only packages in an explicit yay/bootstrap step rather than in mise's
pacman package manager. mise owns the portable toolchain; pacman/yay own system
packages.
