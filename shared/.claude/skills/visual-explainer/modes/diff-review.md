# Mode: Diff Review

Generate a comprehensive visual diff review as a self-contained HTML page — before/after architecture comparison with code review analysis. Use a GitHub-diff-inspired aesthetic with red/green before/after panels; vary fonts and palette.

Ultrathink.

## Scope detection

Determine what to diff based on the argument the user provided:

- Branch name (`main`, `develop`) — working tree vs that branch
- Commit hash — that specific commit's diff (`git show <hash>`)
- `HEAD` — uncommitted changes only (`git diff` and `git diff --staged`)
- PR number (`#42`) — `gh pr diff 42`
- Range (`abc123..def456`) — diff between two commits
- No argument — default to `main`

## Data gathering

Run these first to understand the full scope:

- `git diff --stat <ref>` — file-level overview
- `git diff --name-status <ref> --` — new/modified/deleted files (separate src from tests)
- Line counts: compare key files between `<ref>` and working tree (`git show <ref>:file | wc -l` vs `wc -l`)
- New public API surface: grep added lines for exported symbols (adapt to language — `export`/`function`/`class`/`interface` for TS/JS, `def`/`class` for Python, `func`/`type` for Go)
- Feature inventory: grep for new actions, keybindings, config fields, event types on both sides
- Read all changed files in full — include surrounding code paths needed to validate behavior
- Check whether `CHANGELOG.md` has an entry
- Check whether `README.md` or `docs/*.md` need updates
- Reconstruct decision rationale: mine the current conversation for approaches discussed, alternatives rejected, trade-offs made. Check progress docs (`~/.agent/memory/{project}/progress.md`, `~/.pi/agent/memory/{project}/progress.md`) or plan files. For committed changes, read commit messages and PR descriptions.

## Verification checkpoint

Before generating HTML, produce a structured fact sheet of every claim the review will present:

- Every quantitative figure (line counts, file counts, function counts, test counts)
- Every function, type, module name you will reference
- Every behavior description (what code does, what changed, before vs after)
- For each, cite the source: the git command output or the file:line where you read it

Verify each against the code. Mark unverifiable claims as uncertain. This fact sheet is your source of truth during HTML generation.

## Page structure

1. **Executive summary** — lead with the *intuition*: why do these changes exist? What problem were they solving, what was the core insight? Then the factual scope (X files, Y lines, Z new modules). Aim for "aha moment" clarity. *Visual anchor — hero depth (20-24px type, subtle accent-tinted background, more padding).*
2. **KPI dashboard** — lines added/removed, files changed, new modules, test counts. Include a **housekeeping** indicator: CHANGELOG updated (green/red badge), docs need changes (green/yellow/red).
3. **Module architecture** — Mermaid dependency graph of the current state. `.mermaid-wrap` with zoom controls (+/−/reset/expand), Ctrl/Cmd+scroll zoom, click-drag pan, click-to-expand (full-size in new tab). See `references/css-patterns.md` "Mermaid Zoom Controls" for the `openMermaidInNewTab()` pattern.
4. **Major feature comparisons** — side-by-side before/after panels for each significant area (UI, data flow, API surface, config). Overflow: `min-width: 0` on grid/flex children, `overflow-wrap: break-word` on panels. Never `display: flex` on `<li>` — absolute positioning for markers. See css-patterns.md Overflow Protection.
5. **Flow diagrams** — Mermaid flowchart/sequence/state for new lifecycle/pipeline/interaction patterns. Same zoom controls.
6. **File map** — full tree, color-coded new/modified/deleted. *Compact — consider `<details>` collapsed by default.*
7. **Test coverage** — before/after test file counts and what's covered.
8. **Code review** — structured Good/Bad/Ugly analysis:
   - **Good**: solid choices, improvements, clean patterns worth calling out
   - **Bad**: concrete issues — bugs, regressions, missing error handling, logic errors
   - **Ugly**: subtle problems — tech debt, maintainability concerns, works now but bites later
   - **Questions**: anything unclear or needing author clarification
   - Styled cards with green/red/amber/blue left-border accents. Each item references specific files and line ranges. If nothing to flag, say "None found" — don't omit the section.
9. **Decision log** — for each significant design choice in the diff, a styled card:
   - **Decision** — one-line summary ("Promise-based deferred resolution instead of event emitters for cleanup signaling")
   - **Rationale** — why this approach, constraints, trade-offs. Pull from conversation context if available; infer from code structure if not.
   - **Alternatives considered** — rejected paths and why, if recoverable
   - **Confidence** — High (sourced from conversation/docs, green left border), Medium (inferred from code, blue left border, labeled "inferred"), Low (not recoverable, amber left border, "rationale not recoverable — document before committing"). Low-confidence cards are cognitive debt hotspots.
10. **Re-entry context** — concise "note from present-you to future-you". *Compact — consider `<details>` collapsed by default.*
   - **Key invariants** — assumptions the changed code relies on that aren't enforced by types or tests
   - **Non-obvious coupling** — files connected in ways invisible from imports alone
   - **Gotchas** — what would surprise someone modifying this in two weeks
   - **Don't forget** — follow-up work (migration, config update, docs)

## Visual hierarchy

Sections 1-3 dominate on load (hero depth, larger type, more padding). Sections 6+ are reference — lighter (flat or recessed, compact, collapsible).

Diff-style color language throughout: red for removed/before, green for added/after, yellow for modified, blue for neutral context. Include responsive section navigation from `references/responsive-nav.md`. Write to `~/.agent/diagrams/` and open in browser.
