# Mode: Plan Review

Generate a comprehensive visual plan review as a self-contained HTML page — current codebase state vs. a proposed implementation plan. Use a blueprint/editorial aesthetic with current-state vs. planned-state panels; vary fonts and palette.

Ultrathink.

## Inputs

- **Plan file** — path to a markdown plan, spec, or RFC document (from the user's argument)
- **Codebase** — optional second arg, otherwise the current working directory

## Data gathering

1. **Read the plan file in full.** Extract problem statement and motivation, each proposed change (files to modify, new files, deletions), rejected alternatives and their reasoning, explicit scope boundaries or non-goals.

2. **Read every file the plan references.** For each file mentioned, read the current version in full. Also read files that import or depend on those files — the plan may miss ripple effects.

3. **Map the blast radius.** From the codebase:
   - What imports/requires the files being changed (grep for import paths)
   - What tests exist for the affected files (`.test.*` / `.spec.*`)
   - Config files, types, schemas that might need updates
   - Public API surface callers depend on

4. **Cross-reference plan vs. code.** For each proposed change, verify:
   - Does the file/function/type the plan references actually exist?
   - Does the plan's description of current behavior match what the code does?
   - Are there implicit assumptions about code structure that don't hold?

## Verification checkpoint

Fact sheet of every claim the review will present: quantitative figures, every function/type/module name you'll reference from plan and codebase, behavior descriptions (current vs planned), each with a source citation (plan section or file:line). Mark unverifiable claims as uncertain. This fact sheet is your source of truth.

## Page structure

1. **Plan summary** — lead with the *intuition*: what problem does this solve, what's the core insight? Then scope: files touched, estimated scale, new modules/tests planned. *Visual anchor — hero depth.*
2. **Impact dashboard** — files to modify, create, delete; estimated lines added/removed; new test files planned; dependencies affected. **Completeness** indicator: tests covered (green/red), docs updates (green/yellow/red), migration/rollback (green/grey for N/A).
3. **Current architecture** — Mermaid diagram of how the affected subsystem works *today*. Focus only on the parts the plan touches. `.mermaid-wrap` + zoom controls (see `references/css-patterns.md`). Use matching layout direction and node names with section 4 so the visual diff is obvious.
4. **Planned architecture** — Mermaid diagram of the subsystem *after* the plan. Same node names and layout direction as section 3. Highlight new nodes with glow/accent border, removed with strikethrough/reduced opacity, changed edges with a different stroke color.
5. **Change-by-change breakdown** — for each change, a side-by-side panel. Overflow: `min-width: 0` on grid/flex children, `overflow-wrap: break-word` on panels; absolute positioning for list markers.
   - **Left (current):** what the code does now — snippets or function signatures
   - **Right (planned):** what the plan proposes — plan's own code examples if provided
   - **Rationale:** below each panel, extract *why* the plan chose this approach. Pull from the plan's reasoning, rejected alternatives, or inline justifications. Map "rejected alternatives" sections back to specific changes. Flag changes that say *what* but not *why* — pre-implementation cognitive debt.
   - Flag discrepancies where the plan's description of current behavior doesn't match actual code.
6. **Dependency & ripple analysis** — *compact, consider `<details>` collapsed.* What else depends on the changed files. Table or Mermaid graph of callers, importers, downstream effects. Color-code: covered by plan (green), not mentioned but likely affected (amber), definitely missed (red).
7. **Risk assessment** — styled cards:
   - **Edge cases** the plan doesn't address
   - **Assumptions** the plan makes that should be verified
   - **Ordering risks** if changes need specific sequencing
   - **Rollback complexity** if things go wrong
   - **Cognitive complexity** — non-obvious coupling, action-at-a-distance, implicit ordering, contracts that exist only in memory. Each gets a brief mitigation suggestion ("add a comment explaining the ordering requirement", "add a runtime assertion"). These are specific to code patterns; broader concerns (overengineering, lock-in, maintenance burden) belong in section 8's Ugly category.
   - Severity indicator on each (low/medium/high).
8. **Plan review** — Good/Bad/Ugly/Questions of the plan itself:
   - **Good**: solid design decisions, well-reasoned tradeoffs
   - **Bad**: gaps — missing files, unaddressed edge cases, incorrect assumptions
   - **Ugly**: subtle concerns — complexity introduced, maintenance burden, scale problems
   - **Questions**: ambiguities needing author clarification before implementation
   - Styled cards with green/red/amber/blue left-borders. Each references specific plan sections and code files. "None found" if nothing to flag — don't omit.
9. **Understanding gaps** — closing dashboard rolling up rationale gaps from §5 and cognitive complexity flags from §7:
   - Count of changes with clear rationale vs missing rationale (bar chart or progress indicator)
   - List of cognitive complexity flags with severity
   - Explicit recommendations: "Before implementing, document the rationale for changes X and Y — the plan doesn't explain why these approaches were chosen over alternatives."
   - Makes cognitive debt visible *before* the work starts, when it's cheapest to address.

## Visual hierarchy

Sections 1-4 dominate (hero depth for summary, elevated for architecture diagrams). Sections 6+ lighter (flat or recessed, compact, collapsible).

Color language: blue/neutral for current state, green/purple for planned additions, amber for concerns, red for gaps/risks. Include responsive section navigation from `references/responsive-nav.md`. Write to `~/.agent/diagrams/` and open in browser.
