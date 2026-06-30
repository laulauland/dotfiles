# Commands

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

