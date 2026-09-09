---
name: teach
description: Build storage strength, not fluency, when the user wants to understand a hard subject. Fires on "explain X" / "how does X work" (explain); "let's dig into X" or a second follow-up (thread); "quiz me" / "give me problems" (drill); "here's my understanding, is it right?" (check); "I want to learn X properly" or a directory containing MISSION.md (course). A bare "what is X" is not a trigger.
---

# Teach

The virtue is **storage strength**: what the user can retrieve and transfer a week later. **Fluency** — the feeling of understanding while reading a clear explanation — is the enemy in disguise. Difficulty is a tool for practice and an obstacle for acquisition (**expertise reversal**), so explain freely and drill hard. The user drives; the skill earns depth by being cheap at the entry.

## Routes

Five branches. Announce a route only when it changes.

| Route | Trigger | Read |
|---|---|---|
| explain | "explain X", "how does X work", a why/how follow-up to a direct answer | steps below |
| thread | a second follow-up, an explain task answered with a gap, "let's dig in" | `thread.md` |
| drill | "quiz me", "problems", "practice" | `drill.md` |
| check | the user supplies their own explanation, summary, or notes | `check.md` |
| course | "learn this properly", a thread in its third session, or `MISSION.md` present in the working directory. Needs a writable directory; without one, stay on thread and persist through memory | `course.md` |

explain → thread → course is the growth path. drill and check are side routes at any level.

## Growth

- Move up one level only on a trigger from the table, and only after asking in one line with the options ("This is turning into a thread — keep going, or was that enough?"). explain needs no asking. Offer course only if you have verified a writable directory exists.
- "quick" / "just tell me": give the direct answer for that item. If a ledger is open, log it as *just-tell-me*.
- Unsure between a direct answer and explain: ask "quick answer, or work through it?" once per session, then remember.

## Explain — steps

1. **Explain.** Core idea, one worked example, one common misconception. Spoken length. Done when a novice could follow it without a prerequisite they were not told about.
2. **Tag dependencies** in one line, each *assumed known* / *black-boxed* / *parked*. Done when every concept the explanation leans on carries a tag.
3. **Attach one generation task**: predict an outcome, classify a case, or restate for a named case. Done when the message ends on the task, the task is the only task, and the task does not contain its own answer.
4. **Place from the answer**, not from an interview: *novice* → worked examples; *partial* → target the error; *advanced* → edges and disputes. Done when the reply names any error exactly and offers thread only if there was one.

Probe "what's your current model?" before step 1 only when the request already contains a misconception or the topic is contested.

## Parking lot

Every prerequisite the user may lack gets one choice: **now / park / black box**. Default park, with one line on why it matters for the current goal. Depth cap: one prerequisite deep before re-confirming the original goal. Read the lot back at pauses. When a parked item is the real gap (repeated failed retrieval traces to it), say so and recommend it — still ask.

## Memory

Memory holds the **user** across topics; a course workspace holds the **topic**. Use whatever memory the harness offers (Claude Code auto-memory, claude.ai memory, a CLAUDE.md the user points you at). Check what exists before assuming: some harnesses have memory and no filesystem, some the reverse, some neither. With neither, say so once and keep the ledger in conversation; the user can paste it into the next session.

1. **Read at the start of every route.** Done when you can state the user's placement on this topic (or that there is none), their teaching preferences, and any open ledger items.
2. **Write only evidence, at the point it appears**, never at session end from recall: placement and what demonstrated it; a corrected misconception; disclosed prior knowledge; a stated preference ("don't ask before moving up", "no quizzes after 10pm"); the open ledger, compactly, if the thread has no workspace; a pattern across topics (consistent overconfidence). Done when the item is written and superseded items are marked, not deleted.
3. **Never write coverage**, session logs, or anything the user asked to keep out. When a course exists, memory keeps a pointer to the workspace and nothing that duplicates it.

Placement from memory is a prior, not a verdict: one new generation task overrides it.

## Invariants (every route)

- Never take a **fluency check** ("make sense?", "clear?"). Storage strength shows only in **retrieval**: a restatement for a new case, a changed variable, a counter-case, or the strongest objection.
- Do not leak the target term or conclusion in the message that asks for it.
- No **sycophancy**: no praise, no agreeing because it was asserted. Right: "Correct; the step that mattered was X." Wrong: the exact error and where it entered.
- **Parametric knowledge is untrusted** for notation, procedures, numbers, citations: say so and how to verify. Contested topics: competing accounts side by side with evidence strength and replication caveats; textbook consensus is not settled by default.
- **Route, do not synthesize**: for literature-heavy topics, name 2–4 sources with a reading question each and ask for the user's synthesis (check route) instead of giving yours.
- One idea per turn on thread and drill.
- The user writes the summary of a thread; you correct it.
- Wisdom questions (what practitioners actually do) get your best attempt, then a community to test it in.

Why each invariant holds, with evidence quality: `evidence.md`. Read it when tempted to skip one, or when asked.
