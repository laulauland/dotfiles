# Diagram Types — Deep Reference

Long-form guidance per diagram type, including Mermaid gotchas that bite in real use. SKILL.md's rendering-approach table picks the medium; this file covers the details.

## Architecture / System Diagrams

Three approaches depending on complexity:

**Simple topology (under 10 elements)** — Mermaid `graph TD` with custom `themeVariables`. Produces readable diagrams with automatic edge routing.

**Text-heavy overviews (under 15 elements)** — CSS Grid with explicit row/column placement. Sections as rounded cards with colored borders and monospace labels. Vertical flow arrows between sections. See `templates/architecture.html`. Use when cards need descriptions, code references, tool lists, or other rich content Mermaid nodes can't hold.

**Complex architectures (15+ elements)** — **hybrid pattern**: simple Mermaid overview (5-8 nodes showing module relationships) followed by detailed CSS Grid cards for each module's internals. Visual topology AND readable details. The overview uses module names with `<small>` for key function names; cards below show full function lists with new/modified badges. Never try to cram 15+ elements into a single Mermaid diagram — it renders unreadably small even with zoom.

## Flowcharts / Pipelines

**Mermaid.** Automatic node positioning and edge routing produces proper diagrams with connecting lines, decision diamonds, parallel branches — dramatically better than CSS flexbox with arrow characters. Prefer `graph TD` (top-down); use `graph LR` only for simple 3-4 node linear flows. Color-code node types with Mermaid's `classDef` or rely on `themeVariables`.

## Sequence Diagrams

**Mermaid `sequenceDiagram`.** Lifelines, messages, activation boxes, notes, loops all need automatic layout. Style actors and messages via CSS overrides on `.actor`, `.messageText`, `.activation` classes.

## Data Flow

**Mermaid.** Emphasizes connections over boxes — exactly what Mermaid excels at. Use `graph TD` (or `graph LR` for simple linear flows) with edge labels for data descriptions. Thicker, colored edges for primary flows. Source/sink nodes styled differently from transform nodes via `classDef`.

## ER / Schema

**Mermaid `erDiagram`.** Relationship lines between entities need automatic routing. Style via `themeVariables` and CSS overrides on `.er.entityBox` and `.er.relationshipLine`.

## State Machines / Decision Trees

**Mermaid `stateDiagram-v2`** for states with labeled transitions. Supports nested states, forks, joins, notes. Decision trees can use `graph TD` with diamond decision nodes.

**⚠️ `stateDiagram-v2` label caveat.** Transition labels have a strict parser — colons, parentheses, `<br/>`, HTML entities, and most special characters cause silent parse failures ("Syntax error in text"). If labels need any of these (e.g., `cancel()`, `curate: true`, multi-line), use `flowchart TD` instead with rounded nodes and quoted edge labels (`|"label text"|`). Flowcharts handle all special characters and support `<br/>` for line breaks. Reserve `stateDiagram-v2` for simple single-word or plain-text labels.

## Mind Maps

**Mermaid `mindmap`** for hierarchical branching from a root. Mermaid handles radial layout automatically. Control node colors at each depth level via `themeVariables`.

## Class Diagrams

**Mermaid `classDiagram`** for domain modeling, OOP design, typed properties and methods. Relationships: association (`-->`), composition (`*--`), aggregation (`o--`), inheritance (`<|--`). Multiplicity labels (`"1" --> "*"`), abstract/interface markers (`<<interface>>`, `<<abstract>>`). For simple entity boxes without OOP semantics (no methods, no inheritance), prefer `erDiagram` — it produces cleaner output for pure data modeling.

## C4 Architecture

**Use Mermaid flowchart syntax — NOT native C4.** `graph TD` with `subgraph` blocks for C4 boundaries. Native `C4Context` hardcodes sharp corners, its own font, blue icons, and inline SVG colors that ignore `themeVariables` — it always clashes with custom palettes.

**Flowchart-as-C4 pattern:** Persons → rounded nodes `(("Name"))`, systems → rectangles `["Name"]`, databases → cylinders `[("Name")]`, boundaries → `subgraph` blocks, relationships → labeled arrows `-->|"protocol"|`. Use `classDef` + `:::className` to visually differentiate external systems (e.g., dashed borders). This inherits `themeVariables`, `fontFamily`, and CSS overrides like every other Mermaid diagram.

## Data Tables / Comparisons / Audits

Use a real `<table>` — not CSS Grid pretending to be a table. Tables get accessibility, copy-paste behavior, and column alignment for free. See `templates/data-table.html`.

**Proactive.** Any time you'd render an ASCII box-drawing table in the terminal, generate an HTML table instead: requirement audits (request vs plan), feature comparisons, status reports, configuration matrices, test result summaries, dependency lists, permission tables, API endpoint inventories.

