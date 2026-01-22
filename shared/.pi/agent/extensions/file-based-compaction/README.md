# pi-agentic-compaction

A [pi](https://github.com/badlogic/pi-mono) extension that provides intelligent conversation compaction using a virtual filesystem approach.

## Features

- **Virtual filesystem exploration**: Uses [just-bash](https://github.com/nicolo-ribaudo/just-bash) to provide an in-memory filesystem where the conversation is available as `/conversation.json`
- **LLM-powered summarization**: The summarizer agent explores the conversation using jq, grep, head, tail, etc. without loading everything into context
- **Structured output**: Generates summaries with Main Goal, Key Decisions, Files Modified, Status, and Next Steps
- **Debug logging**: Saves compaction trajectories to `~/.pi/agent/compactions/` for debugging
- **Quality validation**: Validates summaries for structure and completeness before accepting

## Installation

```bash
pi install npm:pi-agentic-compaction
```

Or add to your `~/.pi/agent/settings.json`:

```json
{
  "packages": ["npm:pi-agentic-compaction"]
}
```

## How it works

When pi triggers compaction (either manually via `/compact` or automatically when approaching context limits), this extension:

1. Converts the conversation to JSON and mounts it at `/conversation.json` in a virtual filesystem
2. Spawns a summarizer agent with bash/jq tools to explore the conversation
3. The summarizer follows a structured exploration strategy:
   - Count messages and check the beginning (initial request)
   - Check the end (last 10-15 messages) for final state
   - Find all file modifications (write/edit tool calls)
   - Search for user feedback about bugs/issues
4. Validates the summary quality before accepting
5. Returns the summary to pi for storage

This approach keeps the summarizer's context small - it only loads what it queries, rather than the entire conversation at once.

## Configuration

The extension uses `cerebras/zai-glm-4.7` by default (fast), falling back to `claude-haiku-4-5` if unavailable. To change this, edit `index.ts`.

## Requirements

- pi coding agent
- Model that supports tool use (Anthropic, OpenAI, or Google)

## License

MIT
