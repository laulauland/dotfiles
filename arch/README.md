# Arch server layer

This dotfile overlay is intentionally small and server-safe. `shared/` carries
the portable shell, editor, tmux, jj, and agent configuration; `arch/` should
only contain Arch-specific overrides.

For a fresh Arch box, use the public checkout at the canonical path and run:

```bash
sudo pacman -Syu --needed git mise
git clone https://github.com/laulauland/dotfiles.git ~/code/laulauland/dotfiles
cd ~/code/laulauland/dotfiles
./bootstrap
```

The bootstrap script installs mise through pacman and seeds the active config.
From there, mise installs the declared pacman packages and portable tools,
switches the login shell to fish, installs managed agent dependencies, and
applies dotfiles for `shared/` plus `arch/`.

There are currently no declared AUR packages, so `yay` is not installed. If one
is added, keep its idempotent installation and invocation in a mise bootstrap
task rather than adding another top-level setup path.
