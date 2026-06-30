# Migration

## Migration from Existing Tools

### From pip/pip-tools
```bash
# Automated migration
uvx migrate-to-uv

# Or manual migration:
# 1. Create UV project
uv init

# 2. Import from requirements.txt
uv add -r requirements.txt
uv add --dev -r requirements-dev.txt

# 3. Commit new files
git add pyproject.toml uv.lock .python-version
git rm requirements.txt requirements-dev.txt
```

### From Poetry
```bash
# Automated migration
uvx migrate-to-uv

# UV reads pyproject.toml directly
# Just start using UV commands:
uv sync        # Replaces: poetry install
uv add pkg     # Replaces: poetry add pkg
uv run cmd     # Replaces: poetry run cmd
```

### From virtualenv/venv
```bash
# Old workflow:
# python -m venv .venv
# source .venv/bin/activate  # or .venv\Scripts\activate on Windows
# pip install -r requirements.txt

# New workflow:
uv init
uv add -r requirements.txt
uv run python script.py  # No activation needed
```

