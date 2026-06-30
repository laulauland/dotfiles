# Overview

## When to Use This Skill

Use this skill when:
- Creating new Python projects
- Managing dependencies and lockfiles
- Setting up virtual environments
- Installing or switching Python versions
- Building or publishing packages
- Optimizing CI/CD pipelines
- Migrating from pip, poetry, or other tools
- Creating portable Python scripts
- Working with Docker containers

## Core Principles

1. **Project-first workflow**: Use `uv init` and `uv add` instead of manual configuration
2. **Lock file discipline**: Always commit `uv.lock` for reproducibility
3. **Universal execution**: Use `uv run` instead of manual environment activation
4. **Version pinning**: Use `.python-version` for team consistency
5. **Fast by default**: Leverage caching and parallel operations (8-100x faster than pip)

