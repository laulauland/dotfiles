---
name: coding-standards
description: TypeScript coding standards and design taste. Use when working on TypeScript or React/frontend code; when adding or changing domain models, modules, adapters, parsers, typed errors, async workflows, tests, TypeScript contracts, Cloudflare Workers/Durable Objects/Agents, or Effect code; for the user's naming, control-flow, and code-style conventions on any code in any language; or when another engineering skill needs the user's coding standards.
---

# Coding Standards

Use these standards while designing and editing TypeScript. They encode the user's taste: correctness first, precise domain modeling, typed failures, deep modules, explicit boundaries, real-seam tests, strict TypeScript, and boring operational safety.

This root file is a router and a universal floor. Load the topic files that match the code you are touching; the routing pass is complete only when every touched concern has either a loaded topic file or a named reason no topic applies.

This skill owns code-design taste. The process and execution layer, covering how to scope, sequence, delegate, and verify the work, lives in the `engineering-principles` skill. When a decision is about how you are working rather than how the code is shaped, load that skill instead.

## Universal floor

These rules apply before any topic-specific detail:

- Local conventions matter when they are compatible with these standards.
- Boundary input is parsed before core/service logic sees it.
- Expected failures are visible in typed return channels; throws are for defects and boundary translation.
- Secrets do not enter errors, logs, traces, metrics, snapshots, or panic summaries.
- Raw platform bindings and framework types stay at composition seams or tightly local External Adapter Modules.
- Dependencies are explicit; hidden globals and ambient time/randomness/IDs do not drive service behavior.
- Tests prove observable behavior through module interfaces or real seams; module mocks and method spies are out.
- Type escape hatches are local, justified with `SAFETY:`, and hidden behind precise interfaces.
- Promises are owned: awaited, returned, collected, or handed to explicit detached-work machinery.
- **Target-state design:** do not add backwards-compatibility, migration, rollout, deployment sequencing, backfill, or dual-write/read machinery unless the user explicitly asks for it. Improve changed paths without forcing broad migrations.

## How to apply the standards

1. **Audit the local codebase.** Before choosing a library, pattern, External Adapter Module shape, schema style, error representation, test strategy, observability mechanism, or module layout, inspect until the existing choice for each touched concern is identified or confirmed absent.
2. **Classify the change.** Identify the concerns touched: naming and style, domain state, parsing, errors, observability, modules, async, tests, TypeScript contracts, frontend, Cloudflare, or Effect.
3. **Load every relevant topic file.** The root file is not enough context for library, runtime, schema, error, testing, Cloudflare, Effect, or toolchain choices.
4. **Apply safety standards before local convention.** Follow established architecture where compatible. When local convention violates a non-negotiable, isolate compatibility at the boundary and improve the changed path.
5. **Prefer the smallest coherent improvement.** Do not add abstractions, External Adapter Modules, Service Modules, libraries, workflows, or config layers without a concrete reason.
6. **Verify through the right seam.** Tests should observe outcomes at the module or system interface that callers use.
7. **Name trade-offs.** If a standard cannot be fully applied without broad migration, state the compatibility constraint and the local improvement made.

## Topic routing

Load the files whose triggers match the task.

| If the change touches... | Load... |
|---|---|
| Naming, abbreviations, acronym casing, unit/qualifier suffixes, symmetrical names, parameter/function/file ordering, push-if-up/push-for-down control flow, fake-data/`FIXME`, IIFEs | [`NAMING_AND_STYLE.md`](NAMING_AND_STYLE.md) |
| Shared coding-standard terms, adoption language, failure/boundary/domain/module/runtime vocabulary | [`VOCABULARY.md`](VOCABULARY.md) |
| Domain values, invariants, branded types, value classes, state machines, lifecycle transitions, optionality, `Partial<T>`, boolean flags, operation inputs, exhaustive variants, persisted lifecycle constraints | [`DOMAIN_MODELING.md`](DOMAIN_MODELING.md) |
| Expected failures, custom errors, not-found semantics, cancellation classification, startup config diagnostics, catch/classification | [`ERROR_HANDLING.md`](ERROR_HANDLING.md) |
| Tracing, logging, telemetry, safe summaries, secrets, redaction, preserving reporting/correlation hooks | [`OBSERVABILITY.md`](OBSERVABILITY.md) |
| Domain Modules, Service Modules, External Adapter Modules, interfaces, seams, dependency injection, functional core/shell, resource ownership | [`DESIGNING_MODULES.md`](DESIGNING_MODULES.md) |
| HTTP/RPC/queue/storage/env parsing, DTOs, codecs, projections, config, runtime-hop payloads | [`BOUNDARIES_AND_PARSING.md`](BOUNDARIES_AND_PARSING.md) |
| Cancellation, promise ownership, concurrency, idempotency, transactions, retries, workflows, detached work | [`ASYNC_AND_WORKFLOWS.md`](ASYNC_AND_WORKFLOWS.md) |
| Tests, property tests, real seams, persistence/runtime verification, risk-matched evidence | [`TESTING_AND_VERIFICATION.md`](TESTING_AND_VERIFICATION.md) |
| Casts, `any`, catch values, thenables, readonly contracts, collections, optionality, object spread/projection/delete, guard clauses, exports, imports, barrels, JSDoc, toolchain | [`TYPESCRIPT_CONTRACTS.md`](TYPESCRIPT_CONTRACTS.md) |
| React/frontend components, hooks, client/server data flow, loaders/actions, forms, client state, rendering, UI state modeling, server/client serialization | [`FRONTEND.md`](FRONTEND.md) |
| Workers, bindings, Durable Objects, Agents, D1, KV/R2, Queues, Workflows, workerd, service bindings, runtime hops | [`CLOUDFLARE_ARCHITECTURE.md`](CLOUDFLARE_ARCHITECTURE.md) |
| Established Effect responsibilities, Effect services/layers, typed errors, Schema, Redacted, Effect testing/RPC | [`EFFECT.md`](EFFECT.md) |

## Standing defaults

Use the repository's established choice when it exists and satisfies these standards. When no established choice exists, load the topic file that owns the concern and follow its strong defaults.

The user's standing defaults, applied only when a repository has not established otherwise:

- **Effect is the default application ecosystem.** Typed errors, services/layers, schema, and testing lead with the Effect path; the non-Effect guidance in each topic file is a fallback for repositories not built on Effect.
- **Toolchain fallback is Vite+ with Bun, Oxlint, and Oxfmt** — but the toolchain is usually repo-specific; detect and follow the repo's tooling first.
- **Effect Schema** is the schema default everywhere Effect is present; **Zod 4** is the fallback only for projects using no Effect. **Alchemy V2** is the Cloudflare IaC default; **Drizzle** owns Cloudflare SQL.
- **Async is Effect's model**: fiber interruption for cancellation, structured concurrency (`Effect.forEach`/`fork`/`Scope`) for parallelism; `AbortSignal`/`Promise` is the non-Effect fallback and boundary form.
- **Effect DateTime + Clock** for time values and injected time. **Effect Logger + tracing** for observability. Durable orchestration engine is chosen per project, not fixed.
