# Naming and Style

Names and local structure are part of the interface. A reader should infer what a thing is, what it does, and what it costs from its name and position, before reading the implementation.

Load this file for any code work, in any language: naming, parameter and function ordering, control-flow placement, fake-data discipline, and the small style rules below. The deeper design rules live in [`DESIGNING_MODULES.md`](DESIGNING_MODULES.md) and [`TYPESCRIPT_CONTRACTS.md`](TYPESCRIPT_CONTRACTS.md); this file owns the user's naming and style taste and does not restate them.

## Non-negotiables

- A name captures the essence of what a thing is or does: nouns for data, objects, and types; verbs for functions and methods.
- No abbreviations, except primitive integer counters in sort/matrix/index math (`i`, `j`, `n`, `m`). Acronyms keep proper capitalization: `VSRState`, not `VsrState`.
- Qualifiers are suffixes ordered by descending significance, with units last: `latency_ms_max`, not `max_latency_ms`; `retry_count_max`, not `max_retries`.
- Symmetrical names for related concepts: `source`/`target`, not `src`/`dest`; related variables share length where it reads naturally; a helper is prefixed with its parent's name (`read_sector` → `read_sector_callback`).
- Fake or placeholder data never enters API, integration, or persistence code without a `FIXME:` comment marking it.
- No IIFEs unless explicitly instructed.

## Casing by language

Apply the naming rules above within each language's casing convention. Use `camelCase` in TypeScript/JavaScript (`latencyMsMax`, `retryCountMax`), `snake_case` where the language convention specifies it. Casing changes the surface; the essence, no-abbreviation, qualifier-ordering, and symmetry rules do not change.

## Function and file organization

- Callbacks come last in parameter lists.
- The main or most important function comes first in the file; important code belongs near the top.
- When no clearer ordering exists, order alphabetically.
- Module and file boundaries follow [`DESIGNING_MODULES.md`](DESIGNING_MODULES.md): split by cohesive capability and intentional seam, not by a fixed file count. There is no "keep everything in one file" rule — let module design drive structure.

## Control flow: push if up, push for down

Place each conditional and each iteration where it costs the least.

- **Push `if` up.** Lift a conditional to the caller when the caller already knows the answer, so the callee stays single-purpose.
- **Push `for` down.** Make batch operation the default. A function should take the whole set and own the loop, rather than callers looping and calling a per-item function with a per-item branch inside.

Prefer:

```ts
if (condition) {
  processBatch(items);
}
```

Avoid:

```ts
items.forEach((item) => {
  if (condition) {
    process(item);
  }
});
```

This keeps the branch evaluated once at the caller and the iteration owned by one batch-shaped interface. Guard-clause placement within a function follows [`TYPESCRIPT_CONTRACTS.md`](TYPESCRIPT_CONTRACTS.md).

## Fake data

Real-looking placeholder data is fine in direct UI code — mock view state, design fixtures, story data. It is not fine in API calls, service logic, or anything that reaches persistence or an external system. When a stub is genuinely unavoidable on those paths, mark it with a `FIXME:` comment so it is greppable and never ships silently:

```ts
// FIXME: hardcoded tier until billing endpoint lands
const tier = "pro";
```

## Owned elsewhere

These are the user's taste too, but another file is the source of truth — do not duplicate them here:

- Declarative-over-imperative, pure functions, side-effect minimization, dependency injection → functional core / imperative shell in [`DESIGNING_MODULES.md`](DESIGNING_MODULES.md).
- `const` by default, `readonly` contracts, immutable update patterns, no spread-in-accumulator, comments only for non-obvious logic → [`TYPESCRIPT_CONTRACTS.md`](TYPESCRIPT_CONTRACTS.md).
- Result/typed return over thrown expected failures → [`ERROR_HANDLING.md`](ERROR_HANDLING.md).

## Rejected framings

- **"Abbreviations are obvious in context."** `src`/`dest`/`cfg`/`req` erase the essence the name should carry. Spell it out.
- **"Units are clear from the type."** A `number` is not a unit. Suffix it.
- **"It's just placeholder data, I'll remember."** Unmarked fake data on an API path is indistinguishable from a real value at review time. Mark it `FIXME:`.
- **"One file is simpler."** File count is not the metric; cohesion and seams are. Let [`DESIGNING_MODULES.md`](DESIGNING_MODULES.md) decide.
