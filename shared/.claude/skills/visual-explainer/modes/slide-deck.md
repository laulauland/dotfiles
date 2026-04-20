# Mode: Slide Deck

Generate a magazine-quality slide deck as a self-contained HTML page. Read `templates/slide-deck.html` and `references/slide-patterns.md` before generating.

**Slides are never auto-selected.** Only generate slides when explicitly requested: the user says "slide deck", passes `--slides` on any mode, or invokes this mode directly.

## Slides are a different medium

Slides are not pages reformatted. Each slide is exactly one viewport tall (`100dvh`) with no scrolling. Typography is 2–3× larger. Compositions are bolder. Compose a narrative arc (impact → context → deep dive → resolution) rather than mechanically paginating the source.

## Content completeness

Changing the medium does not mean dropping content. Follow "Planning a Deck from a Source Document" in `slide-patterns.md` before writing any HTML:

1. Inventory the source
2. Map every item to slides
3. Verify coverage

Every section, decision, data point, specification, and collapsible detail from the source must appear in the deck. If a plan has 7 sections, the deck covers all 7. If there are 6 decisions, present all 6 — not the 2 that fit on one slide. Collapsible details become their own slides. Add more slides rather than cutting content. A 22-slide deck that covers everything beats a 13-slide deck that looks polished but is missing 40% of the source.

## Slide types (10)

Title, Section Divider, Content, Split, Diagram, Dashboard, Table, Code, Quote, Full-Bleed. Each has a defined layout in `slide-patterns.md`. Content that exceeds a slide's density limit splits across multiple slides — never scrolls within a slide.

## Compositional variety

Consecutive slides must vary spatial approach: centered, left-heavy, right-heavy, split, edge-aligned, full-bleed. Three centered slides in a row means push one off-axis.

## Curated presets

Four slide-specific presets as starting points: Midnight Editorial, Warm Signal, Terminal Mono, Swiss Clean. Plus the 8 aesthetic directions adapted for slides. Pick one and commit through every slide. See `slide-patterns.md` for preset CSS values.

## Used as a `--slides` modifier

When the user passes `--slides` on a different mode (`diff-review`, `plan-review`, `project-recap`, `visual-plan`), gather data per that mode's workflow, then present the content as slides. Same breadth of coverage, different structure and pacing. Don't use slide format as an excuse to summarize or skip sections the scrollable version would have included.

## Delivery

Write to `~/.agent/diagrams/` with a descriptive filename (e.g. `quarterly-review.html`). Open in browser. Tell the user the path.
