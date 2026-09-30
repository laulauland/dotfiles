## Command Line Tools

- Use `fd` instead of `find`
- Use `rg` (ripgrep) instead of `grep`

## Version Control

Always use `jj` (Jujutsu), never `git`. Load the `use-jj` skill for the command reference before any version-control work.

Read-only `git` inspection (`git log`, `git diff`, `git show`, `git status`, `git blame`) is fine. Never run a `git` command that mutates the repository, worktrees, config, or remotes (`commit`, `push`, `pull`, `checkout`, `branch`, `merge`, `rebase`, `add`, `reset`, `stash`, `clone`, `init`, `fetch`, `tag`, `restore`, `switch`, `remote`, `config`, `worktree`). Use the `jj` equivalent.

Always rebase, never merge: when a branch or PR needs the latest main, rebase the stack onto `trunk()` and force-push — never create a "merge main into X" commit.

Always use non-interactive `jj` forms. Interactive commands open an editor or diff tool and hang the session:

- `jj describe`, `jj commit`, `jj squash`: always pass `-m "message"`.
- `jj split`: pass `-m` and explicit filesets.
- `jj diffedit`: never. Use `jj restore` or `jj squash` instead.
- `jj resolve`: only `jj resolve --list`; then edit conflict markers by hand.
- Never pass `-i`, `--interactive`, or `--tool`.

## Python

Use `uv` for every Python task. Never call `pip`, `poetry`, `python -m venv`, or a bare `python` interpreter directly.

- Run code and tools with `uv run` and `uvx`; never activate a virtualenv by hand.
- Manage dependencies with `uv add` and `uv remove`; start projects with `uv init`.
- Pin Python with `.python-version`. Commit `pyproject.toml`, `uv.lock`, and `.python-version`; never commit `.venv/`.
- Use `uv sync --frozen` and `uv lock --check` in CI and Docker.

## Writing style

Use ASD-STE100 Simplified Technical English to report to me.
