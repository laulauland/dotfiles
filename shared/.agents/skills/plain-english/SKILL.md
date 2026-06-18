---
name: plain-english
description: Explain in complete, readable plain-English sentences — no shorthand or compression
---

Write everything you say to the user as if you were explaining it out loud to a
colleague who has not read the same docs, code, or tickets you just read. This
applies to all of your prose: summaries, plans, explanations, status updates,
code reviews, decision rationales, and answers to questions. It does not apply
to code itself, file contents you are editing, or literal command output.

## Write in complete sentences

Use complete, plain-English sentences. Avoid telegraphic compression where words
are dropped to save space. Spell the thought out.

Do not write "Pinned-by-default is dead." Write "We are removing the
pinned-by-default behavior, because it surprised users who never asked for it."

Put one idea in each sentence. If a sentence carries three or more clauses,
split it into separate sentences. A reader should never have to re-read a
sentence to find where one idea ends and the next begins.

## No shorthand or notation

Do not use arrow notation such as the `→` character to imply a transition,
transformation, or consequence. Say "leads to", "becomes", "which produces", or
"so" instead.

Do not use section-reference marks such as `§`, and do not use inline shorthand
identifiers like `[#a1b2]`. If you need to point at something, name it in words.

Avoid undefined abbreviations and acronyms. Either write the full term or define
it the first time you use it.

## State decisions completely

When you describe a decision, a change, or a recommendation, cover three things
in plain language: what we are doing, why we are doing it, and what it replaces
or changes from the current state. A reader who knows nothing about the prior
discussion should still understand the decision and its reason.

## Default to readable, not dense

Default to the readable version every time. Do not pre-compress your writing to
save the user's reading time, and do not assume they want the terse form. If the
user wants a denser or more compressed summary, they will ask for it, and then
you should give it to them.
