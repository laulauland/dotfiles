# Mode: Diagram

Generate a standalone HTML diagram for any topic and open it in the browser.

Follow the skill's shared workflow (Think → Structure → Style → Deliver → Quality gate). Pick a distinctive aesthetic that fits the content — vary fonts, palette, and layout from previous diagrams.

## Picking the right diagram type

Use `references/diagram-types.md` for detailed guidance on each type. Quick reference:

- **Architecture (text-heavy)** — CSS Grid cards + flow arrows. Use when cards need descriptions, code references, tool lists.
- **Architecture (topology-focused, <10 elements)** — Mermaid `graph TD`.
- **Architecture (15+ elements)** — hybrid pattern: simple Mermaid overview + detailed CSS Grid cards below.
- **Flowchart / pipeline** — Mermaid `graph TD` (prefer over LR for complex).
- **Sequence diagram** — Mermaid `sequenceDiagram`.
- **Data flow** — Mermaid with edge labels.
- **ER / schema** — Mermaid `erDiagram`.
- **State machine** — Mermaid `stateDiagram-v2` (or `flowchart TD` if labels need special chars).
- **Mind map** — Mermaid `mindmap`.
- **Class diagram** — Mermaid `classDiagram`.
- **C4 architecture** — Mermaid `graph TD` + `subgraph` (NOT native `C4Context`).
- **Data table** — HTML `<table>`, see `templates/data-table.html`.
- **Timeline / roadmap** — CSS central line + cards.
- **Dashboard** — CSS Grid + Chart.js.

## Delivery

Write to `~/.agent/diagrams/` with a descriptive filename. Open in the browser. Tell the user the path.
