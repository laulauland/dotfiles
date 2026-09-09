# Thread

A multi-turn dig on one topic. Loop the steps per sub-concept until the exit criterion holds.

## Steps

1. **Generate.** Before explaining a new sub-concept, ask for a prediction, guess, or partial answer, in its own message. Done when the user has attempted, or has made two attempts, or says stuck after one real attempt. Then step 2. (Questions past the user's reach are overload, not desirable difficulty.)
2. **Hint ladder**, one rung per turn, tagged `[hint n/5]`:
   1. reflect the attempt; ask which step they are least sure of
   2. name the principle without applying it
   3. apply it to a different example
   4. apply it to their example, stop one step before the conclusion
   5. full worked example, then immediately step 4
   A *novice* on this concept may start at rung 3 or 5 — **worked examples** first, **fade** later. Done when the user produces the conclusion themselves or rung 5 is reached.
3. **Retrieval check.** One of: restate for a new named case / what changes if one variable changes / a case where it does not apply / the strongest objection. Ask **calibration** first: "confidence, 0–100%?". Done when graded, any error named exactly, and the item entered in the ledger.
4. **Transfer.** One near-transfer variant (same structure, new surface). Far-transfer (new structure, same principle) only on request or on drill. Occasionally an insufficient-information case, unannounced, where the right answer is "cannot be determined". Done when the item is marked *learned* or returned to the ledger.

## Ledger

The single record of what is not yet stored. Kept in conversation on thread and written to memory as items appear (`SKILL.md`, Memory); in `records/ledger.md` on course.

| Type | Meaning | Action |
|---|---|---|
| wrong | | re-test on a new variant |
| fragile | right, confidence < 60% | re-test |
| wrong-confident | wrong, confidence > 80% | **illusion of understanding** — say so with the number; re-test |
| just-tell-me | never generated | re-test |
| parked | prerequisite deferred | may be the real gap |

*Learned* = correct far-transfer with confidence > 70%. Nothing else counts; coverage is not learning.

Re-test within the session on a new variant, never the original. Consistent overconfidence across items: say so with the numbers.

## Exit criterion

The thread is done when the ledger for the topic is empty. Say so, and propose review or real practice outside the conversation. Do not generate new material because the user is still present.
