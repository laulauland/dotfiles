# pi-factory

A pi extension that registers a `subagent` tool for spawning child agents. Async by default — fire, forget, get notified.

## Example

User prompt:
> Review the auth module for security issues and check test coverage in parallel.

The orchestrator writes a script:

```ts
const [security, coverage] = await Promise.all([
  factory.spawn({ agent: "security", prompt: "You are a security reviewer. You look for OWASP Top 10 vulnerabilities, injection flaws, and auth bypasses. Report findings with severity ratings.", task: "Review src/auth/ for security issues, focusing on the login flow and session management.", model: "anthropic/claude-opus-4-6" }),
  factory.spawn({ agent: "coverage", prompt: "You analyze test coverage. You identify untested code paths and suggest what tests to add.", task: "Check test coverage for src/auth/ and list any untested functions.", model: "anthropic/claude-sonnet-4-6" }),
]);
```

The tool returns immediately:
> Spawned 'security-audit' -> factory-abc123. Running async — results will be delivered when complete.

The orchestrator continues working. When subagents finish, a notification wakes the LLM:
> Subagent 'security-audit' done (18s). Use /factory to inspect.

Because completion notifications use `triggerTurn`, each completion can trigger another assistant turn. If the parent task is open-ended (for example "continue slice-by-slice"), the orchestrator may choose to spawn additional subagent programs automatically.

## Schema

Two fields — `task` and `code` are required:

```json
{
  "task": "Review the auth module in parallel",
  "code": "const results = await Promise.all([factory.spawn({...}), factory.spawn({...})]);"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `task` | yes | Label/description for this program run. |
| `code` | yes | TypeScript script using the `factory` global. Runs as a top-level module. |

## Async by default

All subagent calls return immediately. Results arrive via notification (`pi.sendMessage` with `triggerTurn`).

### Detached processes

Subagent processes are **detached** — they survive if the parent pi session is interrupted or closed:

- Child `pi` processes run independently (`detached: true`, `proc.unref()`)
- Stdout is written to file (`.stdout.jsonl`), not piped — no SIGPIPE on parent exit
- PID files (`.pid`) enable external cancel support
- Session shutdown does **not** cancel running subagents
- Turn cancellation (escape/ctrl+c) does **not** propagate to subagents
- Explicit cancel via `/factory` or `pi --factory` monitor ("c" key) sends SIGTERM

### TUI integration

- **Widget** — persistent status bar shows active runs with live elapsed time
- **Notifications** — completions delivered as expandable custom messages (batched within 500ms)
- **`/factory` command** — bordered overlay with run list, detail pane, scroll, cancel
- **`pi --factory`** — standalone full-screen monitor for any project directory, reads from filesystem

## Program mode

Scripts use the `factory` global for orchestration. No exports needed — the script runs as a top-level module:

```ts
// Parallel fan-out
const results = await Promise.all([
  factory.spawn({ agent: "linter", prompt: "You run linters and report issues with file paths and rule IDs.", task: "Lint src/ and report all warnings and errors.", model: "anthropic/claude-sonnet-4-6" }),
  factory.spawn({ agent: "tester", prompt: "You run tests and report failures with clear reproduction steps.", task: "Run the test suite and report any failures.", model: "mistral/devstral-2512" }),
]);

// Sequential pipeline
const analysis = await factory.spawn({
  agent: "analyzer", prompt: "You analyze codebases.", task: "Map all API endpoints.", model: "anthropic/claude-opus-4-6",
});
const plan = await factory.spawn({
  agent: "planner", prompt: "You design test plans.", task: `Design tests for:\n${analysis.text}`, model: "anthropic/claude-sonnet-4-6",
});

// Simple single spawn
const result = await factory.spawn({
  agent: "scout", prompt: "You scan codebases for issues.", task: "Find TODO/FIXME comments in src/.", model: "cerebras/zai-glm-4.7",
});
```

Program mode requires user confirmation before execution.

## Context flow

Each subagent receives the parent session path and can use `search_thread` to explore it. After completion:
- `result.text` — auto-populated with the final assistant output
- `result.sessionPath` — persistent session file, explorable via `search_thread`

## Configuration

Edit the `config` object at the top of `index.ts`:

```ts
export const config = {
  maxDepth: 1,
  prompt: "Prefer cerebras/zai-glm-4.7 for simple tasks. Use anthropic/claude-sonnet-4-6 for code review.",
};
```

| Key | Default | Description |
|-----|---------|-------------|
| `maxDepth` | `1` | Maximum nesting depth for subagent spawning. `1` means the orchestrator can spawn subagents, but those subagents cannot spawn their own (preventing recursive factory runs). Set to `0` to disable subagent spawning entirely, or `2+` to allow deeper nesting. Controlled via the `PI_FACTORY_DEPTH` environment variable passed to child processes. |
| `prompt` | *(see source)* | Extra text appended to the tool description. The LLM sees it when deciding how to use the tool. |

## Bundled skills

The `skills/` directory contains pi skills that are automatically registered via `resources_discover`. They're loaded on-demand when the LLM's task matches the skill description.

| Skill | Trigger |
|-------|---------|
| `factory-basics` | Spawning subagents, writing program code, multi-agent architectures |
| `factory-ralph-loop` | Iterative loops until condition met (lint, tests, PRD) |
| `factory-worktree` | Parallel development with jj/git worktrees |

Add new skills by creating a `skills/<name>/SKILL.md` with YAML frontmatter (`name`, `description`) and markdown content.

## Failure contract

For robust orchestration and recovery:

- A run should be treated as failed if `run.json.error` is present.
- For child-level checks, treat a child result as failed when any of these are true:
  - `exitCode !== 0`
  - `stopReason === "error"`
  - `errorMessage` is non-empty
- If your program observes failed children, explicitly escalate (usually `throw new Error(...)`) so the parent run status becomes `failed`.

## Error codes

| Code | Meaning |
|------|---------|
| `INVALID_INPUT` | Bad or missing parameters |
| `MODEL_NOT_FOUND` | Requested model not in registry |
| `CANCELLED` | Aborted by signal or user |
| `RUNTIME` | Execution failure |
| `CONFIRMATION_REJECTED` | User rejected program execution |

## Standalone monitor

Run `pi --factory` to open a full-screen monitor for any project directory. It reads `run.json` files from the filesystem and supports:

- Live refresh (1s polling)
- 3-level drill-down: runs -> agents -> agent detail
- Cancel running agents via PID files ("c" key)
- Works independently of any active pi session

## Files

| File | Purpose |
|------|---------|
| `index.ts` | Tool registration, async dispatch, TUI rendering, lifecycle hooks |
| `contract.ts` | TypeBox schema + validation |
| `runtime.ts` | Factory (spawn + branded promises), detached process spawning, Promise.all patching, preflight typecheck |
| `executors/program-executor.ts` | Confirmation UI + program execution via globalThis.factory injection |
| `registry.ts` | RunRegistry — tracks active/completed runs with acknowledge lifecycle |
| `scanner.ts` | Filesystem scanner — reads run.json files, PID-based cancel utilities |
| `monitor.ts` | 3-level TUI monitor component (runs -> agents -> detail) |
| `widget.ts` | Persistent status bar via `setWidget` |
| `notify.ts` | Batched completion notifications + message renderer |
| `observability.ts` | Event timeline + artifact tracking |
| `errors.ts` | 5-code error model |
| `types.ts` | ExecutionResult, RunSummary, UsageStats |
