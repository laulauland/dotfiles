# Exhaust the Design Space

When a decision is novel and has no precedent in the codebase, build two or three concrete alternatives and compare them before you commit. Building the wrong thing costs more than sketching a few options.

This applies when the right answer is not obvious from the constraints. A new interaction with no prior art, an architectural choice with several viable shapes, a design whose quality depends on how it feels rather than on logic. In those cases a side-by-side comparison of real sketches decides better than reasoning in the abstract. The `arena` tool is the mechanism for this when you want several parallel attempts you can then cherry-pick from.

It does not apply when the pattern is already established, when a bug fix or refactor has a clear target state, or when the constraints leave only one viable path. Forcing three prototypes there is wasted motion, which `LAZINESS_PROTOCOL.md` would reject.

This connects to `NEVER_BLOCK_ON_THE_HUMAN.md`. An empirical fork is not the human's to answer when you could build the alternatives and let the result decide. Sketch them, look, then choose.
