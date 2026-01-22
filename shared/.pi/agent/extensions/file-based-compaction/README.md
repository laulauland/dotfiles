# pi-agentic-compaction

A [pi](https://github.com/badlogic/pi-mono) extension that provides conversation compaction using a virtual filesystem approach.

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
4. Returns the summary to pi

### Comparison with pi's built-in compaction

**pi's default compaction** (in `core/compaction/compaction.ts`):

1. Serializes the entire conversation to text
2. Wraps it in `<conversation>` tags
3. Sends it all to an LLM with a summarization prompt
4. LLM processes everything in one pass

This works well for shorter conversations, but for long sessions (50k+ tokens), you pay for all those input tokens and the model may struggle with "lost in the middle" effects.

**This extension's approach**:

1. Mounts the conversation as `/conversation.json` in a virtual filesystem
2. Spawns a summarizer agent with bash/jq tools
3. The agent **explores** the conversation by querying specific parts
4. Only the queried portions enter the summarizer's context

Example queries the summarizer might run:

```bash
# How many messages?
jq 'length' /conversation.json

# What was the initial request?
jq '.[0:3]' /conversation.json

# What files were modified?
jq '[.[] | select(.role == "assistant") | .tool_calls[]? | select(.name == "write" or .name == "edit")] | .[].args.path' /conversation.json

# Any errors or bugs mentioned?
grep -i "error\|bug\|fix" /conversation.json | head -20

# What happened at the end?
jq '.[-15:]' /conversation.json
```

The summarizer's context stays small (just its system prompt + tool results), while still being able to extract key information from conversations of any length. This is similar to how a human would skim a long document—you don't read every word, you jump to relevant sections.

**Trade-offs**:
- Exploration is **cheaper** for very long conversations (only loads what's queried)
- Exploration may **miss context** that a full-pass approach would catch
- Exploration requires **multiple LLM calls** (one per tool use), but with a small, fast model this is still fast
- Built-in compaction is **simpler** and has no external dependencies

## Configuration

The extension uses `cerebras/zai-glm-4.7` by default (fast), falling back to `claude-haiku-4-5` if unavailable. To change this, edit `index.ts`.

## License

MIT
