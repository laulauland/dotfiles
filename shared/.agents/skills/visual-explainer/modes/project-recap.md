# Mode: Project Recap

Generate a comprehensive visual project recap as a self-contained HTML page — rebuild mental model of current state, recent decisions, and cognitive debt hotspots. Use a warm editorial or paper/ink aesthetic with muted blues and greens; vary fonts and palette.

Ultrathink.

## Time window

Parse the argument as a recency window:

- Shorthand like `2w`, `30d`, `3m` → git's `--since` format (`2w` → "2 weeks ago", `30d` → "30 days ago", `3m` → "3 months ago")
- If the argument doesn't match a time pattern, treat it as free-form context and use the default window
- No argument → default to `2w`

## Data gathering

1. **Project identity.** Read `README.md`, `CHANGELOG.md`, `package.json` / `Cargo.toml` / `pyproject.toml` / `go.mod` for name, description, version, dependencies. Read the top-level file structure.
2. **Recent activity.** `git log --oneline --since=<window>` for history. `git log --stat --since=<window>` for file-level scope. `git shortlog -sn --since=<window>` for contributor activity. Identify most-active areas.
3. **Current state.** `git status` for uncommitted changes. `git branch --no-merged` for stale branches. Search TODO/FIXME comments in recently changed files. Read progress docs if they exist (`~/.agent/memory/{project}/progress.md`, `~/.pi/agent/memory/{project}/progress.md`, `.pi/todos/`, or similar).
4. **Decision context.** Read recent commit messages for rationale. If running in the same session as recent work, mine the conversation history. Read any plan docs, RFCs, or ADRs.
5. **Architecture scan.** Read key source files — entry points, public API surface, the files most frequently changed in the window.

## Verification checkpoint

Fact sheet with every claim — quantitative figures (commit counts, file counts, line counts, branch counts), every module/function/type name, behavior and architecture descriptions. Cite each: git output or file:line. Mark unverifiable claims as uncertain. This is your source of truth.

## Page structure

1. **Project identity** — not the README blurb. A *current-state* summary: what this project does, who uses it, what stage it's at (early dev, stable, actively shipping). Include version, key dependencies, and the one-sentence "elevator pitch" for someone who forgot what they were building.
2. **Architecture snapshot** — Mermaid diagram of the system as it exists today. Conceptual modules and relationships, not every file. Label nodes with what they do, not just file names. `.mermaid-wrap` + zoom controls. *Visual anchor — hero depth.*
3. **Recent activity** — not raw git log. Human-readable narrative grouped by theme: feature work, bug fixes, refactors, infrastructure. Timeline visualization with significant changes called out. For each theme: one-sentence summary of what happened and why it mattered.
4. **Decision log** — key design decisions from the window. Extracted from commit messages, conversation history, plan docs, progress docs. Each: what was decided, why, what was considered. Highest-value section for fighting cognitive debt — the reasoning that evaporates first.
5. **State of things** — KPI card pattern (see `references/css-patterns.md`): large hero numbers for working/broken/blocked/in-progress counts, color-coded trend indicators. Dashboard of:
   - What's working (stable, shipped, tested)
   - What's in progress (uncommitted work, open branches, active TODOs)
   - What's broken or degraded (known bugs, failing tests, tech debt)
   - What's blocked (waiting on external input, dependencies, decisions)
6. **Mental model essentials** — the 5-10 things you need to hold in your head to work on this project effectively:
   - Key invariants and contracts (what must always be true)
   - Non-obvious coupling (things connected in ways invisible from the file tree)
   - Gotchas (common mistakes, easy-to-forget requirements, silent failures)
   - Naming conventions or patterns the codebase follows
7. **Cognitive debt hotspots** — amber-tinted cards with severity indicators (colored left border: red high, amber medium, blue low). Weakest-understanding areas:
   - Code that changed recently but has no documented rationale
   - Complex modules with no tests
   - Areas where multiple people (or agents) made overlapping changes
   - Files frequently modified but poorly understood
   - Flag each with severity + concrete suggestion ("add a doc comment to `buildCoordinationInstructions` explaining the 4 coordination levels — this function is called from 3 places and the behavior is non-obvious")
8. **Next steps** — inferred from recent activity, open TODOs, project trajectory. Not prescriptive — just "here's where the momentum was pointing when you left." Include explicit next-step notes from progress docs or plan files.

Include responsive section navigation. Color language: muted blues and greens for architecture, amber callouts for debt hotspots, green/blue/amber/red for status. Overflow protection on side-by-side/grid sections. Write to `~/.agent/diagrams/` and open in browser.
