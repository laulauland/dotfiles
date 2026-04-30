Below lists important user conventions and tools you can use to optimize your workflow.

## Naming Conventions

1. Names must capture the essence of what a thing is or does
   - Use nouns for objects/data structures
   - Use verbs for functions/methods
   - Example: `UserProfile` (noun) for a class, `calculateTotal` (verb) for a function

2. Variable Naming Rules
   - No abbreviations except for primitive integers in sort/matrix operations
   - Use proper capitalization for acronyms (e.g., `VSRState`, not `VsrState`)
   - Use snake_case where specified by language convention
   - Use camelCase in TypeScript/JavaScript

3. Variable Qualifiers
   - Add units as suffixes
   - Order qualifiers by descending significance
   - Example: `latency_ms_max` not `max_latency_ms`

4. Symmetrical Naming
   - Related variables should have same character length when possible
   - Example: Use `source`/`target` instead of `src`/`dest`
   - Helper functions should be prefixed with parent function name
   - Example: `read_sector()` → `read_sector_callback()`

## Language Instructions

1. Basic Language Usage
   - Prefer declarative over imperative programming
   - Use functional programming principles when possible
   - Minimize side effects
   - Write pure functions where applicable

2. Error Handling
   - Prefer returning Result/Either types over throwing exceptions
   - Always handle potential error cases
   - Use typed error handling mechanisms
   - Log errors with sufficient context

3. Code Modularity
   - Keep functions small and focused (single responsibility)
   - Prefer composition over inheritance
   - Design for extensibility
   - Use dependency injection for better testability

4. Performance Considerations
   - Be mindful of time and space complexity
   - Avoid unnecessary allocations
   - Use appropriate data structures
   - Profile and optimize critical paths

5. Immutability
   - Prefer immutable data structures
   - Use const by default
   - Create new objects/arrays instead of mutating existing ones
   - Use immutable update patterns

## Code Structure

1. Function Organization
   - Callbacks must be last in parameter lists
   - Main function goes first in file
   - Important code belongs near the top
   - Use alphabetical ordering when no clear ordering exists

2. Control Flow Rules ("Push If Up, Push For Down")
   - Move conditional checks to caller functions when possible
   - Batch operations should be the default, not loops over individual items
   - Example:
     ```typescript
     // Preferred:
     if (condition) {
       processBatch(items);
     }
     
     // Avoid:
     items.forEach(item => {
       if (condition) {
         process(item);
       }
     });
     ```

3. File organization
   - Unless specifically requested: write all the code in one file
   - If the implementation demands different files, be careful and intentional about creating them

## Documentation Requirements

- Add comments ONLY for complex logic that isn't self-documenting
- Document public interfaces and APIs
- Example:
```typescript
// Complex algorithm explanation
function complexCalculation(): number {
  // Using Smith-Waterman algorithm for sequence alignment
  // with O(n*m) time complexity
  ...
}
```

## Common Pitfalls to Avoid

1. Fake data
   - A rule of thumb: totally fine in direct UI code, avoid in the API calls
   - If you can't avoid it in API calls - make sure to ALWAYS add a FIXME: comment with fake data so i can quickly find it

2. Performance
   - Pay attention to time complexity (O(n)) perfomance
   - Avoid using spread object operator (...) in accumulators

## Command Line Tools

- Use `fd` instead of `find`
- Use `rg` (ripgrep) instead of `grep`

## Version Control

Always use `jj` (Jujutsu), never `git`. The `jujutsu` skill has the command reference.

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

## Additional Guidelines

1. Avoid writing IIFEs unless explicitly instructed
