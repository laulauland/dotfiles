---
allowed-tools: Bash(jj:*)
description: Create a series of jj commits for the changes
---

## Context

- Current status: !`jj status`
- Current diff: !`jj diff`
- Recent commits: !`jj log -n 10`

## Your task

Based on the above changes, create a single or more commits. Your main goal is that the changes would be grouped in a logical sense.

In jj, the working copy is always a commit. To split changes into multiple commits:
1. Use `jj split -m "message" <fileset>` to split specific files into a separate commit
2. Use `jj describe -m "message"` to set the commit message for the current commit
3. Use `jj new` to create a new empty commit on top of the current one

For splitting changes:
- `jj split -m "message" "path/to/file"` - split a specific file into a new commit
- `jj split -m "message" "glob:src/*.ts"` - split files matching a glob pattern
- `jj split -m "message" "path1" "path2"` - split multiple specific files
- After splitting, use `jj describe -m "message"` to update commit messages as needed

Note: Always use the `-m` flag with `jj split`, `jj describe`, and `jj commit` to avoid opening an interactive editor.
