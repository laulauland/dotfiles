# Overview

## When to Use Penrose vs Alternatives

Penrose excels when:
- Layout has non-trivial spatial constraints (containment, separation, proximity, alignment) that are tedious to hand-place
- You need custom visual semantics — shapes, colors, and spatial relationships that encode domain meaning
- The diagram type doesn't have a boxed tool (Mermaid, D2) that handles it natively
- You want to separate the data (substance) from the rendering (style) so the same content can be visualized differently

Good fits: set theory (Euler/Venn), graph theory, geometry, linear algebra, chemistry, category theory, service architecture, entity-relationship, state machines, dependency graphs, org charts, network topologies.

Use Mermaid or the visual-explainer skill instead for standard flowcharts, sequence diagrams, Gantt charts, or UI mockups — those tools have built-in conventions that save setup time.

## Workflow

1. Write the three files (.domain, .substance, .style)
2. Render with `roger` CLI: `npx @penrose/roger trio file.substance file.style file.domain > output.svg`
3. Open the SVG to verify

For programmatic use (TypeScript), use `@penrose/core` — see the API section below.

