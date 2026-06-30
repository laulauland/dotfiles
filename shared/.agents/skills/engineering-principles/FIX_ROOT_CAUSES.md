# Fix Root Causes

When you debug, do not paper over the symptom. Trace the problem to its root cause and fix it there. If the bug lacks a reliable reproduction or needs a full hypothesis/instrumentation loop, use `DIAGNOSE_HARD_BUGS.md`.

Symptom fixes accumulate, and each one makes the system harder to reason about while the real bug stays. The first move is to reproduce, because a bug you cannot reproduce is a bug whose fix you cannot verify. Then ask why repeatedly until you reach the cause rather than the surface.

A root-cause pass is complete when the failure has a reproduction or a named reason one is unavailable, the causal chain reaches the earliest fixable cause you can change, the same shape has been searched for elsewhere, and the final proof exercises the original symptom.

Resist the guard that silences a crash. Adding a nil check or a default to stop an exception is a symptom fix when the real question is why the value was missing. In Effect this shows up as a `catchAll` or a swallowed error that buries a defect inside the failure channel. That channel is for expected, typed failures, not for muffling a bug. The distinction is in `coding-standards/ERROR_HANDLING.md`, which keeps defects and expected failures apart.

Fix the pattern, not the single instance. When you find the cause, search for the same shape elsewhere with `rg` and fix every occurrence, because the next one is already waiting. When you are stuck, instrument rather than guess. Add logging, read the actual error, and look at the real value instead of assuming it.

One pattern is worth naming on its own. When something fails only after a restart, suspect stale state before suspecting the code, because the code did not change between runs but the state did. Config files, caches, lock files, and serialized state are the usual culprits. If clearing a state file restores the behavior, the fix is to validate that state, not to patch around it. This pairs with `PROVE_IT_WORKS.md`, which is where you confirm the fix against a real reproduction.
