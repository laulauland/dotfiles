# Reference

## Best Practices Checklist

- ✅ Always commit `uv.lock` and `.python-version` to version control
- ✅ Use `uv sync --frozen` in CI/CD pipelines
- ✅ Add `.venv/` to `.gitignore` and `.dockerignore`
- ✅ Pin UV version in CI for consistency
- ✅ Use `uv run` instead of manual environment activation
- ✅ Specify `requires-python` range in `pyproject.toml`
- ✅ Use dependency groups for dev tools, not optional-dependencies
- ✅ Test with `--resolution lowest` for libraries
- ✅ Enable bytecode compilation in Docker: `UV_COMPILE_BYTECODE=1`
- ✅ Use cache mounts in Docker for faster builds
- ✅ Run `uv lock --check` in CI to catch outdated lockfiles
- ✅ Leverage inline script dependencies (PEP 723) for portable tools
- ✅ Document UV setup in README for team onboarding

## Performance Impact

UV achieves dramatic speed improvements:
- **8-10x faster** than pip without caching
- **80-115x faster** with warm cache
- **Virtual environment creation:** 100ms vs 8 seconds (python -m venv)
- **Complex dependency resolution:** seconds vs minutes
- **CI/CD impact:** 30-65% faster builds

This speed enables new workflows like re-syncing environments on every command invocation without performance penalties.

## Key Differences from Other Tools

### vs pip
- **Speed:** 8-100x faster
- **Lock files:** Built-in universal lockfiles
- **Python management:** Can install Python versions
- **Unified:** Replaces pip + pip-tools + virtualenv

### vs Poetry
- **Speed:** Significantly faster resolution and installation
- **Lock files:** Universal (cross-platform in one file)
- **Simpler:** Less configuration required
- **Compatible:** Reads Poetry's pyproject.toml

### vs Conda
- **Scope:** Python-only (doesn't handle system dependencies)
- **Speed:** Much faster for Python packages
- **Compatibility:** Standard PyPI ecosystem
- **Not a replacement:** Use Conda when you need non-Python dependencies

## Support and Resources

- **Documentation:** https://docs.astral.sh/uv/
- **GitHub:** https://github.com/astral-sh/uv
- **Discord:** Join Astral's community
- **Changelog:** https://github.com/astral-sh/uv/releases

## Summary

UV standardizes Python development by unifying package management, environment management, Python version management, and script execution into a single fast tool. The key workflow is:

1. `uv init` to create projects
2. `uv add` to manage dependencies
3. `uv run` to execute code
4. `uv sync --frozen` in CI/CD
5. Commit `uv.lock` and `.python-version`

This provides consistent, fast, reproducible Python workflows across all platforms.
