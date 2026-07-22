# pi-threads

A [Pi](https://pi.dev) extension that gives the agent tools for finding and reading past conversation sessions.

## Features

- **`find_threads`** searches session JSONL content with the native [`@ff-labs/fff-node`](https://github.com/dmtrKovalenko/fff) engine and returns authoritative metadata from `SessionManager.listAll()`.
- **`read_thread`** accepts a full or unambiguous partial session ID (or JSONL path) and reads the active branch through `SessionManager.open().getBranch()`.
- Supports Pi's default storage, `PI_CODING_AGENT_SESSION_DIR`, `--session-dir`, and ephemeral `--no-session` processes.
- Excludes the current thread by default.
- Uses Pi's standard 50 KB / 2,000-line output limit. Complete truncated output is preserved in a temporary Markdown file.
- Initializes FFF lazily and safely shares initialization between parallel tool calls.

## Installation

```bash
pi install npm:pi-threads
```

Or add it to `~/.pi/agent/settings.json`:

```json
{
  "packages": ["npm:pi-threads"]
}
```

## Tools

### `find_threads`

Search across projects or list recent sessions.

| Parameter | Description |
| --- | --- |
| `query` | Optional literal text searched with FFF |
| `cwd` | Optional partial working-directory filter |
| `limit` | 1–100 results; default 10 |
| `sort` | `recent`, `oldest`, or `relevance` |
| `include_current` | Include the active session; default `false` |

Example:

```text
Find threads about authentication in the auth-service project, then read the most relevant one.
```

### `read_thread`

Read one thread's active branch.

| Parameter | Description |
| --- | --- |
| `thread_id` | Full or unambiguous partial UUID, or JSONL path |
| `include_tool_results` | Include tool results; default `false` |
| `max_messages` | Return only the last N messages, up to 1,000 |

## Architecture

The Pi tool definitions are thin adapters over a `ThreadCatalog` module:

1. The active session manager determines the storage root.
2. `SessionManager.listAll()` provides IDs, names, timestamps, cwd values, and message counts.
3. A lazy FFF index maps content matches back to session paths and supplies relevance counts.
4. `SessionManager.open().getBranch()` resolves tree structure without guessing a leaf from JSONL order.
5. Pi truncation utilities enforce bounded model context while retaining complete oversized output on disk.

FFF resources are destroyed during session shutdown or when the storage root changes.

## License

MIT
