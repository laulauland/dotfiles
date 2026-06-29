# Sequence Work into Verifiable Units

Order work as a sequence of small units, each ending in a state you can check, and do not advance until the current one is green. The discipline runs at two altitudes, how you execute the work and how you deliver it.

A break caught at the unit that caused it is cheap to find. A break caught after a batch is buried, and you have already built further on top of it. Sequencing the same units into a delivery a reviewer can replay turns "trust me" into "watch it go red, then green."

For **execution**, in a sweep, a migration, or any run of similar edits, verify each change before you start the next. Do not batch the edits and check once at the end. Each unit is a bracket of known-good state, one change, run the check, then proceed. Rebase onto clean trunk first so every check measures against the real baseline. When a lever does the edits, the per-unit check is nearly free, so run it anyway.

For **delivery**, stack the commits in the order that proves the work. With `jj` this is natural, since each change is its own revision you can reorder and rebase freely. The canonical shape is the failing test first, then the fix on top. The first revision shows the bug is real, and the next shows it resolved, so a reviewer sees both the problem and the proof. Other useful orders are a subtraction before a reshape, a baseline capture before the treatment, the scaffold before the feature. Each revision should stand on its own, and the stack should read as an argument. Your `jj-plan` and `jujutsu` skills own the mechanics of shaping that stack.

This is the sequencing companion to `PROVE_IT_WORKS.md`, which keeps each check real, and `BUILD_THE_LEVER.md`, which makes the per-unit check cheap.
