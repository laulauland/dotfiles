---
name: factory-basics
description: "Write pi-factory programs to orchestrate multi-agent workflows. Use when spawning subagents, coordinating parallel/sequential tasks, building agent-driven automation, or applying common orchestration patterns like fan-out, pipelines, and synthesis."
---

# Factory Basics

Pi-factory enables writing scripts that orchestrate multiple AI agents. Scripts use the `factory` global to spawn subagents, coordinate work, and compose results.

## systemPrompt vs prompt

These two fields have distinct roles — don't mix them:

- **systemPrompt**: Defines WHO the agent is and HOW it should behave. Personality, methodology, principles, output format, tool usage conventions.
- **prompt**: Defines WHAT the agent should do right now. The concrete assignment — specific files to read, bugs to fix, features to implement, commands to run.

```typescript
// BAD: work leaked into systemPrompt
{ systemPrompt: "Review src/auth/ for security issues", prompt: "Do the review" }

// BAD: systemPrompt is too weak
{ systemPrompt: "Lint.", prompt: "Run lint on src/ and fix errors" }

// GOOD: clean separation
{
  systemPrompt: "You are a security-focused code reviewer. Look for OWASP Top 10 vulnerabilities, injection flaws, and auth bypasses. Report findings with severity ratings.",
  prompt: "Review src/auth/ for security issues. Focus on the login flow and session management."
}
```

## Program Structure

Factory programs are top-level TypeScript scripts. The `factory` global is available — no imports or exports needed:

```typescript
const result = await factory.spawn({
  agent: "researcher",
  systemPrompt: "You are a research assistant. You find accurate, up-to-date information and cite sources. You present findings in a structured format.",
  prompt: "Find information about TypeScript 5.0 — new features, breaking changes, and migration notes.",
  model: "anthropic/claude-opus-4-6",
});

console.log(result.text);
```

The script runs as a module — use `await` at top level, `Promise.all` for parallelism, and standard imports.

## Factory API

### spawn

Create a subagent task:

```typescript
const result = await factory.spawn({
  agent: "code-reviewer",              // Role label (for logging/display)
  systemPrompt: "You review code...",  // WHO: behavior, principles, methodology
  prompt: "Review main.ts for...",     // WHAT: the specific work to do now
  model: "anthropic/claude-opus-4-6",  // Model in provider/model-id format
  cwd: "/path/to/project",             // Working directory (defaults to process.cwd())
  step: 1,                               // Optional step number
  signal: abortSignal,                   // Optional cancellation
});
```

Returns `Promise<ExecutionResult>`. Use `await` for one agent, `Promise.all` for parallel execution.

### Parallel execution

```typescript
const [security, coverage] = await Promise.all([
  factory.spawn({
    agent: "security",
    systemPrompt: "You are a security reviewer...",
    prompt: "Review src/auth/",
    model: "anthropic/claude-opus-4-6",
  }),
  factory.spawn({
    agent: "coverage",
    systemPrompt: "You analyze test coverage...",
    prompt: "Check coverage for src/auth/",
    model: "anthropic/claude-sonnet-4-6",
  }),
]);
```

### Observe

```typescript
factory.observe.log("info", "Starting analysis", { fileCount: 42 });
factory.observe.log("warning", "Slow response", { duration: 5000 });
factory.observe.log("error", "Task failed", { taskId: "task-3" });

const artifactPath = factory.observe.artifact("summary.md", reportContent);
```

### Shutdown

```typescript
await factory.shutdown(true);   // Cancel all running tasks
await factory.shutdown(false);  // Wait for running tasks to complete naturally
```

## Execution Results

Each subagent returns an `ExecutionResult`:

```typescript
interface ExecutionResult {
  taskId: string;
  agent: string;
  task: string;                // Original execution prompt string
  exitCode: number;

  text: string;
  sessionPath?: string;

  messages: unknown[];

  usage: UsageStats;
  model?: string;
  stopReason?: string;
  errorMessage?: string;
  stderr: string;

  step?: number;
}
```

## Context flow

### Context DOWN (Parent -> Subagent)

The parent session path is appended to the subagent system prompt automatically. Subagents can use `search_thread` to read parent context.

### Context UP (Subagent -> Program)

1. `result.text` for quick chaining
2. `result.sessionPath` for deep review

```typescript
const research = await factory.spawn({
  agent: "researcher",
  systemPrompt: "You are a thorough technical researcher.",
  prompt: "Research Rust async patterns and common pitfalls.",
  model: "anthropic/claude-opus-4-6",
});

const summary = await factory.spawn({
  agent: "summarizer",
  systemPrompt: "You write concise executive summaries.",
  prompt: `Summarize this research:\n\n${research.text}`,
  model: "anthropic/claude-haiku-4-5",
});

const review = await factory.spawn({
  agent: "reviewer",
  systemPrompt: "You are a technical reviewer. Verify claims and flag unsupported assertions.",
  prompt: `Review research session at ${research.sessionPath} for technical accuracy.`,
  model: "anthropic/claude-opus-4-6",
});
```

## Error handling

Check `exitCode` / `stopReason` / `errorMessage` and escalate:

```typescript
const result = await factory.spawn({ ... });

const failed =
  result.exitCode !== 0 ||
  result.stopReason === "error" ||
  Boolean(result.errorMessage);

if (failed) {
  factory.observe.log("error", "Task failed", {
    taskId: result.taskId,
    exitCode: result.exitCode,
    stopReason: result.stopReason,
    error: result.errorMessage,
    stderr: result.stderr,
  });
  throw new Error(`Task ${result.taskId} failed: ${result.errorMessage || "unknown error"}`);
}
```

## Async model

Programs run asynchronously by default when invoked via tool call: immediate `runId`, completion via notification.

Inside your program, use `await` and `Promise.all` normally:

```typescript
const [r1, r2] = await Promise.all([
  factory.spawn({ agent: "a", systemPrompt: "...", prompt: "...", model: "anthropic/claude-opus-4-6" }),
  factory.spawn({ agent: "b", systemPrompt: "...", prompt: "...", model: "cerebras/zai-glm-4.7" }),
]);
console.log(r1.text, r2.text);
```

## Detached processes

Subagent processes are detached:

- Closing pi or cancelling a turn does **not** kill running subagents
- Output is written to `.stdout.jsonl` files
- PID files enable cancel via `/factory` or `pi --factory`

## Key principles

1. Programs coordinate, subagents execute
2. Use `result.text` for fast chaining
3. Use `result.sessionPath` for deep context
4. Check failure signals (`exitCode`, `stopReason`, `errorMessage`)
5. Log progress with `factory.observe.log()`

See [patterns.md](patterns.md) for common orchestration patterns.
