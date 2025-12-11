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

