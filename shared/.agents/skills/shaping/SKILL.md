---
name: shaping
description: Use this methodology when collaboratively shaping a solution with the user - iterating on problem definition (requirements) and solution options (shapes).
---

# Shaping Methodology

A structured approach for collaboratively defining problems and exploring solution options. Keep the active artifact visible, negotiate requirements and shapes with the user, and preserve consistency across the document hierarchy.

## Invocation

Use this skill when the user wants to shape a feature, clarify a problem, compare solution options, turn a selected solution into implementation slices, or continue work in an existing shaping document.

## Session workflow

1. **Load the right references.** Always read [`CONSISTENCY.md`](CONSISTENCY.md), [`CONCEPTS.md`](CONCEPTS.md), and [`COMMUNICATION.md`](COMMUNICATION.md). Then read any topic files that match the session:
   - comparing options or alternatives: [`FIT_CHECKS.md`](FIT_CHECKS.md)
   - writing or revising parts: [`SHAPE_PARTS.md`](SHAPE_PARTS.md)
   - using breadboards, detailing, or slicing: [`BREADBOARDS_AND_SLICING.md`](BREADBOARDS_AND_SLICING.md)
   - framing, shaping docs, slices docs, or slice plans: [`DOCUMENTS.md`](DOCUMENTS.md)
   - investigation tasks: [`SPIKES.md`](SPIKES.md)
   - example format: [`EXAMPLE.md`](EXAMPLE.md)
2. **Choose the entry point.** Offer both starts: from requirements (problem, pain points, constraints) or from shapes (a solution already in mind). There is no required order; R and S inform each other throughout.
3. **If continuing an existing shaping doc, orient on the selected shape.** Show the fit check for the selected shape only, then call out unsolved requirements or selected-shape failures.
4. **Work iteratively.** Populate R, sketch shapes, detail components, explore alternatives, check fit, extract missing requirements, breadboard, spike unknowns, decide, or slice as needed.
5. **Maintain consistency.** Whenever a change touches one level, update affected higher or lower documents in the same operation.

## Router

| Need | Read |
|---|---|
| Document hierarchy, ripple rules, and anti-drift practice | [`CONSISTENCY.md`](CONSISTENCY.md) |
| Requirements, shapes, notation, phases, and possible actions | [`CONCEPTS.md`](CONCEPTS.md) |
| Fit-check formats, conventions, alternatives, macro fit checks | [`FIT_CHECKS.md`](FIT_CHECKS.md) |
| Full-table display, complete artifacts, change markers | [`COMMUNICATION.md`](COMMUNICATION.md) |
| Spike purpose, file management, structure, acceptance, questions | [`SPIKES.md`](SPIKES.md) |
| Breadboards, detailing a selected shape, slicing outputs | [`BREADBOARDS_AND_SLICING.md`](BREADBOARDS_AND_SLICING.md) |
| Shape-part mechanics, flags, vertical parts, hierarchy | [`SHAPE_PARTS.md`](SHAPE_PARTS.md) |
| Frame, shaping, slices, slice plans, frontmatter, source material | [`DOCUMENTS.md`](DOCUMENTS.md) |
| Concrete search-feature example | [`EXAMPLE.md`](EXAMPLE.md) |

## Completion check

Before ending a shaping turn, verify:

- Every displayed requirements or shape table is complete, not summarized.
- Changed or added table lines are marked with 🟡 when re-rendering.
- Fit checks use the required symbols and put explanations in notes or gap tables.
- Any flagged unknown that affects fit is treated as unresolved or turned into a spike.
- All affected levels of the document hierarchy are synchronized.
