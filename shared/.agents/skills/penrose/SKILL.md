---
name: penrose
description: Create diagrams using Penrose — a constraint-based system that separates content from visual representation using three DSLs (domain, substance, style). Use when the user asks for set diagrams, graph layouts, geometry figures, architecture diagrams, entity-relationship diagrams, state machines, dependency graphs, or any relational diagram where automatic layout from constraints is valuable.
---

# Penrose Diagrams

Use Penrose when a diagram needs custom visual semantics and constraint-based layout across domain, substance, and style files.

## Branches

| Need | Read |
| --- | --- |
| Decide whether Penrose fits and start the workflow | [Overview](OVERVIEW.md) |
| Write domain, substance, and style files | [DSL](DSL.md) |
| Look up shapes, values, constraints, layout stages, and collectors | [Reference](REFERENCE.md) |
| Render with `roger` or embed with `@penrose/core` | [API](API.md) |
| Debug common syntax and layout issues | [Troubleshooting](TROUBLESHOOTING.md) |
| Adapt complete diagram patterns | [Examples](EXAMPLES.md) |

## Workflow

1. Confirm Penrose is a good fit; otherwise use Mermaid or visual-explainer.
2. Model the diagram vocabulary in `.domain` and the concrete facts in `.substance`.
3. Write `.style` with a mandatory canvas, selectors, shapes, constraints, and objectives.
4. Render with `npx @penrose/roger trio file.substance file.style file.domain > output.svg`.
5. Inspect the SVG, adjust constraints or variation seeds, and repeat until the layout is clear.

## Completion Checks

- The domain, substance, and style files compile together.
- The style file has a `canvas` block.
- Labels, layers, and arrows communicate the intended relationships.
- The rendered SVG has no avoidable overlaps or off-canvas content.
- Any generated files and references use paths local to the current project.
