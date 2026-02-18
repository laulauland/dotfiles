---
name: factory-basics
description: "Write pi-factory programs to orchestrate multi-agent workflows. Use when spawning subagents, coordinating parallel/sequential tasks, building agent-driven automation, or applying common orchestration patterns like fan-out, pipelines, and synthesis."
---

# Factory Basics

Pi-factory enables writing scripts that orchestrate multiple AI agents. Scripts use the `factory` global to spawn subagents, coordinate their work, and compose results.

## prompt vs task

These two fields have distinct roles — don't mix them:

- **prompt**: Defines WHO the agent is and HOW it should behave. Personality, methodology, principles, output format, tool usage conventions. Never contains references to specific files, specific bugs, or the immediate work.
- **task**: Defines WHAT the agent should do right now. The concrete assignment — specific files to read, bugs to fix, features to implement, commands to run.

```typescript
// BAD: task details leaked into prompt
{ prompt: "Review src/auth/ for security issues", task: "Do the review" }

// BAD: prompt is just a single-word echo of the role
{ prompt: "Lint.", task: "lint src/" }

// GOOD: clean separation
{
  prompt: "You are a security-focused code reviewer. Look for OWASP Top 10 vulnerabilities, injection flaws, and auth bypasses. Report findings with severity ratings.",
  task: "Review src/auth/ for security issues. Focus on the login flow and session management."
}
```

## Program Structure

Factory programs are top-level TypeScript scripts. The `factory` global is available — no imports or exports needed:

```typescript
const result = await factory.spawn({
  agent: "researcher",
  prompt: "You are a research assistant. You find accurate, up-to-date information and cite sources. You present findings in a structured format.",
  task: "Find information about TypeScript 5.0 — new features, breaking changes, and migration notes.",
  model: "opus",
});

console.log(result.text);
```

The script runs as a module — use `await` at the top level, `Promise.all` for parallelism, and standard imports.

## Factory API

### spawn

Create a subagent task:

```typescript
const result = await factory.spawn({
  agent: "code-reviewer",           // Role label (for logging/display)
  prompt: "You review code...",     // WHO: behavior, principles, methodology
  task: "Review main.ts for...",    // WHAT: the specific work to do now
  model: "opus",                    // Model to use
  cwd: "/path/to/project",         // Working directory (defaults to process.cwd())
  step: 1,                         // Optional step number
  signal: abortSignal,             // Optional cancellation
});
```

Returns `Promise<ExecutionResult>`. Use `await` to wait for a single agent, `Promise.all` for parallel execution.

### Parallel execution

```typescript
const [security, coverage] = await Promise.all([
  factory.spawn({
    agent: "security",
    prompt: "You are a security reviewer...",
    task: "Review src/auth/",
    model: "opus",
  }),
  factory.spawn({
    agent: "coverage",
    prompt: "You analyze test coverage...",
    task: "Check coverage for src/auth/",
    model: "sonnet",
  }),
]);
```

### Observe

Log events and write artifacts:

```typescript
// Log structured events
factory.observe.log("info", "Starting analysis", { fileCount: 42 });
factory.observe.log("warning", "Slow response", { duration: 5000 });
factory.observe.log("error", "Task failed", { taskId: "task-3" });

// Write artifacts (reports, outputs)
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
  taskId: string;              // Unique task identifier
  agent: string;               // Agent role label
  task: string;                // Original task string
  exitCode: number;            // 0 = success, non-zero = failure

  // Output
  text: string;                // Final assistant text (auto-populated)
  sessionPath?: string;        // Path to .jsonl session file

  // Conversation
  messages: unknown[];         // Full message history

  // Metadata
  usage: UsageStats;           // Token counts and costs
  model?: string;              // Model used
  stopReason?: string;         // "end_turn", "max_tokens", etc.
  errorMessage?: string;       // Error details if failed
  stderr: string;              // Process stderr output

  // Context
  step?: number;               // Step number if provided
}
```

### Quick Access: result.text

The `text` field contains the final assistant response, auto-extracted from the last assistant message:

```typescript
const result = await factory.spawn({ ... });
console.log(result.text);  // "The project is a CLI tool for..."
```

### Deep Exploration: result.sessionPath

The `sessionPath` points to a `.jsonl` file containing the full conversation. Use `search_thread` to explore it, or pass it to subsequent subagents:

```typescript
const result = await factory.spawn({ ... });

const review = await factory.spawn({
  agent: "reviewer",
  prompt: "You are an analytical reviewer. You identify key findings, gaps, and actionable next steps.",
  task: `Review the analysis session at ${result.sessionPath} and identify key findings.`,
  model: "opus",
});
```

