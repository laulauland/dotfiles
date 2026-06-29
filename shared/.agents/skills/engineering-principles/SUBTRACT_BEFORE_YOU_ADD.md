# Subtract Before You Add

When you change a system, remove what is dead or redundant first, then build on the simpler base. Deletion shrinks the surface area, exposes the real structure, and usually makes the next addition obvious and small.

Adding to a complex system compounds the complexity, so the order matters. Cut to the minimum before you invest in polishing, because polishing code you are about to delete is wasted effort, and a smaller base is cheaper to get right.

Design for the usage you actually observe, not for speculative edge cases. Every out-of-spec feature drags its own guards behind it. Persistence needs a parser to defend its inputs, retry-on-startup needs idempotency, a second code path needs a validator. This is the same reason your coding standards refuse backwards-compatibility, migration, and backfill scaffolding unless you ask for them. Those are additions that each pull in defensive weight, so do not add them speculatively. See the non-negotiables in `coding-standards/SKILL.md` on treating a new design as the target state rather than a migration plan.

When a reference, a wrapper, or a config layer carries no content of its own, delete it rather than leaving a stub. This is the sequencing rule behind `LAZINESS_PROTOCOL.md`, and it runs before `FOUNDATIONAL_THINKING.md`. Remove dead weight first, then lay the foundation.
