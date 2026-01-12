# Registry Support

## Supported Package Registries

### npm (Node.js)

**Prefixes:** `npm:` or no prefix (default)

**Version Detection:** Checks in order:
1. `node_modules/{pkg}/package.json`
2. `package-lock.json`
3. `pnpm-lock.yaml`
4. `yarn.lock`
5. `package.json` (strips range prefixes like `^`, `~`)

**Scoped Packages:** Fully supported (e.g., `@babel/core`, `@types/node`)

**API Endpoint:** `https://registry.npmjs.org/{package}`

**Repository Resolution:** Extracts from `repository.url` field in package metadata

### PyPI (Python)

**Prefixes:** `pypi:`, `pip:`, or `python:`

**Version Syntax:**
- `pypi:requests==2.31.0` (pip style)
- `pypi:requests@2.31.0` (alternative)

**API Endpoint:** `https://pypi.org/pypi/{package}/json`

**Repository Resolution:** Extracts from project URLs:
- `project_urls.Source`
- `project_urls.Repository`
- `project_urls.Homepage` (if GitHub/GitLab)

### crates.io (Rust)

**Prefixes:** `crates:`, `cargo:`, or `rust:`

**Version Syntax:** `crates:serde@1.0.0`

**API Endpoint:** `https://crates.io/api/v1/crates/{crate}`

**Repository Resolution:** Extracts from `crate.repository` field

## Repository Hosts

### GitHub

**Formats:**
- `owner/repo`
- `github:owner/repo`
- `https://github.com/owner/repo`

**API:** `https://api.github.com/repos/{owner}/{repo}`

**Rate Limiting:** 60 requests/hour without auth

**Default Branch:** Fetched from API response

### GitLab

**Formats:**
- `gitlab:owner/repo`
- `https://gitlab.com/owner/repo`

**API:** `https://gitlab.com/api/v4/projects/{encoded_path}`

**Note:** Project path must be URL-encoded

### Bitbucket

**Formats:**
- `bitbucket:owner/repo`
- `https://bitbucket.org/owner/repo`

**Note:** Parsing supported, but no API resolution. Assumes `main` as default branch.

## Reference Syntax

Both `@ref` and `#ref` are supported for specifying branches, tags, or commits:

```bash
opensrc vercel/ai@v1.0.0      # Tag
opensrc vercel/ai@main        # Branch
opensrc vercel/ai#feature     # Branch (alternative)
opensrc vercel/ai@abc123      # Commit SHA
```

## Tag Resolution Order

When cloning at a specific version:

1. Try `v{version}` tag (e.g., `v3.22.0`)
2. Try `{version}` tag (e.g., `3.22.0`)
3. Fall back to default branch with warning

## URL Normalization

Registry URLs are normalized before use:
- Remove `git+` prefix
- Remove `.git` suffix
- Convert SSH URLs to HTTPS
- Handle various GitHub URL formats
