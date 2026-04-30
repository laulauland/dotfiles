---
name: bear-notes
description: Search, read, and manage Bear notes via Bear's official `bearcli`. Use when the user asks about their notes, wants to find information in Bear, create notes, or manage tags.
---

# Bear Notes Skill

This skill uses Bear 2.8+'s official CLI (`bearcli`), which ships inside the Bear app and reads/writes notes through Bear directly. No SQLite or x-callback-url shims.

## Binary Location

`bearcli` is bundled at `/Applications/Bear.app/Contents/MacOS/bearcli`.

If it isn't on `PATH`, fall back to the absolute path or suggest the user symlink it once:

```bash
sudo ln -sf /Applications/Bear.app/Contents/MacOS/bearcli /usr/local/bin/bearcli
```

(TestFlight installs may live under `/Applications/Bear: Markdown Notes.app/...`.)

## Output Format

Always pass `--format json` when parsing output. Defaults are TSV without a header.

JSON shapes:
- `list`, `search`, `search-in`, `tags list`, `pin list`, `attachments list` → `[{...}]` (empty: `[]`)
- `show`, `create` → `{...}`
- `cat` → `{"content":"..."}`
- mutating commands → `{"ok":true}`
- errors → `{"error":{"code":"...","message":"..."}}` (exit 1 business / 64 usage)

Field selection: `--fields id,title,tags` or `--fields all` (content excluded from `all`; use `all,content` to include).

Identify notes by ID (positional) or `--title` (case-insensitive). Encrypted notes are listable but not readable.

## Tagging Convention

Two axes: **topic tags** (existing tree) and **status tags** (dot-prefix). Default for fleeting capture is untagged.

**Status tags — only two:**
- `#.now` — actively in progress, regardless of artifact type (live meetings, drafts being written, snippets in active use). Drops off when the work goes cold.
- `#.ref` — evergreen / reusable: reference snippets, finished writing worth revisiting, lookup material.

The dot prefix sorts both to the top of Bear's sidebar. Don't introduce new status tags (no `#.draft`, `#.todo`, `#.log`, `#.grow`) — `#.now` covers all in-progress work.

**Topic tags:**
- **Always inspect first:** `bearcli tags list --format json` before tagging, so you reuse rather than duplicate.
- **Top-levels are stable:** `#work`, `#life`, `#blog`. Don't invent a new top-level without asking the user first — almost everything fits under one of these.
- **One level of nesting by default.** Two levels only when a sub-area already has internal clusters with real volume (e.g. `#work/ai/pavilion`). Three levels: no.
- **Subtag earns its keep at ~3 notes.** For one-offs, parent tag alone is fine. Don't pre-create a subtag for a single note.
- **Most specific tag wins, parent dropped.** Use `#work/ai` *or* `#work`, never both — Bear's nested filter already includes children when filtering by parent.
- **Names: lowercase, kebab-case** (`video-scripts`, not `Video Scripts`).
- Status + topic combine: a single note can carry one topic + one status (e.g. `#work/ai` + `#.now`).
- Legacy orphan tags exist (`#Symbol`, `#stream`, `#podcast`, `#research`, `#reads`, `#personal`, `#.log`, `#.grow`) — don't apply them on new notes; let them age out.

**When asked to create or modify notes:**
- Default for fleeting capture (random thought, quick meeting, throwaway): no tags.
- Topic clearly fits an existing tag: apply the most specific one (`#work/video-scripts`, not `#work`).
- User says "I'm working on this" / "this is for [active project]": add `#.now` alongside the topic tag.
- User says "save this for reference" / "I'll come back to this" / "snippet I'll reuse": add `#.ref` alongside the topic tag.
- Use `--tags ".now,work/ai"` (comma-separated, no `#`) on `bearcli create`.

