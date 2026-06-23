---
name: jujutsu
description: Jujutsu (jj) version control commands and workflows. Use when performing version control operations, committing changes, managing branches/bookmarks, or syncing with remotes. Always use jj instead of git.
---

# Jujutsu (jj) Version Control

Use `jj` instead of `git` for all version control operations.

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

## Non-Interactive Usage (Required)

**Always use non-interactive forms** - interactive commands open editors/diff tools.

### Commands That Require `-m` Flag

```bash
# CORRECT:
jj describe -m "message"
jj commit -m "message"

# BLOCKED (opens editor):
jj describe
jj commit
```

### Commands to Avoid

| Blocked Command | Alternative |
|-----------------|-------------|
| `jj diffedit` | `jj restore` or `jj squash` |
| `jj split` (no filesets) | `jj split -m "msg" <files>` |
| `jj resolve` | `jj resolve --list` then edit conflict markers |
| `jj squash -i` | `jj squash` (non-interactive) |
| `jj restore -i` | `jj restore <files>` |
| Any command with `--tool` | Use non-interactive alternatives |

### Splitting Commits

```bash
# CORRECT - provide filesets:
jj split -m "first part" src/file1.ts src/file2.ts

# BLOCKED - no filesets opens diff editor:
jj split
jj split -m "message"
```

### Resolving Conflicts

```bash
# View conflicts:
jj resolve --list

# Then edit conflict markers directly in files and run:
jj squash
```

## Common Commands

### View Status and Changes

```bash
jj status                    # Show working copy status
jj log                       # View commit history
jj diff                      # Show changes in working copy
jj show                      # Show a specific commit
```

### Making Changes

```bash
jj describe -m "message"     # Update current commit description
jj new                       # Create new commit on top of current
jj commit -m "message"       # Create new commit with current changes
jj squash                    # Squash changes into parent commit
```

### Working with Bookmarks/Branches

```bash
jj bookmark create name      # Create new bookmark
jj bookmark set name         # Move bookmark to current commit
jj bookmark list             # List all bookmarks
jj bookmark delete name      # Delete a bookmark
```

### Navigating History

```bash
jj edit <commit>             # Edit a specific commit
jj next                      # Move to child commit
jj prev                      # Move to parent commit
```

### Revsets & Templates (silent-wrong-answer traps)

Both surfaces are version-sensitive (verified on jj 0.42). Getting the form wrong
returns the *wrong* answer silently, not an error.

```bash
# Revsets — description() matches the WHOLE description, not a substring:
jj log -r 'description("stage 1:")'            # EMPTY — exact-match only
jj log -r 'description(substring:"stage 1:")'  # correct, case-sensitive
jj log -r 'description(substring-i:"stage 1")' # correct, case-insensitive
jj log -r 'children(X) ~ Y'                     # "child of X that is NOT Y" — difference is ~, not &
```

Change-id prefixes go **stale** after any rewrite — a captured prefix can stop resolving
just because the commit was rewritten. Re-resolve before reusing.

```bash
# Templates — call methods on self; use shortest() for ids you'll paste back:
jj log -T 'self.change_id().shortest(4) ++ " " ++ self.commit_id().shortest(8) ++ if(self.empty()," [E]"," [+]") ++ " | " ++ self.description().first_line() ++ "\n"'
```

- `commit_id()` alone is the full 40-char hash (jj rejects a half-pasted one as a
  nonexistent revision). `commit_id().short()` = 12 chars; `commit_id().shortest(N)` =
  minimal **unique** prefix — that's the pasteable form.
- `description`/`empty` are **methods on `self`** in commit templates (`self.empty()`),
  not bare functions.
- In `jj evolog` the entry type is `CommitEvolutionEntry`: reach the commit via
  `commit.commit_id()`, not `self.commit_id()`.

### Syncing with Remote

```bash
jj git fetch                 # Fetch from remote
jj git push                  # Push to remote
```

### Undoing Changes

```bash
jj undo                      # Undo last operation
jj restore <files>           # Restore files from parent commit
```

## Custom Aliases

These are configured in `~/.config/jj/config.toml`:

```bash
jj overview                  # Show diff stats and last 3 commits
jj l                         # Log last 15 commits with color
jj tug                       # Move bookmark from closest to parent
jj pull                      # Git fetch (alias)
jj push                      # Git push (alias)
jj sync                      # Fetch from all remotes
jj c                         # Commit (short)
jj ci                        # Commit (short for jj commit)
jj e                         # Edit (short)
jj s                         # Status (short)
jj parents                   # Show parents of current commit
jj merge <bookmark>          # Create merge commit
```

## Workspaces

Workspaces allow multiple working copies backed by a single `.jj` repo. Each workspace can have a different commit checked out.

### Commands

```bash
# Create a workspace
jj workspace add <path> --name <name>
jj workspace add ../feature-x --name feature-x
jj workspace add ../experiment --revision main  # Start from specific commit

# List workspaces
jj workspace list

# Find current workspace root
jj workspace root

# Delete a workspace (two steps)
jj workspace forget <name>  # Remove from jj tracking
rm -rf <path>               # Delete files manually

# Fix stale workspace (after external changes)
jj workspace update-stale
```

