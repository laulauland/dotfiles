# Non-Interactive Usage

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

