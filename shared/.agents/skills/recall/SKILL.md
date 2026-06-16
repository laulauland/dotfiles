---
name: recall
description: Search past coding agent sessions for context, decisions, patterns, and solutions. Use when the user asks about prior work, wants to find how something was done before, or needs context from past sessions.
---

# Recall

`lr` queries past Claude Code session logs (JSONL) via embedded ClickHouse. Use it to find prior decisions, error patterns, file history, and solutions from past sessions.

## Commands

```bash
lr query "<sql>"                        # raw SQL over session JSONL, output is JSONL
lr search "<keyword>" [--all] [--limit N] [--format json|jsonl|human]
lr sessions                             # list sessions for current project
```

## JSONL structure

Each line in a session file has:

```
type           — "user" | "assistant" | "progress" | "system"
timestamp      — ISO 8601
sessionId      — UUID
isSidechain    — bool (true = subagent, filter out)
message.role   — "user" | "assistant"
message.content — string (user text) or JSON array of content blocks
```

Content blocks: `{"type":"text","text":"..."}`, `{"type":"tool_use","name":"Edit","input":{...}}`, `{"type":"tool_result","content":"...","is_error":true/false}`

## File sources

```sql
-- Current project
file('$HOME/.claude/projects/-Users-name-project/*.jsonl', JSONAsString)

-- All projects
file('$HOME/.claude/projects/*/*.jsonl', JSONAsString)
```

`JSONAsString` puts each line in a `json` column. Use `JSONExtractString(json, 'field')` to access fields.

## Query cookbook

**Keyword search** — find sessions where a topic came up:
```bash
lr query "SELECT JSONExtractString(json, 'sessionId') as sid, JSONExtractString(json, 'timestamp') as ts, JSONExtractString(json, 'type') as type, left(JSONExtractString(json, 'message', 'content'), 500) as content FROM file('$HOME/.claude/projects/*/*.jsonl', JSONAsString) WHERE json ILIKE '%KEYWORD%' AND JSONExtractString(json, 'type') IN ('user', 'assistant') ORDER BY ts DESC LIMIT 20"
```

**File history** — find sessions that touched a specific file:
```bash
lr query "SELECT DISTINCT JSONExtractString(json, 'sessionId') as sid, min(JSONExtractString(json, 'timestamp')) as started, max(JSONExtractString(json, 'timestamp')) as ended FROM file('$HOME/.claude/projects/*/*.jsonl', JSONAsString) WHERE json LIKE '%src/path/to/file.ts%' GROUP BY sid ORDER BY ended DESC LIMIT 10"
```

**Recent errors** — find tool execution failures:
```bash
lr query "SELECT JSONExtractString(json, 'sessionId') as sid, JSONExtractString(json, 'timestamp') as ts, left(JSONExtractString(json, 'message', 'content'), 500) as content FROM file('$HOME/.claude/projects/*/*.jsonl', JSONAsString) WHERE json LIKE '%is_error%true%' AND JSONExtractString(json, 'type') = 'user' ORDER BY ts DESC LIMIT 20"
```

**Error frequency** — find recurring failure patterns:
```bash
lr query "SELECT count() as hits, left(JSONExtractString(json, 'message', 'content'), 200) as error_content FROM file('$HOME/.claude/projects/*/*.jsonl', JSONAsString) WHERE json LIKE '%is_error%true%' AND JSONExtractString(json, 'type') = 'user' GROUP BY error_content ORDER BY hits DESC LIMIT 15"
```

**Session deep-dive** — read full conversation from a session:
```bash
lr query "SELECT JSONExtractString(json, 'timestamp') as ts, JSONExtractString(json, 'type') as type, left(JSONExtractString(json, 'message', 'content'), 500) as content FROM file('$HOME/.claude/projects/*/*.jsonl', JSONAsString) WHERE JSONExtractString(json, 'sessionId') = 'UUID-HERE' AND JSONExtractString(json, 'type') IN ('user', 'assistant') ORDER BY ts LIMIT 50"
```

**Multi-keyword** — narrow with multiple terms:
```bash
lr query "SELECT ... WHERE json ILIKE '%auth%' AND json ILIKE '%middleware%' AND ..."
```

## Guidelines

1. Start broad (`*/*.jsonl`), narrow to specific projects if too noisy.
2. `ILIKE` for case-insensitive keywords, `LIKE` for exact/structural matches.
3. When you find a relevant sessionId, deep-dive into it for full context.
4. Synthesize findings for the user — report decisions, patterns, solutions. Don't dump raw JSON.
5. Use `<>` instead of `!=` in SQL — bash history expansion mangles `!` in double quotes.
6. `lr search "keyword" --format json` is a shortcut for simple keyword searches.
