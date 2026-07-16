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

Before portable tools are resolved, bootstrap installs GitHub CLI, requires an
authenticated GitHub session (or `MISE_GITHUB_TOKEN`), installs `yay`, and
installs Node, Rust, and Python so ecosystem-backed tools can resolve cleanly.
Codex CLI is then installed through mise from the official `@openai/codex` npm
package.
