# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a cross-platform dotfiles repository using GNU Stow for deployment. The configuration supports both macOS and Linux environments with shared configurations.

## Setup and Installation

### Initial Setup
```bash
# Install dotfiles (requires GNU stow)
./stow
```

This script automatically detects the operating system and deploys the appropriate configurations:
- macOS: Deploys `shared` + `macos` directories
- Linux: Deploys `shared` + `linux` directories

### Prerequisites
- GNU Stow must be installed
- The script will error with a helpful message if stow is missing

## Architecture

### Directory Structure
```
dotfiles/
├── shared/           # Cross-platform configurations
│   ├── .local/bin/   # Custom executable scripts (added to PATH)
│   └── .config/      # Application configurations
├── macos/           # macOS-specific configurations
├── linux/           # Linux-specific configurations
├── snippets/        # Code snippets (TypeScript, etc.)
└── stow             # Deployment script
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
- Use `./stow` to test changes
- No formal test suite - configuration changes are deployed directly

### File Organization
- Cross-platform configs go in `shared/`
- OS-specific configs in respective `macos/` or `linux/` directories
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
