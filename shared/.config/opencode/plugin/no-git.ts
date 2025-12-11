import type { Plugin } from "@opencode-ai/plugin"

export const NoGit: Plugin = async () => {
	return {
		"tool.execute.before": async (input) => {
			if (input.tool.startsWith("git")) {
				throw new Error("Do not use git directly. Use jj. If you need to use git, report which command the user should run")
			}
		},
	}
}
