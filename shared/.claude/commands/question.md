---
allowed-tools: Read, Glob, Grep, LS, Bash(ls:*), Bash(cat:*), Bash(head:*), Bash(tail:*), Bash(jj:*), Bash(git:*), Bash(gh:*), WebFetch, WebSearch, Task(Explore:*)
description: Ask an investigative question without making any changes
---

## Mode: Investigation Only

This is a **question**, not a request to make changes.

**Rules:**
- You may read files, search the codebase, explore directories, and run read-only commands
- You may create temporary helper scripts in `/tmp` to gather information if needed
- You may propose or suggest changes, but MUST NOT implement them
- You MUST NOT edit, write, or modify any files in the project
- You MUST NOT use Edit, Write, MultiEdit, or NotebookEdit tools

**Question:**
$ARGUMENTS
