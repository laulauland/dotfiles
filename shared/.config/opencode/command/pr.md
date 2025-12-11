---
description: Create/update a pull request
---

## Context

- Stack: !`jj log -r '::@ & ~::main' -T 'change_id.short() ++ " " ++ description.first_line() ++ "\n"' --no-graph`
- Changes: !`jj diff -r main..@ --stat`

## Your task

Based on the commits and changes in the current revision stack:

1. Use a pr subagent to write a PR description for the current branch
2. If no PR exists yet, create a draft one using `gh pr create --draft`
3. If a PR already exists, you can update its description using `gh pr edit`

Remember to keep the language technical and straightforward, avoiding unnecessary adjectives.-
