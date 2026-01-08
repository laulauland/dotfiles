import type { HookAPI } from "@mariozechner/pi-coding-agent";

const GIT_COMMANDS_PATTERN =
	/(^|&&|\|\||;|\|)\s*git\s+(commit|push|pull|checkout|branch|merge|rebase|status|diff|log|add|reset|stash|clone|init|fetch|tag|show|rm|mv|restore|switch|remote|config|clean|cherry-pick|revert|bisect|blame|grep|shortlog|describe|archive|bundle|submodule|worktree|reflog)/;

const JJ_PREFIX = /(^|&&|\|\||;|\|)\s*/;
const JJ_DIFFEDIT_PATTERN = new RegExp(JJ_PREFIX.source + /jj\s+diffedit(\s|$)/.source);
const JJ_SQUASH_PATTERN = new RegExp(JJ_PREFIX.source + /jj\s+squash(\s|$)/.source);
const JJ_SPLIT_PATTERN = new RegExp(JJ_PREFIX.source + /jj\s+split(\s|$)/.source);
const JJ_RESOLVE_PATTERN = new RegExp(JJ_PREFIX.source + /jj\s+resolve(\s|$)/.source);
const JJ_DESCRIBE_PATTERN = new RegExp(JJ_PREFIX.source + /jj\s+(describe|desc)(\s|$)/.source);
const JJ_COMMIT_PATTERN = new RegExp(JJ_PREFIX.source + /jj\s+(commit|ci)(\s|$)/.source);
const JJ_INTERACTIVE_PATTERN = new RegExp(JJ_PREFIX.source + /jj\s+(commit|ci|restore)\s/.source);

const HAS_MESSAGE_FLAG = /(-m\s|--message\s|-m"|--message=|-m'|--stdin)/;
const HAS_INTERACTIVE_FLAG = /(\s(-i|--interactive|--tool)\s|\s(-i|--interactive|--tool)$)/;
const HAS_LIST_FLAG = /(-l|--list)(\s|$)/;

function checkGitCommand(command: string): string | null {
	if (GIT_COMMANDS_PATTERN.test(command)) {
		return "Git commands are disabled. Use jj instead. See: https://jj-vcs.github.io/jj/latest/git-comparison/";
	}
	return null;
}

function checkJJInteractiveCommands(command: string): string | null {
	if (JJ_DIFFEDIT_PATTERN.test(command)) {
		return "jj diffedit always opens a diff editor. Use jj restore for non-interactive alternatives.";
	}

	if (JJ_SQUASH_PATTERN.test(command) && !HAS_MESSAGE_FLAG.test(command)) {
		return 'jj squash without -m opens an editor. Use: jj squash -m "message"';
	}

	if (JJ_SPLIT_PATTERN.test(command)) {
		if (HAS_INTERACTIVE_FLAG.test(command)) {
			return "jj split -i opens a diff editor interactively.";
		}
		if (!HAS_MESSAGE_FLAG.test(command)) {
			return 'jj split without -m opens an editor. Use: jj split -m "message" <files>';
		}
		const remaining = command
			.replace(/^\s*jj\s+split\s*/, "")
			.replace(
				/(-r|--revision|-d|--destination|-A|--insert-after|-B|--insert-before|-m|--message)\s+("[^"]*"|'[^']*'|[^\s]+)\s*/g,
				""
			)
			.replace(/(-p|--parallel)\s*/g, "")
			.trim();
		if (remaining.length === 0) {
			return 'jj split without filesets opens a diff editor. Provide filesets: jj split -m "message" <files>';
		}
	}

	if (JJ_RESOLVE_PATTERN.test(command) && !HAS_LIST_FLAG.test(command)) {
		return "jj resolve opens a merge tool. Use jj resolve --list to view conflicts, or resolve conflicts by editing conflict markers directly.";
	}

	if (JJ_DESCRIBE_PATTERN.test(command) && !HAS_MESSAGE_FLAG.test(command)) {
		return 'jj describe without -m opens an editor. Use: jj describe -m "message"';
	}

	if (JJ_COMMIT_PATTERN.test(command) && !HAS_MESSAGE_FLAG.test(command)) {
		return 'jj commit without -m opens an editor. Use: jj commit -m "message"';
	}

	if (JJ_INTERACTIVE_PATTERN.test(command) && HAS_INTERACTIVE_FLAG.test(command)) {
		return "Interactive jj command blocked (-i/--interactive/--tool opens a diff editor).";
	}

	return null;
}

export default function (pi: HookAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return;

		const command = event.input.command as string;
		if (!command) return;

		const gitError = checkGitCommand(command);
		if (gitError) {
			ctx.ui.notify(gitError, "warning");
			return { block: true, reason: gitError };
		}

		const jjError = checkJJInteractiveCommands(command);
		if (jjError) {
			ctx.ui.notify(jjError, "warning");
			return { block: true, reason: jjError };
		}
	});
}
