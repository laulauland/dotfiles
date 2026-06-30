---
name: breadboarding
description: Transform a workflow description into affordance tables showing UI and Code affordances with their wiring. Use to map existing systems or design new ones from shaped parts.
---

# Breadboarding

Breadboarding transforms a workflow description into tables of affordances and their relationships. The tables are the truth. Mermaid diagrams are optional human-facing views.

## Branches

Pick the branch first, then load the files it needs:

| When the task is... | Load... |
|---|---|
| Mapping how an existing workflow actually works | [`MAPPING_EXISTING.md`](MAPPING_EXISTING.md), [`CONCEPTS.md`](CONCEPTS.md), [`TABLES.md`](TABLES.md) |
| Designing a concrete mechanism from shaped parts | [`DESIGNING_FROM_PARTS.md`](DESIGNING_FROM_PARTS.md), [`CONCEPTS.md`](CONCEPTS.md), [`TABLES.md`](TABLES.md) |
| Translating or reading a hand-drawn breadboard | [`WHITEBOARD.md`](WHITEBOARD.md), [`CONCEPTS.md`](CONCEPTS.md), [`TABLES.md`](TABLES.md) |
| Chunking a large breadboard or slicing it for delivery | [`CHUNKING_AND_SLICING.md`](CHUNKING_AND_SLICING.md) plus the original branch files |
| Rendering an optional diagram | [`MERMAID.md`](MERMAID.md) |
| Needing a full worked pattern | [`EXAMPLES.md`](EXAMPLES.md) |

## Workflow

1. **Classify the branch.** Identify whether you are mapping an existing system, designing from shaped parts, translating a whiteboard, or slicing/chunking an existing breadboard.
2. **Load the branch references.** Load every file named by the branch table before producing the breadboard. The root file is not enough context.
3. **Produce tables first.** Create the Places, UI Affordances, Code Affordances, and Data Stores tables described in `TABLES.md`. Diagrams come after tables, never instead of them.
4. **Trace wiring.** Follow navigation and data wires until each affordance's outgoing and return relationships are explicit.
5. **Verify the board.** Run the completion checks below and repair the tables before declaring the breadboard done.

## Completion checks

A breadboard is complete when:

- every Place has a clear interaction boundary;
- every UI and Code affordance has a stable ID and a concrete name;
- every `Wires Out` and `Returns To` target resolves to an existing affordance or Place;
- every UI affordance that displays data has a source;
- every navigation affordance connects to the Place it reaches;
- every side effect names the store or external system it changes;
- control flow and data flow are represented separately;
- optional Mermaid or visual output matches the tables rather than adding hidden truth.

## Core rule

Never rely on memory when mapping an existing system. Check the code, product, docs, or artifact that owns the fact, and mark uncertainty explicitly when the source cannot be checked.
