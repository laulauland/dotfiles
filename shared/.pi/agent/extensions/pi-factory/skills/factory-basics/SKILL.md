---
name: factory-basics
description: "Write pi-factory programs to orchestrate multi-agent workflows. Use when spawning subagents, coordinating parallel/sequential tasks, building agent-driven automation, or applying common orchestration patterns like fan-out, pipelines, and synthesis."
---

# Factory Basics

Pi-factory enables writing programs that orchestrate multiple AI agents. Programs spawn subagents, coordinate their work, and compose results.

## systemPrompt vs task

These two fields have distinct roles — don't mix them:

- **systemPrompt**: Defines WHO the agent is and HOW it should behave. Personality, methodology, principles, output format, tool usage conventions. Never contains references to specific files, specific bugs, or the immediate work.
- **task**: Defines WHAT the agent should do right now. The concrete assignment — specific files to read, bugs to fix, features to implement, commands to run.

```typescript
// ❌ BAD: task details leaked into systemPrompt
{ systemPrompt: "Review src/auth/ for security issues", task: "Do the review" }

// ❌ BAD: systemPrompt is just a single-word echo of the role
{ systemPrompt: "Lint.", task: "lint src/" }

// ✅ GOOD: clean separation
{
  systemPrompt: "You are a security-focused code reviewer. Look for OWASP Top 10 vulnerabilities, injection flaws, and auth bypasses. Report findings with severity ratings.",
  task: "Review src/auth/ for security issues. Focus on the login flow and session management."
}
```

## Program Structure

Every factory program exports `async function run(input, rt)`:

```typescript
export async function run(input, rt) {
  // Spawn subagents, coordinate work, return results
  const handle = rt.spawn({
    agent: "researcher",
    systemPrompt: "You are a research assistant. You find accurate, up-to-date information and cite sources. You present findings in a structured format.",
    task: "Find information about TypeScript 5.0 — new features, breaking changes, and migration notes.",
    cwd: process.cwd()
  });
  
  const result = await rt.join(handle);
  return { summary: result.text, tokens: result.usage.input + result.usage.output };
}
```

**Parameters:**
- `input`: JSON data passed from the caller
- `rt`: ProgramRuntime — the orchestration API

**Return value:** Any JSON-serializable data

## Runtime API

### Spawn

Create a subagent task:

```typescript
const handle = rt.spawn({
  agent: "code-reviewer",           // Role label (for logging/display)
  systemPrompt: "You review code...",// WHO: behavior, principles, methodology
  task: "Review main.ts for...",    // WHAT: the specific work to do now
  cwd: "/path/to/project",          // Working directory
  step?: 1,                         // Optional step number
  signal?: abortSignal              // Optional cancellation
});
```

Returns `SpawnHandle` with:
- `taskId`: Unique identifier
- `join()`: Promise that resolves to `ExecutionResult`

### Join

Wait for one or multiple subagents to complete:

```typescript
// Single subagent
const result = await rt.join(handle);

// Multiple subagents (waits for all)
const results = await rt.join([handle1, handle2, handle3]);
```

### Parallel

Spawn multiple subagents and wait for all to complete:

```typescript
const results = await rt.parallel("analyze-modules", [
  { agent: "analyzer", systemPrompt: "...", task: "Analyze auth.ts", cwd: "." },
  { agent: "analyzer", systemPrompt: "...", task: "Analyze db.ts", cwd: "." },
  { agent: "analyzer", systemPrompt: "...", task: "Analyze api.ts", cwd: "." }
]);
```

All tasks run concurrently. Returns array of results in input order.

### Sequence

Spawn subagents one at a time, waiting for each before starting the next:

```typescript
const results = await rt.sequence("deployment-pipeline", [
  { agent: "tester", systemPrompt: "You run tests and report failures with file paths and line numbers.", task: "Run `npm test` and report any failures", cwd: "." },
  { agent: "builder", systemPrompt: "You build projects and diagnose build errors clearly.", task: "Run `npm run build` and fix any compilation errors", cwd: "." },
  { agent: "deployer", systemPrompt: "You handle deployments carefully, verifying each step before proceeding.", task: "Deploy to production using the standard deploy script", cwd: "." }
]);
```

Tasks run sequentially. Useful for workflows where each step depends on the previous.

### Workspace

Create temporary directories for subagents:

```typescript
const workDir = rt.workspace.create("analysis");
// workDir = "/tmp/pi-factory-analysis-abc123"

const handle = rt.spawn({
  agent: "worker",
  systemPrompt: "You process and analyze data files. You produce structured summaries.",
  task: "Analyze the data files in this directory and produce a summary report.",
  cwd: workDir
});

rt.workspace.cleanup(workDir);
```

### Observe

Log events and write artifacts:

```typescript
// Log structured events
rt.observe.log("info", "Starting analysis", { fileCount: 42 });
rt.observe.log("warning", "Slow response", { duration: 5000 });
rt.observe.log("error", "Task failed", { taskId: "task-3" });

// Write artifacts (reports, outputs)
const artifactPath = rt.observe.artifact("summary.md", reportContent);
```

### Shutdown

```typescript
await rt.shutdown(true);   // Cancel all running tasks
await rt.shutdown(false);  // Wait for running tasks to complete naturally
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
  messages: Message[];         // Full message history
  
  // Metadata
  usage: UsageStats;           // Token counts and costs
  model?: string;              // Model used
  tools?: string[];            // Tools available
  stopReason?: string;         // "end_turn", "max_tokens", etc.
  errorMessage?: string;       // Error details if failed
  stderr: string;              // Process stderr output
  
  // Context
  step?: number;               // Step number if provided
  threadRef: {                 // For traceability
    runId: string;
    taskId: string;
    step?: number;
  };
}
```

