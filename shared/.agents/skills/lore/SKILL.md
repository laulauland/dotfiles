---
name: lore
description: AST-anchored code maps. Use to persist code exploration as durable walkthroughs, or to read existing maps before re-exploring code you've already mapped.
---

# lore — when and how to use it

lore creates **maps** — step-by-step walkthroughs of how code works, anchored to AST nodes so they survive refactors. Each map answers a question ("How does billing work?"). Maps are written by agents, read by humans.

Binary: `./zig-out/bin/lore` (built from `/Users/lau/code/laulauland/lore`).
All commands accept `--format json`.

## Decision flow

### Before exploring code: check for existing maps

Before you re-explore a code flow, check if a map already exists.

```bash
lore search "billing"          # search maps and symbols by term
lore ls                        # list all maps
lore show "How does billing work?"   # render a map as a walkthrough
```

If a map exists, use it as starting context instead of reading files from scratch. `lore show --blame` adds authorship info to each step.

### After exploring code: persist what you learned

If you walked through a code flow to answer a question — during a task, a PR, or because the user asked "how does X work?" — persist it as a map. Write step facts in `.dl` format and pipe them to `lore create`.

```bash
lore create "How does webhook retry work?" << 'DL'
step("How does webhook retry work?", "src/webhooks.ts::handleRetry", 1, "Entry point, called on delivery failure.", "").
step("How does webhook retry work?", "src/webhooks.ts::scheduleBackoff", 2, "Computes exponential backoff delay.", "").
step("How does webhook retry work?", "src/queue.ts::enqueue", 3, "Pushes back onto the job queue with delay.", "").
DL
```

The map file goes into `.lore/maps/` and should be committed alongside the code change.

Use `lore at file.ts:42` to inspect the AST node at a location when you need to find the right node path for a step.

### Health checks: verify existing maps are still valid

```bash
lore stale --format json       # steps whose code changed since annotation
lore orphaned --format json    # steps whose AST nodes moved or were deleted
```

Both return JSON arrays. An empty array means healthy. Both support `--exit-code` to exit 1 when issues are found.

## .dl format reference

This is what you write when creating a map. One fact per line, terminated by `.`

```prolog
% Required: one per map
map_meta("How does auth work?", "agent", "2026-03-01").

% Steps: question, node_path, order, annotation, content_hash
step("How does auth work?", "src/auth.ts::verifyToken", 1, "Validates the JWT and extracts claims.", "").
step("How does auth work?", "src/auth.ts::refreshSession", 2, "Extends session if token is near expiry.", "").

% Optional: tree-sitter query for sub-function anchoring
step_query("src/auth.ts::verifyToken", 1, "(if_statement condition: (binary_expression) @cond) @match").
```

Node paths use `module.ext::symbol` format. Module is the file path relative to repo root, with extension.

```
src/auth.ts::verifyToken                        # function
src/billing.ts::BillingService::processCharge   # method on class
```

Leave `content_hash` as `""` when creating — lore computes it on index.

## Situational commands

```bash
lore at file.ts:42                   # inspect AST node at location
lore at file.ts:42 --callers        # who calls this symbol
lore annotate file.ts:42 "note" --map "question?"  # add step to existing map
lore trace "a.ts::foo" "b.ts::bar"  # call path between two symbols
lore export "question?" --format md  # export map as markdown (for PR comments)
```

## Rarely needed

```bash
lore index                           # build fact database (runs implicitly)
lore query "reachable(a.ts::foo, X)" # raw Datalog query
```
