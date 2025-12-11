import type { Plugin } from "@opencode-ai/plugin"

const GIT_COMMANDS_PATTERN = /^\s*git\s+(commit|push|pull|checkout|branch|merge|rebase|status|diff|log|add|reset|stash|clone|init|fetch|tag|show|rm|mv|restore|switch|remote|config|clean|cherry-pick|revert|bisect|blame|grep|shortlog|describe|archive|bundle|submodule|worktree|reflog)/

const JJ_DIFFEDIT_PATTERN = /^\s*jj\s+diffedit(\s|$)/
const JJ_SPLIT_PATTERN = /^\s*jj\s+split(\s|$)/
const JJ_RESOLVE_PATTERN = /^\s*jj\s+resolve(\s|$)/
const JJ_DESCRIBE_PATTERN = /^\s*jj\s+(describe|desc)(\s|$)/
const JJ_COMMIT_PATTERN = /^\s*jj\s+(commit|ci)(\s|$)/
const JJ_INTERACTIVE_PATTERN = /^\s*jj\s+(squash|commit|ci|restore)\s/

const HAS_MESSAGE_FLAG = /(-m\s|--message\s|-m"|--message=|-m'|--stdin)/
const HAS_INTERACTIVE_FLAG = /(\s(-i|--interactive|--tool)\s|\s(-i|--interactive|--tool)$)/
const HAS_LIST_FLAG = /(-l|--list)(\s|$)/

interface ToolInput {
	tool: string
	sessionID: string
	callID: string
}

interface BashArgs {
	command: string
}

interface ToolOutput {
	args: BashArgs | Record<string, unknown>
}

function getCommand(input: ToolInput, output: ToolOutput): string | null {
	if (input.tool === "bash") {
		return output.args.command as string ?? null
	}
	return null
}

function checkGitCommand(command: string): string | null {
	if (GIT_COMMANDS_PATTERN.test(command)) {
		return "Git commands are disabled. Use jj instead. See: https://jj-vcs.github.io/jj/latest/git-comparison/"
	}
	return null
}

function checkJJInteractiveCommands(command: string): string | null {
	if (JJ_DIFFEDIT_PATTERN.test(command)) {
		return "jj diffedit always opens a diff editor. Use jj restore or jj squash for non-interactive alternatives."
	}

	if (JJ_SPLIT_PATTERN.test(command)) {
		if (HAS_INTERACTIVE_FLAG.test(command)) {
			return "jj split -i opens a diff editor interactively."
		}
		if (!HAS_MESSAGE_FLAG.test(command)) {
			return 'jj split without -m opens an editor. Use: jj split -m "message" <files>'
		}
		const remaining = command
			.replace(/^\s*jj\s+split\s*/, "")
			.replace(/(-r|--revision|-d|--destination|-A|--insert-after|-B|--insert-before|-m|--message)\s+("[^"]*"|'[^']*'|[^\s]+)\s*/g, "")
			.replace(/(-p|--parallel)\s*/g, "")
			.trim()
		if (remaining.length === 0) {
			return 'jj split without filesets opens a diff editor. Provide filesets: jj split -m "message" <files>'
		}
	}

	if (JJ_RESOLVE_PATTERN.test(command) && !HAS_LIST_FLAG.test(command)) {
		return "jj resolve opens a merge tool. Use jj resolve --list to view conflicts, or resolve conflicts by editing conflict markers directly."
	}

	if (JJ_DESCRIBE_PATTERN.test(command) && !HAS_MESSAGE_FLAG.test(command)) {
		return 'jj describe without -m opens an editor. Use: jj describe -m "message"'
	}

	if (JJ_COMMIT_PATTERN.test(command) && !HAS_MESSAGE_FLAG.test(command)) {
		return 'jj commit without -m opens an editor. Use: jj commit -m "message"'
	}

	if (JJ_INTERACTIVE_PATTERN.test(command) && HAS_INTERACTIVE_FLAG.test(command)) {
		return "Interactive jj command blocked (-i/--interactive/--tool opens a diff editor)."
	}

	return null
}

export const JJWorkflow: Plugin = async () => {
	return {
		"tool.execute.before": async (input, output) => {
			if (input.tool.startsWith("git")) {
				throw new Error("Do not use git directly. Use jj instead. See: https://jj-vcs.github.io/jj/latest/git-comparison/")
			}

			const command = getCommand(input, output as ToolOutput)
			if (!command) return

			const gitError = checkGitCommand(command)
			if (gitError) {
				throw new Error(gitError)
			}

			const jjError = checkJJInteractiveCommands(command)
			if (jjError) {
				throw new Error(jjError)
			}
		},
	}
}
