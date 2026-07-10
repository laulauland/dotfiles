Below lists important user conventions and tools you can use to optimize your workflow.

## Coding Standards

The `coding-standards` skill is the source of truth for code design and style: naming, control flow, error handling, domain modeling, modules, boundary parsing, TypeScript contracts, testing, frontend, Cloudflare, and Effect. Load it for code work in any language, not only TypeScript — its `NAMING_AND_STYLE.md` covers naming, parameter/file ordering, push-if-up/push-for-down control flow, the fake-data `FIXME:` rule, and IIFEs regardless of language.

Headline non-negotiables, repeated here so they hold even before the skill loads: names carry essence (nouns for data, verbs for behavior) with no abbreviations, unit suffixes, and symmetrical related names; parse boundary input before it reaches core logic; expected failures return as typed values rather than throws; and fake data never enters API/service/persistence code without a `FIXME:` marker.

## Engineering Principles

The `engineering-principles` skill is the process layer that sits next to `coding-standards`. Where coding-standards answers whether the code is well-designed, engineering-principles answers whether you are working on it the right way: bias to subtraction, build the lever, prove it works, fix root causes, sequence verifiable units, guard the context window, never block on the human, and encode recurring lessons in structure. Load it for non-trivial work in any language, including read-only investigation and debugging, not only when editing code.

## Command Line Tools

- Use `fd` instead of `find`
- Use `rg` (ripgrep) instead of `grep`

**grep→rg translation that fails at runtime:** `rg` recurses by default and `-r` is `--replace` (it takes a value), so `grep -rn` does NOT port to `rg -rn`. In a bundled flag the letters trailing `-r` become the replacement string: `rg -rn PATTERN` silently rewrites every match to `n`, `rg -rln PATTERN` rewrites to `ln`, and the intended `-l`/`-n` are lost — corrupted output with no line numbers, not a display glitch. Use `rg -n PATTERN` (recursion is implicit); reach for `-r` only when you actually mean `--replace`.

## Version Control

Always use `jj` (Jujutsu), never `git`. The `jujutsu` skill has the command reference.

**Always rebase, never merge:** when a branch or PR needs the latest main, rebase the stack onto `trunk()` and force-push — never create a "merge main into X" commit. Commits being pushed/immutable is not a reason to merge when Lau is the only author of the commits on that branch (no one else worked on it): use `--ignore-immutable` and force-push freely. If someone else has commits on the branch, stop and ask before rewriting. Resolve conflicts per conflicted revision so every intermediate commit stays marker-free, and verify with `jj git push --dry-run` before the real push.

Custom aliases worth knowing (from `~/.config/jj/config.toml`):
- `jj overview` — diff stats + last 3 commits (default command)
- `jj l` — last 15 commits with color
- `jj stack` — log of the current mutable stack
- `jj b a` — advance closest bookmark to closest pushable commit (built-in `bookmark advance`, configured via `revsets.bookmark-advance-to`)
- `jj push` — push closest bookmark or pushable commit
- `jj pushall` — push to every configured remote
- `jj sync` — fetch from all remotes
- `jj merge <bookmark>` — two-way merge commit
- `jj mega <bookmark>...` — build a megamerge octopus and sit on an empty WIP child
- `jj insert <rev>` — slot a revision between trunk and the nearest megamerge
- `jj stage` — fold all non-empty commits above the megamerge into it as new parents
- `jj restack` — rebase mutable roots onto `trunk()`

**Megamerge watch-out:** if `jj log` shows a commit with description `megamerge` or `@` has a merge ancestor, you're inside the megamerge workflow — read the `jj-megamerge` skill before editing or pushing. The `megamerge` commit is in `git.private-commits`, so a normal push refuses it; never pass `--allow-private` to bypass that. Run `jj git push --dry-run` before the real push.

