---
name: engineering-principles
description: Execution and process principles for non-trivial engineering work, covering how to scope, sequence, delegate, and verify, independent of language or harness. Use when planning a change, sizing a diff, debugging, driving a long autonomous run, or deciding what "done" means. This is the process layer; code-design taste lives in the coding-standards skill.
---

# Engineering Principles

These are execution principles: how to drive a piece of work from request to verified result. They are orthogonal to code-design taste. When a decision is about naming, types, modules, parsing, errors, or tests, that is the `coding-standards` skill, and these files defer to it rather than restating it.

Each principle is one file with one idea. Read the leaf in full when it applies; this index is only the router. They are referenced by name, not invoked as commands, and they apply the same whichever harness is driving (Claude, Pi, Codex, Cursor).

## How this relates to coding-standards

`coding-standards` answers "is this code well-designed?" These principles answer "am I working on it the right way?" Where they touch the same ground, the principle points at the standard:

- Verification of a finished task lives here (`PROVE_IT_WORKS.md`); what a good test looks like lives in `coding-standards/TESTING_AND_VERIFICATION.md`.
- Diff size and deletion bias live here; module and interface design lives in `coding-standards/DESIGNING_MODULES.md`.
- Target-state-not-migration sequencing lives here; the no-backwards-compat design rule lives in `coding-standards`'s non-negotiables.

If a leaf ever duplicates a standard, cut the leaf down to the part the standard does not own.

## Principles

Read the matching leaf before applying it.

| When you are... | Read... |
|---|---|
| Refactoring, sizing a diff, or tempted to add a layer or thread a new signal through types | `LAZINESS_PROTOCOL.md` |
| Sequencing an addition or rewrite and there is dead weight to remove first | `SUBTRACT_BEFORE_YOU_ADD.md` |
| Reviewing code that is hard to trace; counting layers, hidden state, one-caller wrappers | `MINIMIZE_READER_LOAD.md` |
| Doing any non-trivial or repeated work that a script, codemod, or generator could do and prove | `BUILD_THE_LEVER.md` |
| Finishing a task and about to declare it done | `PROVE_IT_WORKS.md` |
| Debugging a symptom and tempted to patch where it surfaced | `FIX_ROOT_CAUSES.md` |
| Diagnosing a hard bug or performance regression without a reliable reproduction | `DIAGNOSE_HARD_BUGS.md` |
| Stacking commits or PRs across a sweep or migration | `SEQUENCE_VERIFIABLE_UNITS.md` |
| Context is filling with large outputs, long files, or fan-out planning | `GUARD_THE_CONTEXT_WINDOW.md` |
| Tempted to ask "should I do X?" on reversible work | `NEVER_BLOCK_ON_THE_HUMAN.md` |
| Facing a novel decision with no precedent in the codebase | `EXHAUST_THE_DESIGN_SPACE.md` |
| About to write logic before settling the core data shapes | `FOUNDATIONAL_THINKING.md` |
| Catching yourself writing the same instruction a second time | `ENCODE_LESSONS_IN_STRUCTURE.md` |

Every principle in the table has its leaf file.
