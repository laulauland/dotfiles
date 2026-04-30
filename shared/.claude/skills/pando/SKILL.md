---
name: pando
description: Create per-feature copy-on-write workspaces from a directory, with native jj integration. Use when the user wants to spin up an isolated working copy to try something in parallel — especially in repos with heavy untracked state (node_modules, target/, .venv, build caches) that would be expensive to rebuild in a fresh `jj workspace add`. Triggers — "make a workspace", "branch but keep my build artifacts", "try X without disturbing current work", "spin up a disposable copy of this repo", or any mention of `pando` / `pd`.
---

# pando

`pando` (also installed as `pd`) creates a fresh working copy of the current directory using the platform's copy-on-write primitive (APFS `clonefile` on macOS, OverlayFS on Linux, recursive copy elsewhere). When the source is a jj repo, the new path is also registered as a native jj workspace named `pando-<name>` with its own `@`, so commits there land in the canonical operation log.

## When to reach for pando vs. alternatives

The substantive win over plain `jj workspace add` is preserving the *current directory's* untracked state — `node_modules/`, `target/`, `.venv/`, build caches, dirty edits — at near-zero cost. `jj workspace add` only materializes tracked files at a chosen revision, so anything ignored has to be reinstalled or rebuilt per workspace.

- **Use pando** when the user wants a disposable parallel working copy AND the repo has expensive untracked state, or they explicitly mention pando/pd.
- **Use `jj workspace add`** when the user already has a clean repo and just wants another `@` — it's lighter and doesn't need pando installed.
- **Use a new git worktree / branch** only if jj is not in use (this repo standardises on jj).

## Commands

```
pando create <name> [--from <revset>]   # create workspace, prints abs path on stdout
pando list                              # NAME / AGE / BASE / JJ (tab-separated)
pando remove <name> [--keep-jj-workspace]
pando rm <name>                         # alias of remove
pando completions <shell>               # bash | zsh | fish | elvish | powershell
```

The same CLI is also installed as `pd`. State lives under `$PANDO_HOME` (default `~/.local/state/pando`).

## Common patterns

**Spin up and enter a workspace in one shot** — `pando create` prints the absolute path:

```bash
cd "$(pando create feature-x)"
```

**Base the workspace on a specific jj revision** (must resolve to exactly one commit; silently ignored outside a jj repo):

```bash
pando create review --from 'main@origin'
pando create hotfix --from 'tag:v1.2.3'
```

**Tear down**: removes the state directory AND forgets the jj workspace registration.

```bash
pando rm feature-x
```

Pass `--keep-jj-workspace` only if the user explicitly wants pando state gone but the jj registration kept (rare — usually for retrying a failed forget by hand).

## Rules and gotchas

1. **Names cannot contain whitespace or path separators.** Use kebab/snake-case, e.g. `feature-x`, `review_2025_04`.
2. **Run `pando create` from inside the source directory.** There is no `--source` flag; the source is always `$PWD`.
3. **`--from` is silently ignored when the source is not a jj repo.** Don't assume it took effect on a non-jj source.
4. **`pando create` is atomic.** If jj registration fails, the state directory is rolled back. If `pando rm`'s jj forget step fails, pando state is preserved so the user can retry.
5. **The workspace is a real directory the user `cd`s into.** Edits there don't touch the canonical source tree (CoW divergence on first write).
6. **On Linux, OverlayFS may require mount privileges.** If `create` fails with EPERM, that's the cause.
7. **`pando completions` writes to stdout** — redirect into the shell's completions directory, e.g. `pando completions fish > ~/.config/fish/completions/pando.fish`.

## Inspecting state

```bash
pando list                              # workspaces, ages, base commits
ls "$PANDO_HOME"                        # raw state dirs
cat "$PANDO_HOME/<name>/meta.toml"      # name, created_at, canonical_root, workspace_path, jj{}
```

From inside the canonical jj repo, registered pando workspaces also show up in `jj workspace list` as `pando-<name>:...`.
