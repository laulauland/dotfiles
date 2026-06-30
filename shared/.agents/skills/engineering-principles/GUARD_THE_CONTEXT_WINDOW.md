# Guard the Context Window

The context window is finite and cannot be reclaimed within a session. Every token that enters should earn its place, because overflow degrades reasoning, forces lossy compression, and stalls the task.

Route large payloads to subagents when the harness provides them. Verbose command output, long files, screenshots, and large documents belong in a read-only or delegated worker that returns a summary, so the main thread holds the conclusion rather than the raw data. The main context should receive what the worker concluded, not what it read.

Do not read what you will not use. Read selectively against the current task, and skip files that are not needed for it. Keep content that you use on every invocation inline in the skill or prompt, rather than in a separate file that costs a read each time. Size phases so that the files per phase and the turn budget stay bounded, and account for the cost of the mechanism itself.

This is the agent-side mirror of `MINIMIZE_READER_LOAD.md`. The same instinct that keeps a human reader's working memory clear keeps yours clear too.
