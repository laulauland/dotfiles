import type { AutocompleteItem } from "@mariozechner/pi-tui";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

const COMPLETIONS: AutocompleteItem[] = THINKING_LEVELS.map((level) => ({
	value: level,
	label: level,
	description: level === "xhigh" ? "extra high reasoning" : `${level} reasoning`,
}));

function parseLevel(args: string): ThinkingLevel | null {
	const normalized = args.trim().toLowerCase();
	if (!normalized) return null;
	if (normalized === "extra" || normalized === "extra-high" || normalized === "extra_high") return "xhigh";
	if (THINKING_LEVELS.includes(normalized as ThinkingLevel)) return normalized as ThinkingLevel;
	return null;
}

export default function thinkingCommand(pi: ExtensionAPI) {
	pi.registerCommand("thinking", {
		description: "Show or set thinking level: off, minimal, low, medium, high, xhigh",
		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
			const normalizedPrefix = prefix.trim().toLowerCase();
			const matches = COMPLETIONS.filter((item) => item.value.startsWith(normalizedPrefix));
			return matches.length > 0 ? matches : null;
		},
		handler: async (args, ctx) => {
			let requestedLevel = parseLevel(args);

			if (!args.trim()) {
				const currentLevel = pi.getThinkingLevel();
				const choice = await ctx.ui.select(
					`Thinking level (current: ${currentLevel})`,
					THINKING_LEVELS.map((level) => (level === currentLevel ? `${level} (current)` : level)),
				);
				if (!choice) return;
				requestedLevel = parseLevel(choice.replace(" (current)", ""));
			}

			if (!requestedLevel) {
				ctx.ui.notify(
					`Unknown thinking level: ${args.trim()}. Use one of: ${THINKING_LEVELS.join(", ")}`,
					"error",
				);
				return;
			}

			pi.setThinkingLevel(requestedLevel);
			const activeLevel = pi.getThinkingLevel();
			if (activeLevel !== requestedLevel) {
				ctx.ui.notify(
					`Thinking level is ${activeLevel}; ${requestedLevel} is not available for the current model.`,
					"warning",
				);
				return;
			}

			ctx.ui.notify(`Thinking level set to ${activeLevel}`, "success");
		},
	});
}
