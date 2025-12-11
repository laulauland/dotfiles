---
description: Ask an investigative question without making any changes
subtask: true
permission:
  edit: deny
  bash:
    "ls *": allow
    "cat *": allow
    "head *": allow
    "tail *": allow
    "jj *": allow
    "git *": allow
    "gh *": allow
    "*": deny
---

## Mode: Investigation Only

This is a **question**, not a request to make changes.

**Rules:**
- You may read files, search the codebase, explore directories, and run read-only commands
- You may create temporary helper scripts in `/tmp` to gather information if needed
- You may propose or suggest changes, but MUST NOT implement them
- You MUST NOT edit, write, or modify any files in the project

**Question:**
$ARGUMENTS
