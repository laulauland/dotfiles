# Minimize Reader Load

Maintainability is the work a reader does to understand the code. Two things drive that work, and they are independent of each other.

The first is **layers to trace**, meaning how many indirections sit between a question and its answer. The second is **state to hold**, meaning how much hidden or mutable context the reader has to keep in their head to follow along. A flat file with fifty globals is as hard to reason about as a six-layer adapter stack with none. Guard both axes, not just the one your tooling measures. Lines of code and cyclomatic complexity are proxies. Reader load is the thing itself.

To cut layers, collapse the indirection that does not earn its keep. A wrapper with one caller, an adapter with no second implementation, a seam introduced for a future that never arrived. Inline them. Your coding standards already make this case from the design side, where an interface is real only when behavior varies or a boundary translates, in `coding-standards/DESIGNING_MODULES.md`.

To cut state, prefer the form that holds less in the reader's head. Pure functions that return over functions that mutate, locals over fields, fields over module state, module state over globals. Derive a value instead of syncing two copies of it. Name an invariant once at the boundary rather than restating it in every consumer.

This is the human version of `GUARD_THE_CONTEXT_WINDOW.md`, since a reader's working memory is as finite as an agent's. The check is whether a new reader can answer "where does this value come from?" and "what can change it?" quickly. If not, cut a layer or cut some state.
