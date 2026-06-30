# Breadboards, Detailing, and Slicing

## Breadboards

Use the `/breadboarding` skill to map existing systems or detail a shape into concrete affordances. Breadboarding produces:
- UI Affordances table
- Non-UI Affordances table
- Wiring diagram grouped by Place

Invoke breadboarding when you need to:
- Map existing code to understand where changes land
- Translate a high-level shape into concrete affordances
- Reveal orthogonal concerns (parts that are independent of each other)

### Tables Are the Source of Truth

The affordance tables (UI and Non-UI) define the breadboard. The Mermaid diagram renders them.

When receiving feedback on a breadboard:
1. **First** — update the affordance tables (add/remove/modify affordances, update Wires Out)
2. **Then** — update the Mermaid diagram to reflect those changes

Never treat the diagram as the primary artifact. Changes flow from tables → diagram, not the reverse.

### CURRENT as Reserved Shape Name

Use **CURRENT** to describe the existing system. This provides a baseline for understanding where proposed changes fit.
## Detailing a Shape

When a shape is selected, you can expand it into concrete affordances. This is called **detailing**.

### Notation

Use "Detail X" (not a new letter) to show this is a breakdown of Shape X, not an alternative:

```markdown
## A: First approach
(shape table)

## B: Second approach
(shape table)

## Detail B: Concrete affordances
(affordance tables + wiring)
```

### What Detailing Produces

Use the `/breadboarding` skill to produce:
- **UI Affordances table** — Things users see and interact with (inputs, buttons, displays)
- **Non-UI Affordances table** — Data stores, handlers, queries, services
- **Wiring diagram** — How affordances connect across places

### Why "Detail X" Not "C"

Shape letters (A, B, C...) are **mutually exclusive alternatives** — you pick one. Detailing is not an alternative; it's a deeper breakdown of the selected shape. Using a new letter would incorrectly suggest it's a sibling option.

```
A, B, C = alternatives (pick one)
Detail B = expansion of B (not a choice)
```
## Slicing

After a shape is breadboarded, slice it into vertical implementation increments. Use the `/breadboarding` skill for the slicing process — it defines what vertical slices are, the procedure for creating them, and visualization formats.

**The flow:**
1. **Parts** → high-level mechanisms in the shape
2. **Breadboard** → concrete affordances with wiring (use `/breadboarding`)
3. **Slices** → vertical increments that can each be demoed (use `/breadboarding` slicing section)

**Key principle:** Every slice must end in demo-able UI. A slice without visible output is a horizontal layer, not a vertical slice.

**Document outputs:**
- **Slices doc** — slice definitions, per-slice affordance tables, sliced breadboard
- **Slice plans** — individual implementation plans (V1-plan.md, V2-plan.md, etc.)
