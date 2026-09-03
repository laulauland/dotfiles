---
name: inspect-repositories
description: Inspect an external project's real source from a reusable clone under ~/.explorer/repos. Use to understand implementation details, internals, or undocumented behavior that documentation, memory, and types do not establish.
allowed-tools: Bash(fd:*), Bash(rg:*), Bash(cd:*), Bash(git clone:*), Bash(git -C:*)
---

# Inspect Repositories

One place on this machine holds clones of external projects so you can read their
actual source:

```
~/.explorer/repos/<org>/<repo>
```

Use it whenever you need to understand how an external library, framework, or
dependency really works, rather than guessing from memory or types alone. Prefer
reading a local clone over fetching files over the network once you expect to
read more than one or two files.

## Repos already in the store

!`cd ~/.explorer/repos 2>/dev/null && fd -td --min-depth 2 --max-depth 2 | sort | rg . || echo "(none yet — store is empty; clone a repo to populate it)"`

## Reading an existing repo

If the project you need is listed above, read it straight from
`~/.explorer/repos/<org>/<repo>`. Search it with `rg` and `fd`, and open files
with your normal read tools.

## Loading a new repo

If it is not listed, clone it into the store, keeping the `<org>/<repo>` shape
from its URL. `git clone` creates the org directory for you:

```bash
git clone https://github.com/<org>/<repo> ~/.explorer/repos/<org>/<repo>
```

For large repos where you only need the current source, add `--depth 1`.

## Updating an existing repo

A clone may be stale. Before relying on it, refresh it:

```bash
git -C ~/.explorer/repos/<org>/<repo> pull --ff-only
```

If that fails because the clone is shallow or has diverged, re-fetch and reset:

```bash
git -C ~/.explorer/repos/<org>/<repo> fetch && \
git -C ~/.explorer/repos/<org>/<repo> reset --hard '@{u}'
```

## Rules

- Always use the lowercase `<org>/<repo>` layout that matches the upstream URL,
  so the store stays predictable and the listing above stays accurate.
- The store is read-only reference material. Never edit, commit, or push inside it.
- Keep one clone per project and reuse it across sessions instead of re-cloning
  somewhere else.