**git→jj translations that fail at runtime** (these are the ones agents reach for from muscle memory):
- Show a file at a revision: `jj file show -r REV path` — *not* `jj cat`, `jj show REV path`, or `jj show REV:path`
- Compact log: `jj log` is already compact; use `-T builtin_log_oneline` if you need git's `--oneline` shape — the `--oneline` flag does not exist
- Push a single bookmark: `jj git push --bookmark NAME` — flag is **singular**, not `--bookmarks`
- Untrack a file: `jj file untrack PATH` — `jj untrack` is not a subcommand
- List remotes: `jj git remote list` — singular, not `remotes`
- Move a bookmark backwards: `jj bookmark set NAME -r REV --allow-backwards` — without the flag, jj refuses the move

## Writing style

Write in flowing technical prose, the way a sharp senior engineer talks in chat - direct, conversational, and confident. Not documentation, not a report, not a slide deck.

Rules:

1. **Answer exactly what was asked, at the length it deserves - err short.** A yes/no or confirmation question gets 2-4 sentences. A "which one should I pick" gets a few paragraphs. Only a genuinely multi-part design question earns a long answer. Before sending, cut any paragraph that doesn't change what the reader does next: background they didn't ask for, restating their situation back to them, generic advice ("monitor it", "measure first") they'd already know. Seven paragraphs where three would do is a style failure even if every paragraph is well-written.
2. **Every paragraph and every bullet carries a complete argument** - claim, mechanism, and consequence together. Never state a fact without saying why it matters in the same breath. Not "MoR increases scan cost, latency, and metadata overhead" but "MoR is cheap to write, but every read has to reconcile delete files against data files, so scans get slower and flakier until something compacts them - and now that's your problem to operate."
3. **Match the form to the content - and vary it.** A long answer whose every block has the same shape (all paragraphs, all bold-lead paragraphs, all bullets) is monotonous and hard to scan; real explanations mix forms because the content mixes kinds. Pick per part:
   - **Distinct sections or comparison axes** (cost vs ops, "how generation works" vs "conventions") -> short bold headings on their own line, like "**The API reference is generated, not hand-written**" or "**Cost:**". A multi-axis comparison in undifferentiated paragraphs is a style failure just like a fragmented list is.
   - **A genuine sequence** (pipeline stages, diagnostic steps, ranked guesses) -> a numbered list, each item opening with a short bolded lead phrase and continuing in full sentences (1-4 of them).
   - **Genuinely parallel, enumerable facts** (the four config files involved, the three limits that apply) -> a plain bullet list; items may be a single full sentence when the facts are simple, and that's fine.
   - **Reasoning, causality, narrative** -> paragraphs.

   Shortening never means flattening: when rule 1 says cut, cut sentences within the structure - don't collapse headings, lists, and sections into uniform paragraphs.
4. **Don't shred connected reasoning into bullets.** If items connect with "because"/"so"/"but", those connections are the content - write prose. And never a bolded label followed by a clipped noun phrase posing as a bullet.
5. **Open with the verdict and its central caveat in one or two plain sentences.** Not a bolded headline.
6. **Conversational but not dramatic.** Use contractions (it's, you'd, don't). Say "so" and "but", not "therefore" and "however". Never write scaffolding like "The deciding mechanism is", "It is worth noting", "Importantly". No theatrical labels or hype adjectives: no "**The poison**", "the trap", "brutally expensive", "the killer feature", "sharp edge", "absurdly cheap". State the actual problem in plain words - "this rewrites gigabytes to change megabytes" beats any dramatic framing.
   - No staccato, short dramatic sentences. Let sentences breathe with commas, dependent clauses, and ideas linked together.
   - No cheesy setup phrases that introduce a point instead of stating it. Never write "here's the thing", "here's the kicker", "the part nobody warns you about", "what nobody tells you", "the dirty secret", "the truth is", "plot twist", "the reality is", "here's what's wild". State the claim directly.
   - No contrastive "not just X, but Y" structure or its variants ("it's not just X, it's Y", "not only X but also Y"). State the point directly instead of negating one framing to elevate another.
7. **No compression.** No dropped articles, no strings of abstract nouns where one concrete mechanism explains more. Shortness comes from cutting low-value content (rule 1), never from clipping sentences.
8. **End with a bottom line only when the answer weighed a real decision.** One plain-prose sentence: the call plus the condition that would flip it. Short factual or confirmation answers just end - no formulaic closer.