### Quick Access: result.text

The `text` field contains the final assistant response, auto-extracted from the last assistant message:

```typescript
const result = await rt.join(handle);
console.log(result.text);  // "The project is a CLI tool for..."
```

### Deep Exploration: result.sessionPath

The `sessionPath` points to a `.jsonl` file containing the full conversation. Use `search_thread` to explore it, or pass it to subsequent subagents:

```typescript
const result = await rt.join(handle);

const reviewer = rt.spawn({
  agent: "reviewer",
  systemPrompt: "You are an analytical reviewer. You identify key findings, gaps, and actionable next steps.",
  task: `Review the analysis session at ${result.sessionPath} and identify key findings.`,
  cwd: "."
});
```

## Context Flow

### Context DOWN (Parent to Subagent)

The parent session path is automatically appended to the subagent's system prompt. Subagents can use `search_thread` to read the parent conversation.

### Context UP (Subagent to Program)

1. **Quick access**: `result.text` contains final output
2. **Deep access**: `result.sessionPath` points to full session

```typescript
const result = await rt.join(handle);

// Quick: Use text directly
console.log(`Result: ${result.text}`);

// Deep: Pass session to next agent
const nextHandle = rt.spawn({
  agent: "reviewer",
  systemPrompt: "You review previous work for completeness and correctness. You flag gaps and suggest improvements.",
  task: `Analyze the session at ${result.sessionPath} and identify any issues or missing coverage.`,
  cwd: "."
});
```

## Chaining Results

Pass results between subagents:

```typescript
// Step 1: Research
const research = await rt.join(rt.spawn({
  agent: "researcher",
  systemPrompt: "You are a thorough technical researcher. You find accurate information, cite sources, and distinguish between stable and experimental features.",
  task: "Find information about Rust async — current state, key patterns, and common pitfalls.",
  cwd: "."
}));

// Step 2: Summarize using text
const summary = await rt.join(rt.spawn({
  agent: "summarizer",
  systemPrompt: "You write concise executive summaries. You distill key points and highlight actionable takeaways.",
  task: `Summarize this research into an executive summary:\n\n${research.text}`,
  cwd: "."
}));

// Step 3: Deep review using session
const review = await rt.join(rt.spawn({
  agent: "reviewer",
  systemPrompt: "You are a technical reviewer. You verify claims, check for inaccuracies, and flag unsupported assertions.",
  task: `Review research session at ${research.sessionPath} for technical accuracy. Flag any incorrect or outdated claims.`,
  cwd: "."
}));
```

## Error Handling

Check `exitCode`/`stopReason`/`errorMessage` and escalate:

```typescript
const result = await rt.join(handle);

const failed =
  result.exitCode !== 0 ||
  result.stopReason === "error" ||
  Boolean(result.errorMessage);

if (failed) {
  rt.observe.log("error", "Task failed", {
    taskId: result.taskId,
    exitCode: result.exitCode,
    stopReason: result.stopReason,
    error: result.errorMessage,
    stderr: result.stderr
  });
  throw new Error(`Task ${result.taskId} failed: ${result.errorMessage || "unknown error"}`);
}
```

Spawn/join usage:

```typescript
// ✅ preferred
const h = rt.spawn({...});
const r = await rt.join(h);

// ✅ also valid
const r2 = await rt.spawn({...});

// ❌ invalid (ExecutionResult passed to join)
const wrong = await rt.spawn({...});
await rt.join(wrong);
```

Use try/catch for program-level errors:

```typescript
export async function run(input, rt) {
  try {
    const results = await rt.parallel("risky-tasks", [
      { agent: "a1", systemPrompt: "...", task: "task 1", cwd: "." },
      { agent: "a2", systemPrompt: "...", task: "task 2", cwd: "." }
    ]);
    
    const failed = results.filter(r => r.exitCode !== 0);
    if (failed.length > 0) {
      return { status: "partial", failed: failed.length };
    }
    
    return { status: "success", results };
  } catch (error) {
    rt.observe.log("error", "Program failed", { error: error.message });
    return { status: "error", message: error.message };
  }
}
```

## Usage Stats

Track token usage and costs:

```typescript
const result = await rt.join(handle);

console.log({
  turns: result.usage.turns,
  input: result.usage.input,
  output: result.usage.output,
  cacheRead: result.usage.cacheRead,
  cacheWrite: result.usage.cacheWrite,
  cost: result.usage.cost
});

// Aggregate across multiple subagents
const results = await rt.parallel("batch", tasks);
const totalCost = results.reduce((sum, r) => sum + r.usage.cost, 0);
```

## Async Model

Programs run asynchronously by default. When invoked via the pi CLI, they return immediately with a `runId`, and results arrive via notification when complete.

Inside your program, use `await` to wait for subagents:

```typescript
export async function run(input, rt) {
  const h1 = rt.spawn({...});
  const h2 = rt.spawn({...});
  const [r1, r2] = await rt.join([h1, h2]);
  return { combined: r1.text + r2.text };
}
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
5. **Log progress** — Use `rt.observe.log()` for visibility
6. **Handle errors gracefully** — Check exitCode, catch exceptions, provide fallbacks

See [patterns.md](patterns.md) in this directory for common orchestration patterns.
