# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a dotfiles repository with two deployment paths:

- GNU Stow for macOS workstation and Arch server dotfiles.
- NixOS flakes for declarative NixOS hosts.

## Setup and Installation

### Initial Setup
```bash
# Install workstation dependencies and dotfiles
./bootstrap

# Also apply portable macOS System Settings defaults
./bootstrap --defaults

# Also change the login shell to fish
./bootstrap --fish-shell
```

This script installs platform dependencies, then deploys stow-managed home
configuration:

- macOS: Installs Homebrew packages from `Brewfile` and `Caskfile`, then deploys
  `shared` + `macos` directories
- macOS: Installs Mac App Store apps from `Masfile` when `mas` is available and
  the user is signed in to the App Store
- macOS with `--defaults`: also applies portable System Settings preferences
  from `macos/defaults`
- macOS with `--fish-shell`: adds Homebrew fish to `/etc/shells` if needed and
  runs `chsh -s` for the current user
- Arch Linux: Deploys `shared` + `arch` directories
- NixOS: Use `./nixos/switch`, which infers the host and runs `nixos-rebuild`

Linux desktop stow configuration is currently archived. NixOS hosts are managed
from `nixos/`.

### Prerequisites
- macOS bootstrap installs Homebrew if it is missing, then installs GNU Stow from
  `Brewfile`. Installing Homebrew may prompt for sudo once; do not run the whole
  bootstrap script with sudo.
- Mac App Store installs require `mas` and an App Store login.
- Changing the login shell may prompt for sudo to update `/etc/shells`; do not
  run the whole bootstrap script with sudo.
- `./stow` remains available when you only want to re-apply dotfiles
- `./macos/defaults` remains available when you only want to re-apply macOS
  System Settings preferences

## Architecture

### Directory Structure
```
dotfiles/
├── shared/           # Cross-platform configurations
│   ├── .local/bin/   # Custom executable scripts (added to PATH)
│   └── .config/      # Application configurations
├── macos/           # macOS-specific configurations
├── arch/            # Arch server-specific stow overlay
├── flake.nix        # NixOS flake entrypoint
├── nixos/           # NixOS modules and host definitions
├── archive/         # Archived configs such as the old Linux desktop stow layer
├── snippets/        # Code snippets (TypeScript, etc.)
├── bootstrap        # Dependency + dotfile bootstrap script
├── macos/defaults   # Portable macOS System Settings preferences
└── stow             # Dotfile deployment script
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

### Configuration Testing
- Use `./bootstrap` to install/update macOS dependencies and apply dotfiles
- Use `./bootstrap --defaults` when a macOS machine should also receive System
  Settings defaults
- Use `./stow` to test only macOS and Arch stow changes
- Use `./nixos/switch` on NixOS hosts
- No formal test suite - configuration changes are deployed directly

### File Organization
- Cross-platform configs go in `shared/`
- macOS-specific configs go in `macos/`
- Arch server-specific configs go in `arch/`
- NixOS host state goes in `nixos/hosts/<host>/`
- Reusable NixOS modules go in `nixos/modules/`
- Use stow's dotfiles feature (files prefixed with `dot-` become `.filename`)

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
- GNU Stow (required for deployment)
- Jujutsu (jj) for version control
- Starship for shell prompt
- Tmux with custom configuration
- Neovim with Lua configuration
- Platform-specific: Zed (macOS), Karabiner Elements (macOS)
