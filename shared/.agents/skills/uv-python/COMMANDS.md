# Commands

## Essential Commands Reference

### Project Lifecycle
```bash
uv init [name]              # Create new project with structure
uv add <package>            # Add dependency (updates pyproject.toml + uv.lock)
uv add --dev <package>      # Add development dependency
uv add --group <name> <pkg> # Add to custom dependency group
uv remove <package>         # Remove dependency
uv sync                     # Install/sync all dependencies
uv sync --frozen            # Sync without updating lock (CI mode)
uv sync --no-dev            # Production install (exclude dev deps)
uv run <command>            # Run command in project environment
uv build                    # Build distribution packages
uv publish                  # Publish to PyPI
```

### Python Version Management
```bash
uv python install 3.12      # Install Python version
uv python install 3.11 3.12 # Install multiple versions
uv python list              # List installed Python versions
uv python pin 3.12          # Pin project to Python version
uv python find              # Show active Python version
```

### Virtual Environments
```bash
uv venv                     # Create virtual environment (.venv/)
uv venv --python 3.12       # Create with specific Python version
uv venv my-env              # Create with custom name
```

### Lock File Management
```bash
uv lock                     # Update lockfile from pyproject.toml
uv lock --upgrade           # Upgrade all dependencies
uv lock --upgrade-package <pkg>  # Upgrade specific package
uv lock --check             # Verify lock is current (CI check)
uv export --format requirements-txt > requirements.txt  # Export format
```

### Tool Management (replaces pipx)
```bash
uvx <tool>                  # Run tool temporarily (no install)
uvx ruff check .            # Example: run ruff once
uv tool install <tool>      # Install tool globally
uv tool list                # List installed tools
uv tool uninstall <tool>    # Remove global tool
```

### Maintenance
```bash
uv cache clean              # Clean cache
uv cache dir                # Show cache location
uv self update              # Update UV itself
```

