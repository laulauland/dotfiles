# Prove It Works

Verify a finished task against the real artifact. Do not infer doneness from a proxy: not "it typechecks", not "the build passed", not a subagent's summary, not a file that looks newer than it did before.

This is about proving a task is actually done. It is not about test design. For what a good test looks like, what a real seam is, and how much evidence a change needs, read `coding-standards/TESTING_AND_VERIFICATION.md`. This file is the step where you stop and check that the thing in front of you behaves.

## Why

Unverified work has unknown correctness, and the cheap signals are the ones that lie. In an Effect codebase "it compiles" is especially seductive: the types line up while the effect is never run, the layer is never provided, the failure channel is never exercised. Acting on a wrong inference costs more than the check would have.

## The check

After completing any task, ask "how do I prove this works?" and then look at the real thing.

- Run the actual path. Build is necessary, not sufficient. Execute the effect, hit the endpoint, render the component, follow data from input to output. For an Effect program that means providing the real (or real-seam) layer and running it, not reading the types.
- Read the real value, not a derived or cached representation of it. Check process liveness directly, not through some downstream artifact that happens to exist.
- Exercise the failure channel you claimed to handle, not only the happy path. A typed error you never triggered is a guess.
- When verification itself fails, suspect your observation method before you suspect the system.

## Trust artifacts, not self-reports

When work was delegated — a subagent, an operator agent, a herdr fan-out, another harness's run — inspect the output, not the summary. Read the `jj` diff, read the file, run the behavior. Agents report what they intended, which is not always what happened. This holds across harnesses: a Pi or Codex run that says "done" gets the same diff-level check a Claude run does.

## Script the check when you can

The strongest proof is a deterministic check a reviewer can rerun, not a one-time eyeball. This is `BUILD_THE_LEVER.md` applied to verification: write the script that exercises the path, keep its output, and the proof survives the session. A glance proves it once; a script proves it every time.

Keep the check visible. Commit it only when the trail has to be auditable later, such as a large migration or port. Most work just needs the check run and shown, not committed.

## Rejected framings

- **"It compiles, so it works."** Compilation proves shape, not behavior. The effect still has to run.
- **"The agent said it was done."** That is an intention, not an artifact. Read the diff.
- **"I checked the mtime / the output looked fresh."** A proxy for the value is not the value.
- **"Re-running it is overkill."** A rerunnable check is the difference between "trust me" and "run this."
