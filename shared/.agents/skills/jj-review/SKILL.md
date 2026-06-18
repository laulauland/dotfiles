---
name: jj-review
description: Record and manage code-review findings as durable, threaded comments anchored to file:line in a jj (Jujutsu) repository, using the jj-review CLI. Use when reviewing code in a jj repo and you want to leave review comments, reply to or resolve threads, query open comments as JSON, or track review rounds (baselines and interdiffs) instead of leaving findings only in chat.
---

jj-review attaches code-review comments to file locations inside a jj repository. Comments live in an append-only JSONL store at `.jj/review` (auto-discovered by walking up for `.jj/`), survive edits to the underlying code via re-anchoring, thread into replies, and group into review rounds. Use it whenever review findings should persist and be queryable rather than living only in a chat transcript.

All interaction is through the `jj-review` CLI (on `$PATH` after install, or `zig-out/bin/jj-review` when built from source). Never edit the JSONL store directly — every mutation goes through the CLI so validation and re-anchoring run.

## When to use

- Reviewing a diff, change, or PR in a jj repo and recording findings against specific lines.
- Replying to, resolving, reopening, or deleting existing review threads.
- Reading back open comments (e.g. `--format json`) to drive follow-up work or summaries.
- Managing review rounds: baselining the current state with `done`, then `diff` to see what changed since.

If you just want to discuss code in passing, plain chat is fine — reach for jj-review when the findings should outlive the conversation.

## Core review workflow

1. Add a finding per issue, anchored to the line or range, with tags for severity/category:
   ```sh
   jj-review add src/main.zig:42 "Missing baseline check before recordDone"
   jj-review add src/main.zig:42-48 --tag bug --tag api "This block leaks the arena on the error path"
   ```
2. Use a general comment (no file/line) for cross-cutting notes:
   ```sh
   jj-review add "Review rounds need clearer UX overall"
   ```
3. Thread discussion onto an existing comment by id:
   ```sh
   jj-review add --parent cmt-1780328406089-11 "Agreed — fixed in the latest revision"
   ```
4. Read back what's open, as machine-readable JSON, to plan fixes or summarize:
   ```sh
   jj-review status --format json
   jj-review list --tag bug --open --format json
   ```
5. As issues get addressed, resolve (or reopen / delete) by id:
   ```sh
   jj-review resolve cmt-1780328406089-11
   ```
6. When a round of review is complete, baseline it, then diff later to see what the author changed:
   ```sh
   jj-review done            # records a baseline at @, starts a new round
   jj-review diff            # interdiff of changes since that baseline
   ```

## Command reference

Exact flags as accepted by the CLI. Output formats are `text` (default), `json`, `markdown`, and `qf` (quickfix); `qf` applies only to the comment-producing commands (`add`, `edit`, `resolve`, `reopen`, `delete`, `status`, `list`).

| Command | Usage |
|---|---|
| `add` | `add [--file PATH --line N [--end-line M] \| PATH:N[-M]] [--parent ID] [--change-id ID] [--tag TAG]... [--editor] [--batch FILE\|-] [--format ...] <text>` |
| `edit` | `edit [--editor] [--format ...] <comment-id> [text]` |
| `resolve` | `resolve [--format ...] <comment-id>` |
| `reopen` | `reopen [--format ...] <comment-id>` |
| `delete` | `delete [--format ...] <comment-id>` (soft-delete) |
| `status` | `status [--file PATH] [--change-id ID] [--round N] [--author-type human\|agent] [--all] [--format ...]` |
| `list` | `list [--id ID] [--file PATH] [--author NAME] [--author-type human\|agent] [--change-id ID] [--parent ID] [--round N] [--tag TAG]... [--open] [--include-resolved] [--include-deleted] [--format ...]` |
| `diff` | `diff [--from REVSET] [--to REVSET] [--mode auto\|diff\|interdiff]` |
| `done` | `done [--revision REVSET] [--force] [--format text\|json\|markdown]` |
| `log` | `log [--format text\|json\|markdown]` — raw append-only entries |
| `sync` | `sync [--format text\|json\|markdown]` — dispatch the configured backend sync |

Notes:
- **Location syntax**: either positional `PATH:LINE` / `PATH:LINE-END`, or the explicit `--file`/`--line`/`--end-line` flags. Omitting a location makes the comment *general*. Paths are normalized to repo-relative on write, so absolute or relative paths both work.
- **`status` vs `list`**: `status` is the quick "what's open right now" view (defaults to open comments; `--all` includes resolved/deleted). `list` is the general query with AND-combined filters, tag matching, and explicit `--open` / `--include-resolved` / `--include-deleted` controls.
- **`--editor`** (on `add`/`edit`) opens `$EDITOR` for the body. As an agent, pass the text inline instead — don't rely on `--editor`.
- **`--batch FILE|-`** reads TSV: `PATH:LINE[-END]<TAB>TEXT` or `PATH:LINE[-END]<TAB>tag1,tag2<TAB>TEXT`. Use `-` for stdin. Good for posting many findings at once.

## Reading comments back

`status` and `list` with `--format json` return an object: `repo_root`, `store_path`, `baseline_count`, `current_round`, `count`, and a `comments` array. Each comment carries:

`id`, `parent_id`, `root_id`, `file`, `line`, `end_line`, `original_line`, `original_end_line`, `text`, `author`, `author_type` (`human` | `agent`), `change_id`, `tags`, `created_ms`, `updated_ms`, `resolved`, `deleted`, `round`, and `anchor_state` (`exact` | `context` | `fuzzy` | `orphaned`) plus `anchor_before` / `anchor_text` / `anchor_after`.

Parse this rather than scraping the text format. `--format qf` gives quickfix lines (`file:line:col: message`) for editor consumption. `anchor_state` other than `exact` means the code moved since the comment was written — `line`/`end_line` are the re-anchored positions, `original_line`/`original_end_line` the originals.

## Review rounds

`done` records a baseline at `@` (override with `--revision REVSET`) and bumps the round counter. It **refuses if open comments remain** — resolve them first, or pass `--force`. `diff` then compares the latest baseline (or `--from`) against `@` (or `--to`); in the default `auto` mode it shows a `jj interdiff` when a baseline exists and a plain `jj diff` otherwise. Use rounds to separate "first pass" findings from "after the author's fixes" so each `--round N` query is scoped to one pass.

## Author tagging

The author is resolved automatically: `jj config get user.name`, then `git config user.name`, then the jj/git email, then `$USER`. `author_type` is derived at read time — `agent` if the author is listed in the repo's `agent_authors` config or the name contains `bot`/`agent`/`copilot`, otherwise `human`. There is no per-comment `--author` override on `add` (`--author`/`--author-type` exist only as *filters* on `list`/`status`). So if you want your review comments distinguishable as agent-authored, either rely on the repo configuring `agent_authors`, or tag them explicitly (e.g. `--tag agent-review`).

## Gotchas

- The store is append-only: `edit`/`resolve`/`delete` add new entries; comments are materialized by replaying the log. `delete` is a soft-delete (filtered out unless `--include-deleted`).
- Comment ids look like `cmt-<timestamp>-<index>`. Get them from `add` output or a `list`/`status` query; don't fabricate them.
- All commands operate on the repo discovered from the current directory — run them from inside the jj repo.
- The Neovim plugin (`:JJReview`) is a separate front-end over this same CLI; CLI changes are immediately visible there after a refresh.
