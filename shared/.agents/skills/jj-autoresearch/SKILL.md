---
name: jj-autoresearch
description: Run a fork-fanned tree search over jj revisions against a frozen judge — fan each frontier revision into divergent child attempts, score every child, keep the best as the new frontier, and harvest the winning path into a linear stack. Use when the winning approach is unknown and must be discovered by measured search (optimize a metric, explore many approaches in parallel, autoresearch-style overnight runs), as opposed to jj-plan's known, ordered stages.
allowed-tools: Bash(jj:*), Bash(pando:*), Bash(pd:*), Bash(fd:*), Bash(rg:*)
---

# jj-autoresearch

Search for the best implementation by running an overnight tree search whose nodes
are jj revisions. From each **frontier** revision, **fork-fan-out** into J divergent
child attempts; a **frozen judge** scores each; the best advance as the next frontier
and the rest are **pruned** but kept as durable revisions. The `jj log` becomes the
search tree; a **journal** file on disk is the running record every attempt reads.
At the end, **harvest** the winning path into a clean linear stack — the deliverable.

Use jj-plan when the steps are known. Use this when the *winning approach* is unknown
and must be discovered by measured search.

There are three phases: **Frame** (pin the base, freeze the judge, open the journal,
then stop for confirmation), **Search** (the wave loop), and **Harvest**. Never start
Search until the user has confirmed the frame.

## Phase 1 — Frame

1. **Pin the base.** One jj revision the whole search descends from — a jj-plan stage,
   a spec revision, or `@`. Everything forks from it; it never changes.

2. **Freeze the judge.** Define the single command that scores one attempt and emits
   `{ score, gate: pass|fail }`. It must be cheap, deterministic, and uneditable by the
   search. If you cannot write one, stop and say so — there is no autoresearch without a
   frozen judge.
   - For optimization work the score is the metric (lower or higher is better) and the
     gate is "it still runs".
   - For implementation work the gate is the stage's acceptance gate (typecheck +
     targeted test + lint) and the score is a cost scalar (diff size, review rounds).
   - Completion criterion: the judge runs on the base and emits a baseline.

3. **Open the journal.** Create an append-only file (e.g. `.jjar/journal.tsv`) with one
   header row: `change_id  parent  score  gate  move  kept`. Seed it with the base's
   baseline. The journal is the shared prefix every forked agent reads first — the real
   running record, not a summary.

4. **Seed the idea pool.** List wave 1's candidate moves — J *divergent* approaches, not
   variations on one.

5. **Show the frame and stop.** Print the base, the judge command + baseline, the journal
   path, and the seed ideas. Confirm before searching.

## Phase 2 — Search

Run only after the frame is confirmed. Drive the wave loop with the companion workflow
`scripts/jjar.workflow.js` — a budget-bounded executor that fans out, judges, and prunes.
The steps below are what each **wave** does and what you confirm:

1. **Pick the frontier.** The best M gate-passing revisions by score. Wave 1's frontier
   is the base alone.

2. **Fork-fan-out.** For each frontier node, spawn J children — one divergent idea each,
   each in its own pando workspace forked from that node, each carrying the journal and
   the node's context. Lay the children out as jj siblings of their frontier node. Fork,
   don't re-onboard: a child inherits its parent's workspace and the journal; it must not
   re-derive the codebase from scratch. Reuse a per-stage implement→review→fix workflow as
   the child body, or a lighter implement-only step for pure-metric search.

3. **Judge every child.** Run the frozen judge in each workspace; record `{ score, gate }`.

4. **Append to the journal.** One row per child — winners and losers alike, always.

5. **Prune, durably.** Keep the best M as the new frontier; mark the rest pruned. A pruned
   attempt stays as a jj revision — never abandon it mid-run — so the retro can read why
   it lost.

6. **Refill ideas.** Brainstorm the next wave's moves from what the journal now shows:
   lean into what improved, drop dead directions. When stuck, widen rather than stop.

The loop ends when the token budget runs out or the frontier fails to improve for K
consecutive waves (convergence).

## Phase 3 — Harvest

1. **Pick the winner.** The best-scoring gate-passing revision in the journal.

2. **Harvest the path.** Rebase the base→…→winner path into a clean linear stack
   (`jj rebase -r <rev> -d <previous>`), dropping the dead-end siblings from the stack.
   The linear stack is the PR; the pruned attempts remain in the op log, not the deliverable.

3. **Leave the journal.** It is the audit trail — do not delete it. Surface the top moves
   and any gate-failures-with-better-scores: near-misses worth a human ruling.

## Rules

- The judge is frozen. An attempt that edits the judge, the gate, or the files it grades
  is void — discard it, do not score it.
- The gate outranks the score. A better number behind a failed gate never advances.
- Prune is durable. Pruning drops a revision from the frontier; it never destroys it.
- The journal is the source of truth and the shared context. Every child reads it before
  acting and writes back to it after.