## Context Flow

### Context DOWN (Parent to Subagent)

The parent session path is automatically appended to the subagent's system prompt. Subagents can use `search_thread` to read the parent conversation.

### Context UP (Subagent to Program)

1. **Quick access**: `result.text` contains final output
2. **Deep access**: `result.sessionPath` points to full session

```typescript
const result = await factory.spawn({ ... });

// Quick: Use text directly
console.log(`Result: ${result.text}`);

// Deep: Pass session to next agent
const next = await factory.spawn({
  agent: "reviewer",
  prompt: "You review previous work for completeness and correctness. You flag gaps and suggest improvements.",
  task: `Analyze the session at ${result.sessionPath} and identify any issues or missing coverage.`,
  model: "opus",
});
```

## Chaining Results

Pass results between subagents:

```typescript
// Step 1: Research
const research = await factory.spawn({
  agent: "researcher",
  prompt: "You are a thorough technical researcher. You find accurate information, cite sources, and distinguish between stable and experimental features.",
  task: "Find information about Rust async — current state, key patterns, and common pitfalls.",
  model: "opus",
});

// Step 2: Summarize using text
const summary = await factory.spawn({
  agent: "summarizer",
  prompt: "You write concise executive summaries. You distill key points and highlight actionable takeaways.",
  task: `Summarize this research into an executive summary:\n\n${research.text}`,
  model: "sonnet",
});

// Step 3: Deep review using session
const review = await factory.spawn({
  agent: "reviewer",
  prompt: "You are a technical reviewer. You verify claims, check for inaccuracies, and flag unsupported assertions.",
  task: `Review research session at ${research.sessionPath} for technical accuracy. Flag any incorrect or outdated claims.`,
  model: "opus",
});
```

## Error Handling

Check `exitCode`/`stopReason`/`errorMessage` and escalate:

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
    stderr: result.stderr
  });
  throw new Error(`Task ${result.taskId} failed: ${result.errorMessage || "unknown error"}`);
}
```

Use try/catch for program-level errors:

```typescript
try {
  const results = await Promise.all([
    factory.spawn({ agent: "a1", prompt: "...", task: "task 1", model: "opus" }),
    factory.spawn({ agent: "a2", prompt: "...", task: "task 2", model: "opus" }),
  ]);

  const failed = results.filter(r => r.exitCode !== 0);
  if (failed.length > 0) {
    factory.observe.log("warning", "Some tasks failed", { count: failed.length });
  }
} catch (error) {
  factory.observe.log("error", "Program failed", { error: error.message });
}
```

## Usage Stats

Track token usage and costs:

```typescript
const result = await factory.spawn({ ... });

console.log({
  turns: result.usage.turns,
  input: result.usage.input,
  output: result.usage.output,
  cacheRead: result.usage.cacheRead,
  cacheWrite: result.usage.cacheWrite,
  cost: result.usage.cost
});

// Aggregate across multiple subagents
const results = await Promise.all(tasks.map(t => factory.spawn(t)));
const totalCost = results.reduce((sum, r) => sum + r.usage.cost, 0);
```

## Async Model

Programs run asynchronously by default. When invoked via the pi CLI, they return immediately with a `runId`, and results arrive via notification when complete.

Inside your program, use `await` and `Promise.all`:

```typescript
const [r1, r2] = await Promise.all([
  factory.spawn({ agent: "a", prompt: "...", task: "...", model: "opus" }),
  factory.spawn({ agent: "b", prompt: "...", task: "...", model: "sonnet" }),
]);
console.log(r1.text, r2.text);
```

## Detached Processes

Subagent processes are **detached** — they survive parent pi exit:

- Closing pi or cancelling a turn does NOT kill running subagents
- Output is written to `.stdout.jsonl` files (file-based, not piped)
- PID files enable cancel via `/factory` monitor or `pi --factory`
- Use the "c" key in the monitor to explicitly cancel a run

This means you can fire off a long-running program and safely close pi — the work continues.

## Key Principles

1. **Programs coordinate, subagents execute** — Programs focus on workflow logic, subagents do the work
2. **Use text for quick results** — `result.text` gives you the final answer
3. **Use sessionPath for deep context** — Pass to subsequent agents for full exploration
4. **Check failure signals** — `exitCode`, `stopReason`, and `errorMessage`
5. **Log progress** — Use `factory.observe.log()` for visibility
6. **Handle errors gracefully** — Check exitCode, catch exceptions, provide fallbacks

See [patterns.md](patterns.md) in this directory for common orchestration patterns.
