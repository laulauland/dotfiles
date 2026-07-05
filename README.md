# Dotfiles

Personal machine setup for macOS workstations and Arch Linux servers.

mise is the source of truth for setup:

- system/bootstrap packages
- portable developer tools
- repository checkout
- dotfile symlinks
- macOS defaults

`shared/` is applied everywhere. `macos/` and `arch/` are platform overlays
selected with mise environments.

## New Machine Bootstrap

On macOS, install or clone from a shell that can run the repo bootstrap:

```bash
./bootstrap
```

After mise is available, the equivalent full macOS convergence command is:

```bash
mise bootstrap --yes -E macos
```

On a fresh Arch server, create and SSH in as the target user, clone this repo,
then run:

```bash
./bootstrap
```

Do not run the whole bootstrap as root. The script uses sudo only for the parts
that need it, such as `pacman` and shell changes.

Useful focused commands:

```bash
mise bootstrap status -E macos
mise bootstrap status -E arch
mise dotfiles apply --dry-run -E macos
mise dotfiles apply --dry-run -E arch
```

## Configuration And Tooling Changes

Tool and setup changes belong in `shared/.config/mise/config.toml` unless they
are platform-specific.

- Add portable CLI tools under `[tools]`.
- Add macOS Homebrew formulae or Mac App Store apps under `[bootstrap.packages]`.
- Keep Homebrew casks in `Caskfile`; the mise post-packages hook installs it.
- Keep Arch pacman/yay prerequisites in `bootstrap` unless mise's package
  manager support is a better fit.
- Keep AUR-only packages out of mise's pacman manager; install them through an
  explicit yay/bootstrap step.

After changing tooling, verify with the relevant dry run or status command:

```bash
mise bootstrap status -E macos
mise bootstrap status -E arch
mise install --dry-run
```

## New Dotfile Configuration

Put cross-platform configuration in `shared/`, macOS-only configuration in
`macos/`, and Arch-only configuration in `arch/`.

When adding a new dotfile directory or file, add a matching `[dotfiles]` entry:

- Shared entries go in `shared/.config/mise/config.toml`.
- macOS overlay entries go in `shared/.config/mise/config.macos.toml`.
- Arch overlay entries go in `shared/.config/mise/config.arch.toml`.

Prefer explicit entries over broad directory links. Do not link mutable state,
caches, histories, generated installs, secrets, or host-local files such as:

- `~/.local/share`
- `~/.local/state`
- `~/.config/fish/fish_variables`
- app caches, logs, databases, and generated package/tool installs

Validate dotfile changes before applying them:

```bash
mise dotfiles apply --dry-run -E macos
mise dotfiles apply --dry-run -E arch
```
