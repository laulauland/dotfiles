# Mode: tldraw Canvas

Generate a diagram directly on the user's tldraw canvas via the tldraw MCP server. Unlike the HTML modes, this produces an **interactive, editable whiteboard** — the user can drag, edit, and extend afterward.

Use when: user says "tldraw", "on the canvas", "whiteboard", "sketch on tldraw", or is explicitly working inside tldraw-desktop. Also prefer when the diagram will be iterated on live rather than shipped as a document.

Do NOT use tldraw for: tables, code blocks, prose-heavy pages, slide decks, or anything meant as a shareable deliverable. Those belong in HTML.

## The MCP surface

The following tools are exposed by the tldraw-desktop local HTTP API via MCP:

- `mcp__claude_ai_TLDraw__search` — query the tldraw Editor SDK spec. **Always use this first** when unsure of a method's name, signature, or shape schema. Example: search "createShape", "arrow", "group", "richText".
- `mcp__claude_ai_TLDraw__exec` — run arbitrary JavaScript on the canvas. Your code receives `editor` (the tldraw Editor instance) plus helpers: `toRichText`, `createShapeId`, `createArrowBetweenShapes`.
- `mcp__claude_ai_TLDraw___get_canvas_state` — read current canvas shapes, assets, bindings as raw TL data. Use before editing to avoid clobbering existing content, or to find empty space.
- `mcp__claude_ai_TLDraw__save_checkpoint` / `read_checkpoint` — group changes into undo-able batches. Always checkpoint before a multi-step creation so the user can undo the whole diagram with one step.
- `mcp__claude_ai_TLDraw___exec_callback` — used internally when `exec` triggers a callback.

## Workflow

### 1. Orient before acting

- Read current canvas state. Identify a clear region to work in — don't overlap existing shapes.
- If the user hasn't given a location, pick a fresh area offset from any existing shapes.
- Search the SDK for anything you're about to call that isn't obvious. The API evolves — don't trust memory.

### 2. Save a checkpoint

Before creating shapes, call `save_checkpoint` with a short label (e.g. "auth-flow diagram"). If the user doesn't like it, one undo reverts everything.

### 3. Create shapes via `exec`

Build the full diagram in one `exec` call when possible — atomic batches feel snappier than many round-trips. Use `createShapeId` for every shape you'll reference later (for arrows/bindings). Use `toRichText` for labels that need formatting. Use `createArrowBetweenShapes` for bound connectors rather than free arrows — they stay attached when shapes move.

Layout: position shapes with concrete x/y/w/h. Leave breathing room (≥40px gaps). Avoid crammed grids — the user will want to drag things.

### 4. Verify visually

After creating, take a screenshot via `GET /api/doc/:id/screenshot` (size=medium) or use whatever the MCP surface for screenshots is. Confirm the diagram reads correctly. If labels overflow or arrows cross awkwardly, fix.

### 5. Hand off

Tell the user what you created, where on the canvas, and point out anything they might want to adjust. Don't over-arrange — they'll want to move things themselves.

## Mapping diagram types to tldraw

See `references/diagram-types.md` for the conceptual patterns. Canvas translation:

| Type | tldraw shapes |
|---|---|
| Flowchart / pipeline | Rounded rectangles + bound arrows (`createArrowBetweenShapes`). Decision points: diamond (geo shape with `type: 'diamond'`). |
| Architecture (topology) | Rectangles grouped by subsystem using `editor.createShapes` + a frame shape as boundary. |
| Sequence diagram | Actors as vertical columns (tall rectangles); messages as horizontal arrows between them; activations as filled rectangles on the lifeline. |
| ER / schema | Entity boxes with rich-text field lists; foreign-key arrows between them. |
| State machine | Rounded rectangles (states) + bound arrows with labels for transitions. Initial state: small filled circle pointing into the first state. |
| Mind map | Central shape with radial children; bind with arrows. Use color variation between branches. |
| C4 context | Nested frames for system/container/component boundaries; shapes for persons (circles), systems (rectangles), databases (geo shape `cylinder`). |
| Mermaid-equivalents | Pick the nearest shape vocabulary above — tldraw has no direct Mermaid renderer. |

## Style and composition

- tldraw has its own visual language — don't try to replicate CSS patterns from the HTML modes. Work with the built-in shape styles (color, fill, dash, size).
- Use **color sparingly** to signal semantic grouping (e.g., all cache-layer shapes green). Don't rainbow-ize.
- Keep text small and labels terse. The canvas can be zoomed; long labels fight the medium.
- Prefer bound arrows (`createArrowBetweenShapes`) over free-floating arrows so the topology survives dragging.
- For emphasis, use tldraw's native "highlight" or bolder stroke width rather than custom shapes.

## Edge cases

- **Busy canvas.** If the existing canvas is cluttered, offer to create the diagram on a new page (`editor.createPage`) rather than squeezing it in.
- **Large diagrams.** If 20+ shapes, group them via a frame with a title — makes the whole thing draggable as a unit.
- **User iterations.** When the user says "add X" or "change Y", read canvas state first so you're editing the existing diagram, not creating a duplicate alongside it.
