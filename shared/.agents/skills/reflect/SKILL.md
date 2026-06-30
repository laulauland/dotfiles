---
name: reflect
description: Capture what a finished task taught you so the next run does not relearn it. Use for "/reflect", "capture what we learned", "remember this for next time", or explicit requests to save a durable lesson. Routes the lesson into the memory system by default and escalates to a skill edit only when the lesson is a repeatable procedure.
---

# Reflect

Turn a just-finished task into a durable lesson. The default output is a memory entry, not a new skill. pstack's version of this authored SKILL.md files; that is the wrong default when a memory system already exists, because most lessons are facts about this user or this project, not procedures every future task should run.

## Decide what kind of lesson it is

Before writing anything, classify the lesson. This decides where it goes.

- A fact about the user, their stack, or a standing preference, or a piece of guidance they gave on how to work → a **memory entry**. This is almost always the case.
- A pointer to an external resource (a dashboard, a ticket, a doc) worth keeping → a **memory entry** of type `reference`.
- A repeatable *procedure* that any future task of this kind should follow, not a one-off fact → an **edit to the relevant skill**, after confirming with the user. Reaching for a skill edit is the exception; a single painful task is a fact to remember, not yet a procedure to encode.

If it is none of these — true only this once, derivable from the code or git history, or only relevant to the current conversation — do not write it. Say so and stop.

## Write the memory entry

Memories live in the memory directory the harness exposes. On Claude Code that is the per-project `memory/` directory named in the session context, with the `MEMORY.md` index. Follow the existing format exactly: one fact per file, frontmatter with `name`, `description`, and `metadata.type` (`user` | `feedback` | `project` | `reference`), then the body. For `feedback` and `project`, follow the fact with **Why:** and **How to apply:** lines. Link related memories with `[[their-name]]`.

Before saving, check for an existing file that already covers it and update that one rather than duplicating. After writing, add the one-line pointer to `MEMORY.md`.

Convert anything relative to absolute: a date, "the current sprint", "the repo we just touched". The memory is read in a future session with none of this context.

## Harness seam

The durable memory location is specific to whichever harness is driving. Write to the one that the running harness will load back in a later session. Do not invent a directory a harness never reads.

- **Claude Code** writes to the per-project `memory/` directory and the `MEMORY.md` index described above.
- **Pi** writes to `~/.pi/agent/memory/`. Use the same one-fact-per-file frontmatter format.

When a harness exposes no agent-writable memory store, do not force the lesson into a file that harness will not load back. Say that there is no durable home for it here, and write it only if the user points you at one.

## Escalating to a skill edit

When the lesson is genuinely a procedure — a sequence to follow, a check to always run, a trap to always avoid — propose the specific skill and the specific edit, and confirm before making it. Prefer `engineering-principles` for execution lessons and `coding-standards` for code-design lessons. Keep the edit to the part the skill does not already own. A procedure stated once and contradicted later is noise; require that it has actually recurred.

## Reply

State the lesson in one or two sentences, where it went (which memory file, or which skill), and why that home. If you declined to save, say what made it not worth keeping.
