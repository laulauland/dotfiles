---
name: jj-plan
description: Lay out planned work from a spec as empty jj revisions — one per stage — each carrying the stage's goal, a link to the spec, acceptance criteria, scope, files, and verification, plus a deviations log. Then execute each stage by filling its revision with the right workflow. Use when turning a spec into staged / phased / sliced work in a jj repo, when asked to plan implementation as jj revisions, or when working through such a plan.
allowed-tools: Bash(jj:*), Bash(pando:*), Bash(pd:*), Bash(fd:*), Bash(rg:*)
---

# jj-plan

Turn a spec into a graph of empty jj revisions, one per stage, where each
revision's description *is* the plan for that stage. As work proceeds, fill each
planned revision with the real implementation, keeping its description as the
commit message and recording any deviations there. The `jj log` becomes a living,
durable plan you can read at any time.

There are two phases: **Plan** (lay out the revisions, then stop for confirmation)
and **Execute** (fill each revision with the right workflow). Never start Execute
until the user has confirmed the plan.

## Phase 1 — Plan

1. **Read the spec.** It may be an in-tree markdown file, the description of a base
   revision, or an external doc or issue. Build a clear model of the work before
   slicing it.

2. **Break it into stages.** Prefer thin vertical slices that each deliver
   something verifiable. Decide ordering from real dependencies: stages that depend
   on each other form a **linear stack**; stages that are independent are laid out
   as **siblings** (sharing a parent) so they can be implemented in parallel.

3. **Place the base.**
   - If the spec lives in the source tree, put it at the base of the stack — its
     own revision, or the existing revision that introduces it — so the whole plan
     descends from the spec.
   - If the spec is external, or is already a base revision, descend the stack from
     `trunk()` or `@` and link out to it instead.

4. **Create one empty revision per stage** and give each the description template
   below. Sequential stages chain with `jj new <parent>`; parallel stages share a
   parent (run `jj new <parent>` once per sibling).

5. **Show the plan and stop.** Print `jj log` of the planned stack and ask the user
   to confirm before any implementation.

### Stage description template

The first line is the jj summary, so keep it short and imperative.

```
stage N: <short imperative title>

Part of: <spec link>   (stage N/M)

## Goal
<1–3 sentences: what this stage delivers and why>

## Acceptance criteria
- [ ] <observable, checkable criterion>
- [ ] <…>

## Out of scope
- <what this stage deliberately does not do>

## Files / areas
- <path or module> — <what changes>

## Verification
- <command or manual check that proves it works>

## Deviations
(none yet)
```

`<spec link>` is whatever fits the project: a relative file path with an optional
`#heading` anchor, a base revision's change-id or bookmark, or an external URL. Set
a description non-interactively with `jj describe -r <change-id> -m "<full text>"`.

## Phase 2 — Execute

Run only after the plan is confirmed, and work one stage at a time (independent
siblings may run in parallel — see below).

**Fill the planned revision.** Move the working copy into the stage's revision with
`jj edit <change-id>` so edits land in it directly and its planned description stays
on as the commit message. Descendant stages rebase automatically as you work.

**Pick the workflow by the stage's complexity.** The always-on baseline is an
**implement → review → fix loop**: implement, run a review with `/code-review`,
apply the fixes, and repeat until the review is clean. Default to running this loop
inline; escalate to an orchestrated multi-agent workflow only for large or risky
stages. Layer on whichever shape fits:

- **TDD from acceptance criteria** — turn each acceptance criterion into a failing
  test first, then implement until green. Use when the criteria are concrete and
  testable.
- **Adversarial spec verification** — once it looks done, have independent agents
  try to prove the stage violates its acceptance criteria or the spec. Mark the
  stage done only if they fail to break it. Use for high-stakes or subtle stages.
- **Diagnose loop** — if the stage is a bug fix, run the `diagnose` skill
  (reproduce → hypothesise → instrument → fix → regression test) instead of plain
  implement.

**Parallel siblings.** For independent sibling stages, give each its own
copy-on-write workspace with the `pando` skill and implement them concurrently,
running each one's implement → review → fix loop inside its workspace. Integrate
them back **one at a time**, then **rebase the siblings into a linear stack**
(`jj rebase -r <sibling> -d <previous>`), resolving conflicts as you go. Do not
build a megamerge.

**Gate before moving on.** A stage is done only when every acceptance-criteria
checkbox is genuinely met — tick them in the description with `jj describe` — and
the Verification steps pass. Do not advance to the next stage with unmet criteria
unless the user approves the gap.

**Record deviations.** Whenever the implementation departs from the plan, append a
plain bullet under `## Deviations` in that stage's description (via `jj describe`)
stating what changed, why, and which criterion or assumption it affects. If a
deviation contradicts the spec itself, surface it to the user rather than quietly
proceeding.

## Rules

- The jj description is the source of truth for each stage. Keep it current as you
  work, including checkboxes and deviations.
- One revision per stage. Never collapse stages, and never lose a stage's planned
  description when filling it.
- Plan first, confirm, then execute. Re-confirm with the user before reordering or
  dropping a stage.
