# Agent Instructions

## MCP Tools

MCP (Model Context Protocol) servers are available in `~/.pi/agent/mcp/servers/`.

Server configurations are read from multiple sources (first match wins):
1. `~/.pi/agent/mcp.json` (pi's own config - recommended)
2. `~/.cursor/mcp.json` (Cursor)
3. Claude Desktop config (platform-specific path)
4. `~/.claude.json` (Claude Code - current project only, HTTP/SSE servers)

Before using an MCP tool:

1. **Discover servers**: `ls ~/.pi/agent/mcp/servers/` to see available servers
2. **Check status**: `cat <server>/_status.json` — if state is not "ready", tell the user to run `/mcp` to authenticate
3. **Read schema**: `cat <server>/tools/<tool>.md` to understand the tool parameters
4. **Invoke**: Use `mcp_call` with `server`, `tool`, and `args`

**Do not guess tool schemas.** Always read the `.md` file first.

### Example

```bash
# 1. List servers
ls ~/.pi/agent/mcp/servers/

# 2. Check if ready
cat ~/.pi/agent/mcp/servers/linear/_status.json

# 3. Read tool schema
cat ~/.pi/agent/mcp/servers/linear/tools/create_issue.md

# 4. Call the tool
mcp_call server=linear tool=create_issue args='{"title": "Fix bug", "teamId": "abc123"}'
```

### User Commands

Users can manage MCP servers with `/mcp` which opens an interactive menu to:
- View server status
- Sync tool schemas
- Authenticate/re-authenticate
- Remove servers

For CLI operations, use `mcpc` directly:
- `mcpc -c <config-file> <server> tools-list` — List tools
- `mcpc -c <config-file> <server> login` — Authenticate
