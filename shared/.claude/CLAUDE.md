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

## Dependencies

See if you can avoid dependencies, if you can't - don't modify package.json or Cargo.toml or such files directly instead resort to running CLI commands to add them.

In TypeScript projects always investigate which package manager is being used by checking the lock file:
- npm: package-lock.json
- yarn: yarn.lock
- pnpm: pnpm-lock.yaml
- bun: bun.lock

## Command Generation

- When generating commands that have ( or ) or other symbols - wrap the strings in ""

## Workflow Rules

- NEVER EVER EVER run a dev server in the session. ALWAYS ask the user to run it in a separate terminal window.

## Command Line Tools

- Use `fd` instead of `find`
- Use `rg` (ripgrep) instead of `grep`

## Writing Guidelines

- When instructed to write READMEs or PR descriptions keep language plain, straightforward, technical
- Avoid salesy and PMy adjectives like "comprehensive"
- If your bullet point list is becoming a 5 point list make it into a paragraph and really consider what's essential to extract into bulletpoints

## Workflow Guidelines

Unless told otherwise, ALWAYS use the code implementer subagent to implement changes that are approved after the plan mode. It is IMPORTANT to do this so that you save on context.

## Additional Guidelines

1. Avoid writing IIFEs unless explicitly instructed
