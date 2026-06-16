---
name: jj-megamerge
description: Workflow for jujutsu (jj) megamerges — local-only octopus merges that integrate multiple working branches. Use when the user mentions megamerges, octopus merges, parallel branches, or when `jj log` shows a commit described `megamerge` or `@` has a merge in its ancestry.
---

# jj Megamerge Workflow

A **megamerge** is a local-only octopus merge that combines all the user's active feature branches into one integrated working state. The user works in an empty WIP commit *above* the megamerge, then routes hunks back to individual branches with `jj absorb`. Only the individual branches are pushed — never the megamerge itself.

Reference: <https://isaaccorbrey.com/notes/jujutsu-megamerges-for-fun-and-profit>

## Detect that a megamerge is in play

Run before any non-trivial jj operation:

```bash
jj log -r 'closest_merge(@)' --no-graph -T 'description ++ "\n"'
```

If the description is `megamerge` (or output is non-empty and the merge is mutable), you are in the megamerge workflow. Other tells:
- `jj log` shows a commit labeled `megamerge` with 3+ parents
- `@` is empty with description `(no description set)` and parent is the megamerge
- `closest_pushable(@)` resolves to the megamerge itself (suspicious — verify before pushing)

## Hard rules

1. **Never push a megamerge.** It's in `git.private-commits` and `jj git push` will refuse. Do not pass `--allow-private` to override.
2. **Never edit `@` if `@` IS the megamerge.** Always work in the empty WIP commit above. If `@` is the megamerge, run `jj new` first.
3. **Always run `jj git push --dry-run` before the real push.** Confirm only the intended branches move.
4. **Don't fold the megamerge into a real merge.** Don't `jj describe` the megamerge to look like a normal merge commit — that defeats the private-commits filter.

## Available aliases

Configured in `~/.config/jj/config.toml`:

| Alias | Action |
|-------|--------|
| `jj mega <bookmark>...` | Create octopus merge from N bookmarks, leave empty WIP commit on top |
| `jj insert <rev>` | Place `<rev>` between `trunk()` and `closest_merge(@)` (becomes new merge parent) |
| `jj stage` | Move every non-empty commit above the megamerge into it as new parents |
| `jj restack` | Rebase mutable roots onto `trunk()` (lifts megamerge + branches together after `jj git fetch`) |

Plus the built-in `jj absorb` for routing hunks.

## Routing changes back to branches

After editing files in the WIP commit:

```bash
jj absorb        # auto-routes hunks to the ancestor commit that last touched those lines
```

If a hunk can't be auto-placed (new file, unrelated context), it stays in `@`. Route manually:

```bash
jj squash --to <branch-tip-rev> --interactive   # only if user is driving — interactive
jj squash --to <branch-tip-rev> <files>         # non-interactive, scoped by file
```

For brand-new work that should become its own branch:

```bash
# in the WIP commit
jj describe -m "feat-newthing: ..."
jj stage                              # inserts as new megamerge parent
jj bookmark create feat-newthing -r @-   # @- is the now-staged commit
```

## Updating against trunk

```bash
jj git fetch
jj restack
```

The megamerge and all branches lift onto the new trunk. Conflict resolution happens once at the megamerge level rather than on every branch.

## Pushing

```bash
jj git push --dry-run                  # ALWAYS first
jj git push --bookmark feat-auth       # one branch
jj git push --bookmark 'feat-*'        # glob
```

Never `jj git push -c <megamerge-rev>` or `jj git push --all` without inspecting the dry-run.

## Tearing down

The megamerge is just a commit. To dissolve it without touching branches:

```bash
jj abandon -r 'closest_merge(@)::'    # abandons megamerge + everything above
```

Branches remain untouched. Recreate later with `jj mega ...`.

## When to ask the user

- The user wants to push and dry-run shows the megamerge would be pushed → stop, surface the issue, do not pass `--allow-private`.
- `jj absorb` leaves significant residue in `@` and you can't tell which branch a change belongs to → ask before squashing.
- The megamerge has conflicts after `jj restack` → resolve in `@`'s ancestors carefully; never `jj abandon` the megamerge as a shortcut.
