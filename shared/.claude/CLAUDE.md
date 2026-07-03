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

## Writing Guidelines

- When instructed to write READMEs or PR descriptions keep language plain, straightforward, technical
- Avoid salesy and PMy adjectives like "comprehensive"
- If your bullet point list is becoming a 5 point list make it into a paragraph and really consider what's essential to extract into bulletpoints
