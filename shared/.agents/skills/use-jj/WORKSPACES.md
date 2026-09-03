# Workspaces

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

