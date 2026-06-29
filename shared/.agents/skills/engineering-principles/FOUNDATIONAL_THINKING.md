# Foundational Thinking

Get the data shapes right before you write the logic that runs over them, because the right shape makes the downstream code obvious and the wrong shape makes it a fight. Structural decisions protect option value, and the cost of changing them grows over time. A data-structure change made early is often a one-line diff. The same change made late is a rewrite.

Define the core types early and trace every access pattern before you settle them, so the structure matches the paths that actually dominate. How to model those types well, making illegal states unrepresentable and parsing at the boundary, is owned by `coding-standards/DOMAIN_MODELING.md` and `coding-standards/BOUNDARIES_AND_PARSING.md`. This principle is about doing that thinking first, before the logic, not about the modeling rules themselves.

At the code level, keep the structure and the data models converging, but do not DRY every line. Three similar statements still beat a premature abstraction, and explicit still beats clever. Before sharing state between concurrent actors, ask what happens if another actor changes it at the same time. If the answer is not "nothing," isolate it, which is the same instinct as the standards' bias toward immutability and owned state.

Sequence for option value. If something helps every later phase, do it first. Shared types, test infrastructure, and CI are scaffold, and scaffold goes before features the same way tests go before fixes. One ordering rule sits above this. Subtraction comes before scaffolding, so remove the dead weight named in `SUBTRACT_BEFORE_YOU_ADD.md` first, then lay the foundation on the simpler base.
