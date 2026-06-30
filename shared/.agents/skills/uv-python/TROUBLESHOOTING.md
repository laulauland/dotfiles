# Troubleshooting

## Troubleshooting

### Common Issues

**Lock file out of sync:**
```bash
# Error: "lock file is out of date"
uv lock  # Regenerate lock file
```

**Python version not found:**
```bash
# Error: "Python 3.12 not found"
uv python install 3.12
```

**Dependency conflicts:**
```bash
# Check resolution
uv lock --verbose

# Try upgrading
uv lock --upgrade

# Check specific package
uv lock --upgrade-package problematic-package
```

**Cache issues:**
```bash
# Clean cache if corrupted
uv cache clean

# Show cache location
uv cache dir
```

**Import resolution issues:**
```bash
# Ensure environment is synced
uv sync

# Force reinstall
uv sync --reinstall
```

