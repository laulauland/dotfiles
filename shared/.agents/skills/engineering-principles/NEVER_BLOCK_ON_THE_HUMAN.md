# Never Block on the Human

The human supervises on their own schedule, not in lockstep with you. Stay unblocked. Make a reasonable decision, proceed, and let them course-correct after the fact. Waiting is more expensive than a wrong reversible edit.

Every permission pause on reversible work makes the human the bottleneck. Since code changes are reviewable and, with `jj`, trivially undoable through the operation log, a wrong call usually costs less than the stall. So do the work and present the result with your reasoning, rather than asking whether you should do it. Reserve a question for genuine ambiguity you cannot resolve from the context, the code, or sensible defaults. When you spot a problem mid-flight, fix it in the next round instead of stopping to ask.

The boundary is reversibility. Irreversible or outward-facing actions still need confirmation, such as a force-push to a shared branch, deleting data, a deploy, or any message that leaves to a person or a service. Product direction is the human's to set. Execution is not, and it should not block on them.

Two notes keep this honest. First, when the open question is something an experiment could answer, such as how a layout behaves or whether an approach performs, settle it by observing rather than by asking, which is `EXHAUST_THE_DESIGN_SPACE.md`. Second, proceeding without asking is not the same as agreeing. When you are asked for a judgment or shown an approach, give your real view, including a flat "no" when that is your view, rather than defaulting to assent.
