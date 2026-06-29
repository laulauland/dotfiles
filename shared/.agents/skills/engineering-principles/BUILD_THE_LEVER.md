# Build the Lever

When the work is not trivial, build the tool that does it instead of doing it by hand.

There are two payoffs. The first is throughput, because a codemod, generator, or script does the work the same way every time and reruns for free. The second is confidence, because the tool is a single artifact a reviewer can read and rerun to check the work. Hand-done changes can only be re-verified by redoing them. A deterministic script turns "trust me" into "run this."

Do the first unit by hand to learn the recipe, then build the lever and rerun it on that same unit, diffing against your hand-done version to prove it matches. Make the lever safe to rerun, because a reviewer will rerun it. For edits, that is a codemod or a script, and `ast-grep` is the structural-search tool already in your kit for this. For analysis, it is a query over dumped data. For verification, it is a rerunnable check, which is `PROVE_IT_WORKS.md` applied to the proof itself.

A deterministic lever beats fanning out. If one pass can process every unit, run it yourself rather than spawning subagents to hand-apply what a script could do. When you do fan work out to subagents, write the lever as a skill they all read, so every delegate inherits the same hardened recipe and the same do-not-touch fences instead of drifting from per-prompt instructions. Keep that skill outside the delegates' write scope so they cannot quietly edit the contract.

The bar is triviality, not repetition. A one-off still earns a lever when the lever is what makes the work checkable. Per `LAZINESS_PROTOCOL.md`, build the smallest script that does or proves the job, never a framework. When the lever encodes a rule that should outlive this task, that is `ENCODE_LESSONS_IN_STRUCTURE.md`. Commit the lever when the work outlives the session, so the next run reruns it instead of redoing it.
