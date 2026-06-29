# Guard the Context Window

The context window is finite and cannot be reclaimed within a session. Every token that enters should earn its place, because overflow degrades reasoning, forces lossy compression, and stalls the task.

Route large payloads to subagents. Verbose command output, long files, screenshots, and large documents belong in a subagent that reads them and returns a summary, so the main thread holds the conclusion rather than the raw data. Your harnesses give you this directly, through the `Explore` agent for read-only fan-out and the operator and herdr subagents for delegated work. The main context should receive what the subagent concluded, not what it read.

Do not read what you will not use. Read selectively against the current task, and skip files that are not needed for it. Keep content that you use on every invocation inline in the skill or prompt, rather than in a separate file that costs a read each time. Size phases so that the files per phase and the turn budget stay bounded, and account for the cost of the mechanism itself.

This is the agent-side mirror of `MINIMIZE_READER_LOAD.md`. The same instinct that keeps a human reader's working memory clear keeps yours clear too.
