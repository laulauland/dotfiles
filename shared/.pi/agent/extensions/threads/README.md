# pi-threads

A [pi](https://github.com/badlogic/pi-mono) extension that provides tools for searching and reading past conversation sessions.

## Features

- **`find_threads` tool**: Search through past conversations using ripgrep for sub-20ms search performance
- **`read_thread` tool**: Read a specific conversation thread by ID or file path
- **Custom rendering**: Compact and expanded views with proper theming
- **Lazy parsing**: Only parse files that match search criteria

## Installation

```bash
pi install npm:pi-threads
```

Or add to your `~/.pi/agent/settings.json`:

```json
{
  "packages": ["npm:pi-threads"]
}
```

## Tools

### find_threads

Search through past conversation sessions.

**Parameters:**
- `query` (optional): Text to search for in messages (uses ripgrep)
- `cwd` (optional): Filter by working directory (partial match)
- `limit` (optional): Maximum results to return (default: 10)
- `sort` (optional): Sort order - "recent" (default), "oldest", or "relevance"

**Example usage by LLM:**
```
Find threads about "authentication" in the auth-service project
```

### read_thread

Read a specific conversation thread by ID or file path.

**Parameters:**
- `thread_id`: Thread ID (session UUID) or file path
- `include_tool_results` (optional): Include tool call results in output (default: false)
- `max_messages` (optional): Maximum messages to return (default: all)

**Example usage by LLM:**
```
Read thread abc123-def456 to see the authentication implementation discussion
```

## Use Cases

- **Context retrieval**: "What did we decide about the API design last week?"
- **Code archaeology**: "Find the thread where we implemented the caching layer"
- **Continuation**: "What was the status of the refactoring work?"
- **Knowledge transfer**: "Show me conversations about the payment integration"

## License

MIT
