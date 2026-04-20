# Mode: Visual Implementation Plan

Generate a comprehensive visual implementation plan for a feature as a self-contained HTML page. Use editorial or blueprint aesthetic; vary fonts and palette.

Ultrathink.

## Data gathering

1. **Parse the feature request.** Core problem, desired behavior, constraints, scope boundaries.
2. **Read the relevant codebase.** Files that need modification, existing patterns, related functionality, types/interfaces the feature must conform to.
3. **Understand extension points.** Hook points, event systems, config options, public APIs, test patterns.
4. **Check for prior art.** Similar features, related discussions, reusable code.

## Design phase

Work through the implementation before writing HTML:

1. **State design.** New state variables, affected existing state, state machine if multi-mode.
2. **API design.** Commands/functions/endpoints added, signatures, error cases.
3. **Integration design.** Interactions with existing functionality, hooks/events.
4. **Edge cases.** Concurrent operations, error conditions, boundary values, user mistakes.

## Verification checkpoint

Before generating HTML, produce a structured fact sheet:
- Every state variable (new and modified) with type and purpose
- Every function/command/API with signature
- Every file needing modification with the specific changes
- Every edge case with expected behavior
- Every assumption about the codebase the plan relies on

Verify each against the code. Mark unverifiable claims as uncertain. This fact sheet is your source of truth during HTML generation — do not deviate from it.

## Page structure

1. **Header** — feature name, one-line description, scope summary. Distinctive monospace label ("Feature Plan", "Implementation Spec"), large italic title, muted subtitle. Sets the tone.
2. **The Problem** — side-by-side comparison: current behavior vs. desired. Concrete examples, step-by-step. Two-column grid: rose-tinted "Before" header, sage-tinted "After" header. Numbered flow steps with arrows.
3. **State Machine** — Mermaid flowchart or stateDiagram, edges labeled with triggers. Wrap in `.mermaid-wrap` with zoom controls. Use `flowchart TD` if labels need special characters (see `references/diagram-types.md`).
4. **State Variables** — card grid of new/modified state. `white-space: pre-wrap` on code blocks. Two cards side-by-side, elevated depth, monospace labels.
5. **Modified Functions** — for each: function name + file path, key snippet (10-20 lines showing the pattern, not full implementation), explanation of what changed and why. File path as monospace dim text above code block; code in recessed card with accent-dim background.
6. **Commands / API** — table with name, parameters, behavior. `<code>` for technical names. Bordered table, sticky header, alternating row backgrounds.
7. **Edge Cases** — table: scenarios and expected behaviors. Include error conditions, concurrency, boundaries.
8. **Test Requirements** — table or card grid grouped by unit / integration / edge case tests. Compact, file references.
9. **File References** — compact table mapping files to changes. Use `<details>` if many.
10. **Implementation Notes** — callout boxes: backward compatibility (gold border), critical warnings (rose border), performance (amber border).

## Visual hierarchy

- Sections 1-3 dominate on load (hero depth for header, elevated for problem and state machine)
- Sections 4-6 are core implementation details (elevated cards, readable code)
- Sections 7-10 are reference material (flat or recessed, compact, collapsible where useful)

## Code block requirements

- Always `white-space: pre-wrap` and `word-break: break-word`
- File path headers where relevant
- Keep snippets focused — show the pattern, not the full implementation

Semantic colors: gold for primary accents, sage for "after"/success, rose for "before"/warning. Both themes must work.

Write to `~/.agent/diagrams/` with descriptive filename (`feature-name-plan.html`). Open in browser. Tell the user the path.
