---
name: ast-grep
description: AST-based code searching with ast-grep. Use when searching code by syntax structure rather than text patterns, finding specific code patterns, or refactoring.
---

# ast-grep

Use ast-grep to search code by syntax (AST), not text. Write patterns as valid code; use `$VARS` to match a single node and `$$$VARS` to match zero-or-more nodes.

## Basic Usage

```bash
# Set language with --lang (or let it infer)
ast-grep -p 'PATTERN' --lang LANG PATH

# Output JSON with --json for programmatic use
ast-grep -p 'PATTERN' --json compact .

# Add -A/-B/-C for context
ast-grep -p 'PATTERN' -C 2 .
```

## Pattern Syntax

| Pattern | Matches |
|---------|---------|
| `$VAR` | Single AST node |
| `$$$VARS` | Zero or more nodes |
| Literal code | Exact structure |

## Examples

### Find Function Calls

```bash
# Any function call in TypeScript
ast-grep -p '$F($$$ARGS)' --lang ts .

# Console logs with any arguments
ast-grep -p 'console.log($$$)' --lang js src/
```

### Find Patterns

```bash
# Re-used operand (same subexpression twice)
ast-grep -p '$A == $A' .

# If statements
ast-grep -p 'if ($COND) { $$$ }' --lang js .
```

### Imports

```bash
# Find imports
ast-grep -p 'import $S from $M' --lang ts .

# Narrow by node kind (extract subpart)
ast-grep -p 'import $S from $M' --selector import_clause --lang ts .
```

### Machine-Readable Output

```bash
ast-grep -p '$CALLEE($$$ARGS)' --lang ts --json compact .
```

## Common Use Cases

- Finding deprecated API usage
- Locating specific patterns for refactoring
- Auditing code for security issues
- Finding duplicate logic patterns
- Searching for React hooks usage
- Finding async/await patterns
