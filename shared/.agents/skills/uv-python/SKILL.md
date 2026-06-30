---
name: uv-python
description: Standardize Python development using UV - a fast, unified package and project manager. Use when creating Python projects, managing dependencies, setting up virtual environments, installing Python versions, or optimizing Python workflows. Replaces pip, virtualenv, pyenv, poetry, and pipx with a single 10-100x faster tool.
---

# uv-python

Use uv as the default Python project, dependency, environment, interpreter, script, and tool runner unless a repository has already chosen a different workflow.

## Branch table

| Need | Read |
|---|---|
| When to use uv and the core principles | [OVERVIEW.md](OVERVIEW.md) |
| Install uv and start a new project | [QUICK_START.md](QUICK_START.md) |
| Command reference for projects, Python versions, virtual environments, lockfiles, tools, and maintenance | [COMMANDS.md](COMMANDS.md) |
| Recommended project layout and `pyproject.toml` structure | [PROJECTS.md](PROJECTS.md) |
| Dependency management, `uv run`, PEP 723 scripts, Python pinning, CI, and Docker | [WORKFLOWS.md](WORKFLOWS.md) |
| Migration from pip, pip-tools, Poetry, virtualenv, or venv | [MIGRATION.md](MIGRATION.md) |
| Common failures and the best-practices checklist | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| Performance, differences from other tools, resources, and summary | [REFERENCE.md](REFERENCE.md) |

## Core uv workflow

1. Start projects with `uv init`.
2. Manage dependencies with `uv add` and `uv remove`.
3. Run commands with `uv run` instead of activating environments manually.
4. Pin Python with `.python-version` and keep `requires-python` current.
5. Commit `pyproject.toml`, `uv.lock`, and `.python-version`; never commit `.venv/`.
6. Use `uv sync --frozen` and `uv lock --check` in CI.

## Completion checks

Before finishing uv-related work, confirm that:

- The relevant branch file above was loaded for the task.
- `uv.lock` is present and current when dependencies changed.
- `.python-version` is committed or intentionally absent for a documented reason.
- Commands in documentation or scripts use `uv run`, `uv sync`, or `uvx` rather than manual activation plus `pip` when uv owns the workflow.
- CI and Docker examples use frozen lockfile installs where reproducibility matters.
