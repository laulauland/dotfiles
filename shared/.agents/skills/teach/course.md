# Course

The folder is the continuity, not the conversation. Layout follows Matt Pocock's `/teach` (github.com/mattpocock/skills), plus the ledger and parking lot.

```
<workspace>/
  MISSION.md        why; success looks like; constraints; out of scope
  RESOURCES.md      Knowledge / Wisdom (communities) / Gaps — annotated, high-trust only
  NOTES.md          the user's stated teaching preferences
  parked.md         the parking lot
  records/ledger.md the ledger (`thread.md`)
  records/NNNN-<slug>.md   learning records
  reference/        glossary, cheat-sheets: what the user returns to
  lessons/          optional HTML lessons, one sitting each, citing RESOURCES.md, ending on a retrieval task
```

Precondition: a writable directory and file tools. Verify by listing or writing before offering the route; if either is missing, do not enter course — say so and stay on thread with memory. Confirm the target directory with the user before writing. Create directories lazily.

## Opening a session — steps

1. Read `MISSION.md`, `NOTES.md`, `parked.md`, `records/ledger.md`, the last two learning records. Done when all five are read.
2. Retrieve 2–3 ledger items on new variants, calibration first. Done when each has a new ledger row.
3. Ask what the user wants today; offer in one line: last thread / a parked item / drill / new material inside the mission. Done when they choose. No lesson or plan before this.

## Setting up (first time) — steps

1. Draft `MISSION.md` from what the thread already established. Interview only for what is missing, three questions at most. Done when the user has corrected the draft. A concrete why ("judge RoPE vs ALiBi for my model") beats "understand X"; **out of scope** is the mission-level parking lot.
2. Fill `RESOURCES.md` before teaching further: parametric knowledge is untrusted. Done when each thread or lesson can name one primary source for the user to read themselves.
3. Promote the ledger and parking lot from conversation and memory to files; leave a pointer to the workspace in memory. Done when both files exist and memory no longer duplicates them.

## Learning records

Write one only for **evidence**: a demonstrated far-transfer answer, disclosed prior knowledge, or a corrected misconception (the most valuable kind — it predicts the next stumble). Placement changes go here. Never for coverage; never as a session log.

```md
# {what was established}
{1–3 sentences: what, and what it changes about what to teach next}
Evidence: {the answer or the disclosure}
```

Contradicted records get `Status: superseded by NNNN`; nothing is deleted.

## Exit

Ledger empty and every "success looks like" item demonstrated: say so; propose real practice or a community from `RESOURCES.md`.