### Switching Workspaces

There's no `jj workspace switch` command - just `cd` into the workspace directory:

```bash
cd ../feature-x
jj log  # Shows feature_x@ for current workspace
```

### Critical Gotcha: Untracked Files

**Workspaces only share version-controlled files.** Files in `.gitignore` are NOT automatically present:

- `.env` files
- `node_modules/`
- Build artifacts (`dist/`, `build/`, `.next/`)
- IDE settings (`.idea/`, `.vscode/` if ignored)

You must manually copy or symlink these to new workspaces:

```bash
# After creating workspace
cd ../new-workspace
cp ../main/.env .env
# Or symlink node_modules if compatible
ln -s ../main/node_modules node_modules
```

### Use Cases

1. **Run tests while developing** - One workspace runs long tests, another for active development
2. **Parallel features** - Work on multiple features without stashing
3. **Quick experiments** - Throwaway workspace for "what if" scenarios

## Rewriting History (Squashing Related Commits)

When commits contain intermediate refactors, fixes, or iterations that should be consolidated:

### Review Recent History First

```bash
jj log --limit 15            # See recent commits
jj log -r "..@"              # All ancestors of current commit
```

### Squash Commits Together

```bash
# Squash current commit into parent:
jj squash

# Squash specific commit into another:
jj squash --from <source-rev> --into <target-rev>

# Squash range of commits into one:
jj squash --from <oldest>::<newest> --into <target>

# Move only specific paths (leaves the rest in the source):
jj squash --from <source-rev> --into <target-rev> <paths...>
```

Caveats: if the source is `@` and the squash empties it, jj abandons it and spawns a
stray empty `@` (see "Working-copy & squash hazards"). `-u` /
`--use-destination-message` **discards the source message** and keeps the destination's
— only pass it when you mean that.

### Edit Any Commit in History

```bash
# Change message of any commit:
jj describe -r <rev> -m "new message"

# Edit content of a commit (moves working copy there):
jj edit <rev>
# ... make changes ...
jj new                       # Return to new work
```

### Workflow: Clean Up Feature Branch

When you have intermediate commits like refactors, fixes, iterations:

```bash
# 1. Review what you have
jj log --limit 10

# 2. Identify logical groupings (e.g., all loop-related work)
# 3. Squash related commits into the main feature commit:
jj squash --from <refactor-rev> --into <feature-rev>
jj squash --from <fix-rev> --into <feature-rev>

# 4. Update the final commit message to reflect all changes:
jj describe -r <feature-rev> -m "feat: complete feature with cleanup"
```

### Example: Consolidate Iterative Work

If you have:
- `abc123`: feat: implement feature
- `def456`: refactor: clean up feature  
- `ghi789`: fix: edge case in feature

Squash them:
```bash
jj squash --from ghi789 --into abc123
jj squash --from def456 --into abc123
jj describe -r abc123 -m "feat: implement feature (cleaned up)"
```

### Resolving Rebase Conflicts After Deep Squashes

When squashing a validated top-of-stack change into older commits, especially with `--ignore-immutable`, conflicts may repeat through descendants. If the desired final content is already known and validated, prefer a source-of-truth resolution instead of hand-merging every marker.

Workflow:

```bash
# 1. Record the operation before the risky squash so validated files can be recovered.
jj op log --limit 5
# note <before-squash-op>

# 2. Squash one logical slice at a time, not the whole stack.
#    --use-destination-message is intentional here: we want the target's message, not the source's.
#    --keep-emptied avoids abandoning the source if the slice empties it.
jj squash --ignore-immutable --from <source> --into <target> --keep-emptied --use-destination-message <files...>

# 3. Inspect conflicted revisions and files.
jj log -r 'conflicts() & ::<tip>'
jj resolve --list -r <first-conflicted-rev>

# 4. Create a temporary child of the first conflicted commit.
jj new <first-conflicted-rev>

# 5. Replace conflicted files with the already-validated final version.
jj --at-op <before-squash-op> file show -r <source> <path> > <path>
# repeat for each conflicted path; preserve executable bit if needed:
chmod +x <path>

# 6. Squash the resolution into the conflicted parent and continue.
jj squash --use-destination-message

# 7. Repeat from step 3 if the same conflict reappears later in descendants.
```

Use this only when the final file content is known-good (e.g. tests passed before history surgery). It is faster and less error-prone than manually resolving the same semantic conflict many times. After the stack is clean, validate again:

```bash
jj log -r 'conflicts()'
jj status
# project checks, e.g. typecheck/tests
```

## Typical Workflow

```bash
# Start work
jj new                       # Create new change
# ... edit files ...
jj describe -m "feat: add feature"

# Review and push
jj overview                  # Check status
jj push                      # Push to remote

# Update from remote
jj sync                      # Fetch all remotes
```

