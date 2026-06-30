# Workflows

## Key Workflows

### Dependency Management

**Adding dependencies:**
```bash
# Single package
uv add requests

# Multiple packages
uv add requests pandas numpy

# With version constraints
uv add "fastapi>=0.115.0,<1.0.0"

# With extras
uv add "fastapi[standard]"

# Development dependencies
uv add --dev pytest ruff mypy

# Optional dependency groups
uv add --optional plotting matplotlib seaborn
```

**Managing versions:**
```bash
# Upgrade all dependencies
uv lock --upgrade

# Upgrade specific package
uv lock --upgrade-package requests

# Pin to latest compatible versions
uv add requests --upgrade
```

### Running Code

**Always use `uv run` instead of activating environments:**
```bash
# Run Python scripts
uv run python script.py
uv run python -m mymodule

# Run installed tools
uv run pytest
uv run ruff check .
uv run mypy src/

# Run with specific Python version
uv run --python 3.12 python script.py

# Pass arguments
uv run pytest tests/ -v --cov
```

**Why `uv run` is better:**
- Auto-syncs environment before running
- Works cross-platform without activation scripts
- Ensures reproducibility
- Handles environment discovery automatically

### Inline Script Dependencies (PEP 723)

Create portable single-file scripts:

```python
#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "requests",
#     "rich",
# ]
# ///

import requests
from rich import print

response = requests.get("https://api.github.com")
print(response.json())
```

Run with: `uv run script.py` (automatically installs dependencies)

### Python Version Management

**Project-level pinning:**
```bash
# Pin Python version for project
uv python pin 3.12

# This creates .python-version file
# Always commit this file to git

# UV will automatically use this version
uv run python --version
```

**Installing Python versions:**
```bash
# Install specific version
uv python install 3.12

# Install multiple versions
uv python install 3.11 3.12 3.13

# List available versions
uv python list --all-versions

# List installed versions
uv python list
```

### CI/CD Integration

**GitHub Actions example:**
```yaml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up UV
        uses: astral-sh/setup-uv@v6
        with:
          version: "0.9.5"  # Pin UV version
          enable-cache: true
      
      - name: Set up Python
        run: uv python install
      
      - name: Install dependencies
        run: uv sync --frozen  # Use --frozen in CI
      
      - name: Check lock file is current
        run: uv lock --check
      
      - name: Run tests
        run: uv run pytest
      
      - name: Run linting
        run: uv run ruff check .
```

**Docker optimization:**
```dockerfile
FROM python:3.12-slim

# Install UV
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Set working directory
WORKDIR /app

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install dependencies with caching
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# Copy application code
COPY . .

# Compile bytecode for faster startup
ENV UV_COMPILE_BYTECODE=1

# Run application
CMD ["uv", "run", "python", "-m", "myapp"]
```

**Multi-stage Docker build:**
```dockerfile
# Stage 1: Build
FROM python:3.12-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-editable

# Stage 2: Runtime
FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY . .
ENV PATH="/app/.venv/bin:$PATH"
ENV UV_COMPILE_BYTECODE=1
CMD ["python", "-m", "myapp"]
```

