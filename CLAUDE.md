# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a dotfiles repository with one active deployment model:

- mise bootstraps packages, tools, repositories, dotfile links, and macOS defaults.
- `shared/` is always applied; `macos/` and `arch/` are platform-specific
  dotfile overlays selected with mise environments.

## Setup and Installation

### New Machine Bootstrap
```bash
# Preferred macOS path: converge packages, clone/update this repo, apply
# dotfiles, apply macOS defaults, and install mise tools
mise bootstrap --yes -E macos

# Existing checkout: install platform prerequisites, install mise tools, and link dotfiles
./bootstrap

# --defaults is accepted for compatibility; mise applies defaults
# by default now
./bootstrap --defaults

# Also change the login shell to fish
./bootstrap --fish-shell
```

`mise bootstrap --yes` uses `shared/.config/mise/config.toml` as the main
workstation manifest. It installs remaining Homebrew formulae, clones/updates
this repository at `~/code/laulauland/dotfiles`, applies shared and platform
dotfiles, installs Homebrew formulae through mise, installs Homebrew casks from
`Caskfile` via the post-packages hook, installs Mac App Store apps through mise,
applies native `[bootstrap.macos.*]` defaults, and installs mise-managed tools.

The `./bootstrap` script is for an existing checkout. On macOS it bootstraps
Homebrew + mise, installs this repo's mise config as the global config,
delegates macOS convergence to `mise bootstrap --yes -E macos --skip repos`.
On Arch Linux it installs mise through pacman, installs the shared + Arch mise
configs, applies packages plus the GitHub/yay post-package hook, then starts a
fresh mise process for the remaining bootstrap phases and tools.

- macOS: Uses mise bootstrap for remaining Homebrew formulae, Homebrew casks
  listed in `Caskfile`, Mac App Store apps, native macOS defaults, and
  mise-managed tools and dotfiles.
- macOS with `--defaults`: accepted for compatibility; native mise defaults are
  already applied by default
- macOS with `--fish-shell`: adds the Homebrew fish path to `/etc/shells` if
  needed and runs `chsh -s` for the current user
- Arch Linux: Uses pacman only to cross the initial mise boundary; mise owns
  declared pacman packages, portable tools, the fish login shell, agent
  dependencies, GitHub CLI authentication, `yay`, and dotfiles for `shared` +
  `arch`
- Codex: Uses OpenAI's standalone installer from a mise post-tools hook because
  remote control requires the managed standalone package layout

### Prerequisites
- macOS bootstrap installs Homebrew if it is missing, then installs mise before
  delegating to `mise bootstrap`. Installing Homebrew may prompt for sudo once;
  do not run the whole bootstrap script with sudo.
- Mac App Store installs require `mas` and an App Store login.
- Arch installs may prompt for sudo while pacman installs mise and while mise
  applies declared system packages or the login shell.
- Changing the login shell may prompt for sudo to update `/etc/shells`; do not
  run the whole bootstrap script with sudo.
- Use `mise dotfiles apply -E macos` or `mise dotfiles apply -E arch` when you
  only want to re-apply dotfiles.
- `./macos/defaults` remains available as a legacy way to re-apply macOS System
  Settings preferences; the preferred path is `mise bootstrap macos defaults apply`

## Configuration And Tooling Changes

Tool and setup changes belong in `shared/.config/mise/config.toml` unless they
are platform-specific.

- Add portable CLI tools under `[tools]`.
- Add macOS Homebrew formulae or Mac App Store apps under `[bootstrap.packages]`.
- Keep Homebrew casks in `Caskfile`; the mise post-packages hook installs it.
- Keep Arch system packages in `config.arch.toml`; only mise itself belongs in
  the pre-mise bootstrap.
- Arch bootstrap installs `yay` after mise-owned packages are available; invoke
  it from an idempotent mise hook when an AUR package is needed.

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

## Architecture

### Directory Structure
```
dotfiles/
├── shared/           # Cross-platform configurations
│   ├── .local/bin/   # Custom executable scripts (added to PATH)
│   └── .config/      # Application configurations
├── macos/           # macOS-specific configurations
├── arch/            # Arch server-specific dotfile overlay
├── bootstrap        # Dependency + dotfile bootstrap script
└── macos/defaults   # Portable macOS System Settings preferences
```

### Key Configuration Areas

#### Jujutsu (jj) Version Control
- Config: `shared/.config/jj/config.toml`
- Custom aliases for common workflows:
  - `overview`: Status + recent log
  - `tug`: Move bookmark from previous commit
  - `pushall`: Push to all remotes
  - `merge`: Interactive merge workflow
- Work-specific email configuration for `~/Code/work` repositories

#### Tmux Configuration
- Config: `shared/.config/tmux/tmux.conf`
- Prefix: `C-x` (replaces default C-b)
- Features WezTerm-inspired keybindings and workflow
- Key bindings:
  - `Leader + |`: Horizontal split
  - `Leader + -`: Vertical split
  - `Leader + f`: Sessionizer script
  - `Leader + w`: Session switching
  - Vim-style navigation with hjkl
- Custom scripts:
  - `tmux-monitor`: Interactive pane monitoring with fzf selection and filtering

#### Shell Prompt
- Uses Starship prompt with custom jj integration
- Config: `shared/.config/starship.toml`
- Features time display, directory, and jj status

#### Editor Configurations
- Neovim: Full Lua configuration in `shared/.config/nvim/`
- Zed: macOS-specific config with snippets and keybindings

## Development Workflow

### Version Control
This repository uses Jujutsu (jj) as the primary VCS. Common commands:
```bash
jj overview          # Status + recent commits
jj c                 # Commit changes
jj ci                # Interactive commit
jj l                 # Extended log view
jj sync              # Fetch from all remotes
jj pushall           # Push to all configured remotes
```

### Verification
- Use `./bootstrap` from an existing checkout to install/update platform
  prerequisites, mise tools, and dotfiles
- Use `mise bootstrap --yes -E macos` on macOS when you want the full declarative flow,
  including repo clone/update and System Settings defaults
- Use `mise dotfiles apply --dry-run -E macos` or
  `mise dotfiles apply --dry-run -E arch` to inspect dotfile changes
- No formal test suite - configuration changes are deployed directly

### File Organization
- Cross-platform configs go in `shared/`
- macOS-specific configs go in `macos/`
- Arch server-specific configs go in `arch/`
- Add symlink management to `shared/.config/mise/config.toml`; add platform
  overlays to `config.macos.toml` or `config.arch.toml`.

## Special Considerations

### Tmux Integration
- Custom sessionizer script at `shared/.config/tmux/scripts/sessionizer.sh`
- Vim-tmux navigation integration without requiring plugins
- TPM plugin manager for extensions

### Multi-Environment Support
- Jujutsu config includes conditional work email based on repository path
- Separate platform directories allow OS-specific tool configurations
- Shared base configuration reduces duplication

## Key Tools and Dependencies
- Jujutsu (jj) for version control
- Starship for shell prompt
- Tmux with custom configuration
- Neovim with Lua configuration
- Platform-specific: Zed (macOS), Karabiner Elements (macOS)
