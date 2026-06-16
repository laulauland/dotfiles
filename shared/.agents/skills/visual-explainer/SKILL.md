---
name: visual-explainer
description: Generate beautiful, self-contained HTML pages that visually explain systems, code changes, plans, and data. Use when the user asks for a diagram, architecture overview, diff review, plan review, project recap, comparison table, slide deck, fact-check against a document, or any visual explanation of technical concepts. Also use proactively when about to render a complex ASCII table (4+ rows or 3+ columns) — present it as a styled HTML page instead.
---

# Visual Explainer

Generate self-contained HTML files for technical diagrams, visualizations, and data tables. Always open the result in the browser. Never fall back to ASCII art when this skill is loaded.

## Routing

Classify the user's request and read the matching mode file. If the intent is ambiguous, ask one clarifying question before proceeding. If the request mentions "slides" or `--slides`, also read `modes/slide-deck.md` for the presentation-format rules.

| User wants… | Read |
|---|---|
| A **tldraw** / whiteboard / canvas diagram (interactive, editable) | `modes/tldraw.md` |
| Any other diagram, architecture overview, flowchart, ER, sequence, state, mind map, class diagram, C4 | `modes/diagram.md` |
| A visual implementation plan for a feature | `modes/visual-plan.md` |
| A slide deck (or any mode with `--slides` / "slides") | `modes/slide-deck.md` |
| A diff review (before/after + code review) | `modes/diff-review.md` |
| A plan vs. codebase comparison / risk assessment | `modes/plan-review.md` |
| A project recap / context-switch snapshot | `modes/project-recap.md` |
| Verify a doc against actual code | `modes/fact-check.md` |

`--slides` modifier: any mode can be requested in slide form. Gather data per the primary mode, then present as slides using `modes/slide-deck.md`.

## Proactive table rendering

When about to present tabular data as an ASCII box-drawing table in the terminal (comparisons, audits, feature matrices, status reports), generate an HTML page instead. Threshold: 4+ rows or 3+ columns. Don't wait to be asked — render HTML and tell the user the file path. A brief text summary in chat is fine; the table itself belongs in the browser.

## Shared workflow (all modes)

### 1. Think (5 seconds)
Commit to a direction. Don't default to dark + blue + Inter every time. Visual is always default — even essays become cards/grids/tables, with prose patterns (lead paragraphs, pull quotes, callouts) as accents.

**Who is looking?** Developer, PM, team? That shapes information density.

**What aesthetic?** Pick one and commit. Prefer constrained aesthetics — they have specific requirements that prevent generic output:
- **Blueprint** — technical drawing feel, subtle grid background, deep slate/blue, monospace labels, precise borders
- **Editorial** — serif headlines (Instrument Serif, Crimson Pro), generous whitespace, muted earth tones or navy + gold
- **Paper/ink** — warm cream `#faf7f5` background, terracotta/sage accents, informal feel
- **Monochrome terminal** — green/amber on near-black, monospace everything
- **IDE-inspired** — borrow a real, named color scheme: Dracula, Nord, Catppuccin Mocha/Latte, Solarized Dark/Light, Gruvbox, One Dark, Rosé Pine. Commit to the actual palette, don't approximate.

**Forbidden aesthetic:** Neon dashboard (cyan + magenta + purple on dark) and gradient mesh (pink/purple/cyan blobs) always produce AI slop.

Vary each generation. Swap test: if replacing your styling with a generic dark theme would go unnoticed, you haven't designed anything.

### 2. Structure — pick a rendering approach

| Content type | Approach |
|---|---|
| Architecture (text-heavy, cards need descriptions/code/tools) | CSS Grid cards → read `templates/architecture.html` |
| Architecture (topology-focused, under 10 elements) | Mermaid → read `templates/mermaid-flowchart.html` |
| Flowchart, sequence, data flow, ER, state, mind map, class, C4 | Mermaid |
| Data table / comparison / audit | HTML `<table>` → read `templates/data-table.html` |
| Timeline / roadmap | CSS (central line + cards) |
| Dashboard / metrics | CSS Grid + Chart.js |
| Slide deck | read `templates/slide-deck.html` + `modes/slide-deck.md` |
| Page with 4+ sections (reviews, recaps, dashboards) | Also read `references/responsive-nav.md` |
| Prose-heavy pages (READMEs, articles, essays) | Read "Prose Page Elements" in `references/css-patterns.md` + "Typography by Content Voice" in `references/libraries.md` |

