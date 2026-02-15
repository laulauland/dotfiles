# Factory Patterns

Common orchestration patterns for pi-factory programs.

## Parallel Review

Fan out independent tasks, collect results:

```ts
export async function run(input, rt) {
  const results = await rt.parallel("review", [
    { agent: "security", systemPrompt: "You are a security reviewer. You look for injection flaws, auth bypasses, and data exposure. Report findings with severity ratings.", task: "Review src/auth/ for security vulnerabilities.", cwd: process.cwd(), step: 0 },
    { agent: "perf", systemPrompt: "You are a performance analyst. You identify bottlenecks, unnecessary allocations, and O(n²) patterns.", task: "Profile src/api/ for performance issues.", cwd: process.cwd(), step: 1 },
  ]);
  return { results };
}
```

## Sequential Pipeline

Each step feeds into the next via `result.text`:

```ts
export async function run(input, rt) {
  const analysis = await rt.sequence("pipeline", [
    { agent: "analyzer", systemPrompt: "You analyze codebases systematically. You map structure, dependencies, and public interfaces.", task: "Map all API endpoints in the codebase — list routes, methods, and handlers.", cwd: process.cwd(), step: 0 },
    { agent: "planner", systemPrompt: "You design thorough test plans. You prioritize critical paths and edge cases.", task: "Design integration tests covering the API endpoints found in the previous step.", cwd: process.cwd(), step: 1 },
  ]);
  return { results: analysis };
}
```

## Fan-out then Synthesize

Parallel investigation followed by a single summarizer:

```ts
export async function run(input, rt) {
  const reviews = await rt.parallel("investigate", [
    { agent: "frontend", systemPrompt: "You are a frontend specialist. You review UI code for accessibility, performance, and UX issues.", task: input.task, cwd: process.cwd(), step: 0 },
    { agent: "backend", systemPrompt: "You are a backend specialist. You review server code for correctness, scalability, and error handling.", task: input.task, cwd: process.cwd(), step: 1 },
    { agent: "infra", systemPrompt: "You are an infrastructure specialist. You review configs, deployments, and operational concerns.", task: input.task, cwd: process.cwd(), step: 2 },
  ]);

  const context = reviews.map(r => `[${r.agent}]\n${r.text}`).join("\n\n");
  const summary = await rt.join(rt.spawn({
    agent: "synthesizer",
    systemPrompt: "You synthesize multiple perspectives into clear, actionable summaries. You deduplicate, prioritize, and highlight conflicts.",
    task: `Synthesize these reviews into an actionable summary:\n${context}`,
    cwd: process.cwd(),
    step: 3,
  }));

  return { results: [...reviews, summary] };
}
```

## Model Selection

- Use fast/cheap models for simple tasks (file reading, formatting, grep-like work)
- Use mid-tier models for code review, analysis, planning
- Reserve frontier models for complex multi-step reasoning
- Override `model` per-agent when tasks vary in complexity

## Context Chaining

Each result has:
- `result.text` — final assistant output, use directly in subsequent prompts
- `result.sessionPath` — full session file, explorable via `search_thread`

Pass context between agents by including `result.text` in the next agent's task string. For deep investigation, point agents at each other's `sessionPath`.
