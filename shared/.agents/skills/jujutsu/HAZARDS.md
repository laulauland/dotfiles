# Hazards

## Key Differences from Git

- jj automatically commits changes (working copy is always a commit)
- Use `jj describe` to update commit messages instead of `git commit --amend`
- No staging area - all changes are part of working copy commit
- `jj new` creates a new commit on top, making previous commit immutable

### Working-copy & squash hazards (read before history surgery)

These three habits prevent the most expensive jj failures — a polluted commit, a lost
description, and a stray empty `@` — that cascade from each other.

1. **Park `@` where edits should land BEFORE writing files.** jj auto-snapshots the
   working copy into whatever `@` points at. If `@` sits on an empty *planned* commit
   (e.g. a `stage 1` placeholder) and you create files, they snapshot **into that
   commit**, polluting it. To put new files in their own commit first:

   ```bash
   jj new --insert-after <spec> -m "docs: the new commit"   # @ lands here; the old child reparents automatically
   # NOW write the files -> they snapshot into THIS commit, not the planned one
   jj new                                                    # optional: leave a fresh empty @ so the next edit doesn't grow this commit
   ```

   Already polluted a commit? Carve files out with `jj split <rev> <paths...>` — do NOT
   squash them out of `@` (see next point).

2. **Never squash the *entire* contents out of `@`.** `jj squash --from @ --into Y`
   that empties `@` makes jj **abandon** the now-empty working-copy commit — taking its
   description with it — and spawn a stray `(no description set)` `@`. Symptoms: "my
   commit lost its description", "a stray empty `@` appeared", "the planned commit
   dropped out of the chain". To move content out of `@` use `jj split`; to move files
   between two non-`@` commits use a path-scoped squash:
   `jj squash --from <src> --into <dst> <paths...>`.

3. **Confirm every mutation; don't background jj.** `squash`/`split`/`describe` print
   what they changed — if you saw no output, assume it **didn't run**. After a squash,
   verify with `jj diff -r <dst> --stat` (moved files appear) and `jj diff -r <src>
   --stat` (they're gone). `jj op log` shows each operation's `args:`; `jj undo` reverts
   the last one.