**Inline `#thing` always becomes a tag.** Bear auto-tags any `#word` written into note content (including from `bearcli create --content`, `append`, `write`, `edit`). When *referring* to a tag inside note prose without applying it, escape just the hash in backticks: `` `#`now ``, `` `#`ref ``. Wrapping the whole token in backticks (`` `#now` ``) also prevents tagging. Use `--tags` to apply tags intentionally; never rely on inline `#tag` in body text unless that's the goal.

## Common Commands

### Read

```bash
bearcli search "@today @todo meeting" --format json
bearcli list --tag work --sort modified:desc -n 20 --format json
bearcli show <id> --fields all --format json
bearcli cat <id>                                 # raw content to stdout
bearcli cat --title "Mars" --offset 0 --limit 500
bearcli search-in <id> --string "TODO" --format json
```

Search syntax (inline operators, not flags):
- Text: `keyword`, `"exact phrase"`, `word1 or word2`
- Negation: prefix any term/directive with `-`
- Tags: `#tag`, `!#tag` (exact, no children), `#*/tag` (subtags only)
- Dates: `@today`, `@yesterday`, `@last7days`, `@date(YYYY-MM-DD)`, `@date(<2026-01-01)`
- Created: `@ctoday`, `@created7days`, `@cdate(...)`
- Tasks: `@todo` (has incomplete), `@done`, `@task`
- State: `@tagged`, `@untagged`, `@pinned`, `@locked`, `@empty`, `@untitled`
- Content: `@images`, `@files`, `@attachments`, `@code`, `@wikilinks`, `@backlinks`, `@ocr`
- Title-only text: `@title`

Full reference: https://bear.app/faq/how-to-search-notes-in-bear/

### Create / Modify

```bash
bearcli create "My Note" --content "Body text" --tags "work/ai,.now" --format json
printf "line1\nline2" | bearcli create "My Note" --fields id,hash --format json

bearcli append <id> --content "New paragraph" --format json
bearcli append --title "Mars" --content "Update" --position beginning

bearcli edit <id> --at "TODO" --replace "DONE" --format json
bearcli edit <id> --at "## Notes" --insert "\nNew line"
bearcli edit <id> --at "cat" --replace "dog" --all --word

bearcli write <id> --base <hash> --content "# Title\nBody" --format json
```

`edit`, `write`, `append`, and `create --content` interpret `\n \t \r \\` in arguments. Stdin is taken verbatim.

`write --base <hash>` (from `bearcli show --fields hash`) gives optimistic concurrency — the write fails if the note changed since the read.

When using `write`, preserve attachment markdown links and the first `# heading` / `#hashtags` (Bear derives title and tags from content).

### Tags

```bash
bearcli tags list --format json                       # all tags globally
bearcli tags list <id> --format json                  # tags on one note
bearcli tags add <id> "work/meetings" .now            # most specific topic + status
bearcli tags remove <id> .now                          # e.g. when work goes cold
bearcli tags rename old-name new-name                 # refuses if new exists; --force to merge
bearcli tags delete unused-tag
```

### Pins / Lifecycle / Open

```bash
bearcli pin list                                      # all pin contexts in use
bearcli pin add <id> global work                      # atomic; tags must exist
bearcli pin remove <id> global

bearcli trash <id>                                    # soft-delete
bearcli archive <id>
bearcli restore <id>

bearcli open <id> --header "Moons" --edit             # focuses Bear app
```

### Attachments

```bash
bearcli attachments list <id> --format json
cat photo.jpg | bearcli attachments add <id> --filename photo.jpg
bearcli attachments save <id> --filename photo.jpg > photo.jpg
bearcli attachments delete <id> --filename photo.jpg
```

## Tips

- Capture the ID from `create` (use `--fields id` or `--format json`) for follow-up edits.
- `--count` on list/search/search-in/tags-list returns `{"count":N}` instead of rows.
- Use `--no-update-modified` on `edit`/`write`/`append`/attachments mutations to preserve the modification date.
- Mutating commands print nothing on success in TSV; in JSON they emit `{"ok":true}`.
- For full reference: `bearcli help <subcommand>` or `bearcli help all`.
