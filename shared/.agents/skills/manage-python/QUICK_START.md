# Quick Start

## Quick Start

### Installing UV

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows PowerShell
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# Update UV
uv self update
```

### Creating a New Project

```bash
# Initialize project (creates pyproject.toml, .python-version, .gitignore)
uv init my-project
cd my-project

# Add dependencies
uv add requests fastapi pandas

# Add development dependencies
uv add --dev pytest ruff mypy

# Add to custom groups
uv add --group docs sphinx
uv add --group test pytest-cov

# Run code (auto-syncs environment)
uv run python main.py
uv run pytest
```