**Layout patterns:**
- Sticky `<thead>` so headers stay visible on long tables
- Alternating row backgrounds via `tr:nth-child(even)` (subtle, 2-3% lightness shift)
- First column optionally sticky for wide tables with horizontal scroll
- Responsive wrapper with `overflow-x: auto` for tables wider than viewport
- Column width hints via `<colgroup>` or `th` widths — let text-heavy columns breathe
- Row hover highlight for scanability

**Status indicators** (styled `<span>`, never emoji):
- Match/pass/yes → colored dot or checkmark with green background
- Gap/fail/no → colored dot or cross with red background
- Partial/warning → amber indicator
- Neutral/info → dim text or muted badge

**Cell content:**
- Wrap long text naturally — don't truncate or force single-line
- `<code>` for technical references within cells
- Secondary detail in `<small>` with dimmed color
- Numeric columns right-aligned with `tabular-nums`

## Timeline / Roadmap

Vertical or horizontal timeline with a central line (CSS pseudo-element). Phase markers as circles on the line. Content cards branching left/right (alternating) or all to one side. Date labels on the line. Color progression from past (muted) to future (vivid).

## Dashboard / Metrics

Card grid layout. Hero numbers large and prominent. Sparklines via inline SVG `<polyline>`. Progress bars via CSS `linear-gradient` on a div. For real charts (bar, line, pie), use **Chart.js via CDN** (see `libraries.md`). KPI cards with trend indicators (up/down arrows, percentage deltas).

## Documentation (READMEs, Library Docs, API References)

Extract structure into visual elements:

| Content | Visual treatment |
|---------|------------------|
| Features | Card grid (2-3 columns) |
| Install/setup steps | Numbered cards or vertical flow |
| API endpoints/commands | Table with sticky header |
| Config options | Table |
| Architecture | Mermaid or CSS card layout |
| Comparisons | Side-by-side panels or table |
| Warnings/notes | Callout boxes |

Don't just format the prose — transform it. A feature list becomes a card grid. Install steps become a numbered flow. An API reference becomes a table.

## Prose Accent Elements

Use sparingly within visual pages to highlight key points or provide breathing room. See "Prose Page Elements" in `css-patterns.md` for the CSS.

- **Lead paragraph** — larger intro text to set context before diving into cards/grids
- **Pull quote** — highlight a key insight; one per page maximum
- **Callout box** — warnings, tips, important notes
- **Section divider** — visual break between major sections

---

## Mermaid gotchas (read before generating any Mermaid diagram)

**Theming.** Always use `theme: 'base'` with custom `themeVariables` so colors match your page palette. Use `layout: 'elk'` for complex graphs (requires `@mermaid-js/layout-elk` — see `libraries.md` for the CDN import). Override Mermaid's SVG classes with CSS for pixel-perfect control. Full guide in `libraries.md`.

**Containers.** Always center Mermaid diagrams with `display: flex; justify-content: center;`. Add zoom controls (+/−/reset/expand) to every `.mermaid-wrap` container. Include the click-to-expand JavaScript so clicking the diagram (or the ⛶ button) opens it full-size in a new tab.

**⚠️ Never use bare `<pre class="mermaid">`.** It renders but has no zoom/pan controls — diagrams become tiny and unusable. Always use the full `diagram-shell` pattern from `templates/mermaid-flowchart.html`: `.diagram-shell` > `.mermaid-wrap` > `.zoom-controls` + `.mermaid-viewport` > `.mermaid-canvas`, the CSS, and the ~200-line JS module for zoom/pan/fit. Copy it wholesale.

**Scaling.** Diagrams with 10+ nodes render too small by default. For 10-12 nodes, increase `fontSize` in themeVariables to 18-20px and set `INITIAL_ZOOM` to 1.5-1.6. For 15+ elements, don't try to scale — use the hybrid pattern instead (simple Mermaid overview + CSS Grid cards). See "Architecture" above.

**Layout direction.** Prefer `flowchart TD` (top-down) over `flowchart LR` (left-to-right) for complex diagrams. LR spreads horizontally and makes labels unreadable when there are many nodes. Use LR only for simple 3-4 node linear flows. See `libraries.md` "Layout Direction: TD vs LR".

**Line breaks in labels.** Use `<br/>` inside quoted labels. Never use escaped newlines like `\n` (Mermaid renders them as literal text in HTML output). Example: `A["Copilot Backend<br/>/api + /api/voicebot"]`.

**CSS class collision.** Never define `.node` as a page-level CSS class. Mermaid.js uses `.node` internally on SVG `<g>` elements with `transform: translate(x, y)` for positioning. Page-level `.node` styles (hover transforms, box-shadows) leak into diagrams and break layout. Use the namespaced `.ve-card` class for card components instead. The only safe way to style Mermaid's `.node` is scoped under `.mermaid` (e.g., `.mermaid .node rect`).
