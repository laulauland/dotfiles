# Fit Checks

## Fit Check (Decision Matrix)

THE fit check is the single table comparing all shapes against all requirements. Requirements are rows, shapes are columns. This is how we decide which shape to pursue.

### Format

```markdown
## Fit Check

| Req | Requirement | Status | A | B | C |
|-----|-------------|--------|---|---|---|
| R0 | Make items searchable from index page | Core goal | ✅ | ✅ | ✅ |
| R1 | State survives page refresh | Must-have | ✅ | ❌ | ✅ |
| R2 | Back button restores state | Must-have | ❌ | ✅ | ✅ |

**Notes:**
- A fails R2: [brief explanation]
- B fails R1: [brief explanation]
```

### Conventions
- **Always show full requirement text** — never abbreviate or summarize requirements in fit checks
- **Fit check is BINARY** — Use ✅ for pass, ❌ for fail. No other values.
- **Shape columns contain only ✅ or ❌** — no inline commentary; explanations go in Notes section
- **Never use ⚠️ or other symbols in fit check** — ⚠️ belongs only in the Parts table's flagged column
- Keep notes minimal — just explain failures

### Comparing Alternatives Within a Component

When comparing alternatives for a specific component (e.g., C3-A vs C3-B), use the same format but scoped to that component:

```markdown
## C3: Component Name

| Req | Requirement | Status | C3-A | C3-B |
|-----|-------------|--------|------|------|
| R1 | State survives page refresh | Must-have | ✅ | ❌ |
| R2 | Back button restores state | Must-have | ✅ | ✅ |
```

### Missing Requirements
If a shape passes all checks but still feels wrong, there's a missing requirement. Articulate the implicit constraint as a new R, then re-run the fit check.

### Macro Fit Check

A separate tool from the standard fit check, used when working at a high level with chunked requirements and early-stage shapes where most mechanisms are still ⚠️. Use when explicitly requested.

The macro fit check has two columns per shape instead of one:

- **Addressed?** — Does some part of the shape seem to speak to this requirement at a high level?
- **Answered?** — Can you trace the concrete how? Is the mechanism actually spelled out?

**Format:**

```markdown
## Macro Fit Check: R × A

| Req | Requirement | Addressed? | Answered? |
|-----|-------------|:----------:|:---------:|
| R0 | Core goal description | ✅ | ❌ |
| R1 | Guided workflow | ✅ | ❌ |
| R2 | Agent boundary | ⚠️ | ❌ |
```

**Conventions:**
- Only show top-level requirements (R0, R1, R2...), not sub-requirements
- **No notes column** — keep the table narrow and scannable
- Use ✅ (yes), ⚠️ (partially), ❌ (no) for Addressed
- Use ✅ (yes) or ❌ (no) for Answered
- Follow the macro fit check with a separate **Gaps** table listing specific missing parts and their related sub-requirements
