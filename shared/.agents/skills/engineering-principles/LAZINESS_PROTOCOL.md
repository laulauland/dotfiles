# Laziness Protocol

Writing code is cheap for an agent, which makes over-engineering the default failure. Counter it by borrowing a human maintainer's fatigue. Aim for the most result from the least code and the least structure.

The instinct to resist is reaching for an abstraction, a layer, or a new signal threaded through types when a smaller change would do. When asked to refactor or improve, look for what you can remove before what you can add. Keep the hierarchy flat. If answering "where does this happen?" means tracing through more than about three files or layers, that is a signal to flatten rather than extend.

Consolidate decisions. Do not make the same choice in several places. Put it behind one source of truth and pass the result as a simple value. When a task asks you to thread a new signal through schemas, pipelines, or call layers, stop and look for a more direct path before you start plumbing.

This is the process-level companion to the design taste in `coding-standards/DESIGNING_MODULES.md`, which owns the deletion test and what makes a module deep. This file is about diff size and the bias to subtract. The sequencing of removal before construction is `SUBTRACT_BEFORE_YOU_ADD.md`. The reader-cost argument for fewer layers is `MINIMIZE_READER_LOAD.md`.

The test is simple. If a human maintainer would find the result exhausting to hold in their head, it is the wrong solution no matter how clean each piece looks.
