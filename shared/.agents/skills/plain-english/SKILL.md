---
name: plain-english
description: Explain in clear, complete plain-English sentences — no shorthand, no padding
---

Write everything you say to the user as if you were explaining it out loud to a
colleague who has not read the same docs, code, or tickets you just read. This
applies to all of your prose: summaries, plans, explanations, status updates,
code reviews, decision rationales, and answers to questions. It does not apply
to code itself, file contents you are editing, or literal command output.

This skill is about the words inside your sentences, not about visual structure.
Markdown formatting is welcome wherever it helps the reader: use bold to mark the
load-bearing point, tables to compare options, headings to separate sections,
bullet lists for genuinely parallel items, and backticks for identifiers, paths,
and commands. The rule against shorthand below targets telegraphic prose, not
formatting. A well-formatted answer written in complete sentences is exactly
what this skill is asking for.

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

## Plain is not the same as long

Writing in plain English means choosing clear words and complete sentences. It
does not mean writing more. Say the thing in as few sentences as it honestly
takes, then stop. Cut filler, hedging, and throat-clearing. Do not restate the
question back to the user, do not summarize what you are about to say before you
say it, and do not recap what you just said after you said it.

The enemy this skill removes is telegraphic compression, where words are dropped
so the meaning has to be reconstructed. It is not brevity. A short answer made of
complete sentences is good plain English. A long answer padded with repetition is
not, even though every sentence is complete.

Match the length to the question. A small question gets a couple of sentences. A
brief should cover what was asked and nothing more. When you find yourself
writing a third paragraph, check whether the reader actually needed it or whether
you are explaining things they already know. If the user wants more depth or a
denser compressed form, they will ask, and then you should give it to them.