For diagram-type specifics (Mermaid theming, zoom controls, stateDiagram-v2 parser caveat, C4-via-flowchart pattern, 15+ element hybrid, layout direction, CSS class collisions, scaling), read `references/diagram-types.md`.

For CSS/layout patterns and SVG connectors: `references/css-patterns.md`.
For fonts, palettes, Mermaid theming, Chart.js, anime.js CDN imports: `references/libraries.md`.

### 3. Style — anti-slop rules

Full rationale in `references/css-patterns.md` and `references/libraries.md`. Rules that apply to every page:

- **Fonts.** Forbidden as `--font-body`: Inter, Roboto, Arial, Helvetica, system-ui alone. Use a pairing from `libraries.md` and vary it per generation. Good starts: DM Sans + Fira Code, Instrument Serif + JetBrains Mono, IBM Plex Sans + IBM Plex Mono, Bricolage Grotesque + Fragment Mono, Plus Jakarta Sans + Azeret Mono. Load via `<link>`, include system fallback.

- **Colors.** Forbidden accents: `#8b5cf6`, `#7c3aed`, `#a78bfa`, `#d946ef`, and the cyan→magenta→pink combo. Forbidden effects: gradient text on headings, animated glowing box-shadows, pulsing on static content. Good palettes: terracotta + sage, teal + slate, rose + cranberry, amber + emerald, deep blue + gold. Build full palettes via CSS custom properties; support both light and dark.

- **Surfaces whisper.** Depth through 2–4% lightness shifts, not dramatic color. Borders via low-opacity rgba. Backgrounds are spaces, not voids — subtle gradients, faint grids, gentle radial glows.

- **Hierarchy.** Vary visual weight. Hero sections dominate (larger type, more padding, accent-tinted background). Reference sections stay compact. Use depth tiers: `ve-card--hero` → `ve-card` → `ve-card--recessed`. Asymmetric, not mirror-symmetric.

- **Headers.** No emoji icons. Use monospace labels with colored dot indicators, numbered badges, or inline SVG that matches the palette.

- **Animation earns its place.** Entrance reveals (staggered `fadeUp`, `fadeScale`, `drawIn`, `countUp`) and hover feedback only. Respect `prefers-reduced-motion`. Nothing glows or pulses on its own.

### 4. Deliver

- Write to `~/.agent/diagrams/` with a descriptive filename (`modem-architecture.html`, not `diagram.html`)
- Open: `open <path>` on macOS, `xdg-open <path>` on Linux
- Tell the user the path

### 5. Quality gate — run before delivering

- **Squint test.** Blur your eyes. Is hierarchy still readable? Are sections visually distinct?
- **Swap test.** Would a generic dark theme be indistinguishable? If yes, push the aesthetic further.
- **Both themes.** Toggle OS light/dark. Both look intentional, not broken.
- **No overflow.** Resize the browser — nothing clips. `min-width: 0` on grid/flex children. `overflow-wrap: break-word` on side-by-side panels. Never `display: flex` on `<li>` for markers — use absolute positioning. See "Overflow Protection" in `css-patterns.md`.
- **Mermaid zoom controls.** Every `.mermaid-wrap` has +/−/reset/expand buttons, Ctrl/Cmd+scroll zoom, click-drag pan, and click-to-expand (opens full-size in a new tab). Never bare `<pre class="mermaid">` — it renders but has no controls.
- **Slop check.** Two or more of these present means regenerate with a constrained aesthetic: Inter/Roboto body font, violet/indigo accents, gradient text, emoji section headers, glowing cards, cyan-magenta-pink scheme, three-dot code chrome, uniform card grid.
- **Information completeness.** Pretty but incomplete is a failure. Did you actually cover what was asked?

## File structure

Every diagram is a single self-contained `.html` file. Inline CSS. CDN links only for fonts and optional libraries (Mermaid, Chart.js, anime.js — see `references/libraries.md`).

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Descriptive Title</title>
  <link href="https://fonts.googleapis.com/css2?family=...&display=swap" rel="stylesheet">
  <style>/* CSS custom properties, theme, layout, components — all inline */</style>
</head>
<body>
  <!-- Semantic HTML. Optional <script> for Mermaid, Chart.js, anime.js -->
</body>
</html>
```
