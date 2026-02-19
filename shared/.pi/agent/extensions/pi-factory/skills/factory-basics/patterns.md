# Factory Patterns

Common orchestration patterns for pi-factory programs.

## Parallel Review

Fan out independent tasks, collect results:

```ts
const results = await Promise.all([
  factory.spawn({ agent: "security", prompt: "You are a security reviewer. You look for injection flaws, auth bypasses, and data exposure. Report findings with severity ratings.", task: "Review src/auth/ for security vulnerabilities.", model: "anthropic/claude-opus-4-6", step: 0 }),
  factory.spawn({ agent: "perf", prompt: "You are a performance analyst. You identify bottlenecks, unnecessary allocations, and O(n²) patterns.", task: "Profile src/api/ for performance issues.", model: "anthropic/claude-sonnet-4-6", step: 1 }),
]);
```

## Sequential Pipeline

Each step feeds into the next via `result.text`:

```ts
const analysis = await factory.spawn({
  agent: "analyzer",
  prompt: "You analyze codebases systematically. You map structure, dependencies, and public interfaces.",
  task: "Map all API endpoints in the codebase — list routes, methods, and handlers.",
  model: "anthropic/claude-opus-4-6",
  step: 0,
});

const plan = await factory.spawn({
  agent: "planner",
  prompt: "You design thorough test plans. You prioritize critical paths and edge cases.",
  task: `Design integration tests covering the API endpoints found:\n\n${analysis.text}`,
  model: "anthropic/claude-sonnet-4-6",
  step: 1,
});
```

## Fan-out then Synthesize

Parallel investigation followed by a single summarizer:

```ts
const reviews = await Promise.all([
  factory.spawn({ agent: "frontend", prompt: "You are a frontend specialist. You review UI code for accessibility, performance, and UX issues.", task: "Review the frontend code.", model: "anthropic/claude-sonnet-4-6", step: 0 }),
  factory.spawn({ agent: "backend", prompt: "You are a backend specialist. You review server code for correctness, scalability, and error handling.", task: "Review the backend code.", model: "mistral/devstral-2512", step: 1 }),
  factory.spawn({ agent: "infra", prompt: "You are an infrastructure specialist. You review configs, deployments, and operational concerns.", task: "Review the infrastructure.", model: "anthropic/claude-haiku-4-5", step: 2 }),
]);

const context = reviews.map(r => `[${r.agent}]\n${r.text}`).join("\n\n");
const summary = await factory.spawn({
  agent: "synthesizer",
  prompt: "You synthesize multiple perspectives into clear, actionable summaries. You deduplicate, prioritize, and highlight conflicts.",
  task: `Synthesize these reviews into an actionable summary:\n${context}`,
  model: "anthropic/claude-opus-4-6",
  step: 3,
});
```

## Model Selection

Models use `provider/model-id` format. Match capability to task complexity:

- **Fast/cheap** -- `cerebras/zai-glm-4.7` for file search, formatting, grep-like work
- **Fast + vision** -- `google-gemini-cli/gemini-3-flash-preview` when the agent needs to look at images or screenshots
- **Mid-tier coding** -- `mistral/devstral-2512` for code review, refactoring, focused implementation
- **Mid-tier general** -- `anthropic/claude-haiku-4-5` for analysis, summarization, planning
- **Frontier** -- `anthropic/claude-opus-4-6` for complex multi-step reasoning, large changes across many files
- **Frontier coding** -- `openai-codex/gpt-5.3-codex` for heavy implementation tasks
- **Strong all-rounder** -- `anthropic/claude-sonnet-4-6` for tasks that need solid reasoning without frontier cost

Override `model` per-agent when tasks vary in complexity. Don't default everything to one model.

## Context Chaining

Each result has:
- `result.text` — final assistant output, use directly in subsequent prompts
- `result.sessionPath` — full session file, explorable via `search_thread`

Pass context between agents by including `result.text` in the next agent's task string. For deep investigation, point agents at each other's `sessionPath`.
