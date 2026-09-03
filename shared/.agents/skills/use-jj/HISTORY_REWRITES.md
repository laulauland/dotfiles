# History Rewrites

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

