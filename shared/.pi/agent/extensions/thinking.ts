import {
	getSupportedThinkingLevels,
	type ModelThinkingLevel,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";

function getThinkingLevelCompletions(
	levels: readonly ModelThinkingLevel[],
): AutocompleteItem[] {
	return levels.map((level) => ({
		value: level,
		label: level,
		description: `${level} reasoning`,
	}));
}

function parseThinkingLevel(
	args: string,
	levels: readonly ModelThinkingLevel[],
): ModelThinkingLevel | undefined {
	const normalized = args.trim().toLowerCase();
	const requestedLevel =
		normalized === "extra" ||
		normalized === "extra-high" ||
		normalized === "extra_high"
			? "xhigh"
			: normalized;

	return levels.find((level) => level === requestedLevel);
}

export default function thinkingCommand(pi: ExtensionAPI) {
	let availableLevels: readonly ModelThinkingLevel[] = [];

	function updateAvailableLevels(
		model: Parameters<typeof getSupportedThinkingLevels>[0] | undefined,
	): void {
		availableLevels = model ? getSupportedThinkingLevels(model) : [];
	}

	pi.on("session_start", (_event, ctx) => {
		updateAvailableLevels(ctx.model);
	});

	pi.on("model_select", (event) => {
		updateAvailableLevels(event.model);
	});

	pi.registerCommand("thinking", {
		description: "Show or set a thinking level supported by the active model",
		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
			const normalizedPrefix = prefix.trim().toLowerCase();
			const completions = getThinkingLevelCompletions(availableLevels).filter(
				(item) => item.value.startsWith(normalizedPrefix),
			);
			return completions.length > 0 ? completions : null;
		},
		handler: async (args, ctx) => {
			const levels = ctx.model ? getSupportedThinkingLevels(ctx.model) : [];
			if (levels.length === 0) {
				ctx.ui.notify(
					"No active model is available to configure thinking.",
					"error",
				);
				return;
			}

			let requestedLevel = parseThinkingLevel(args, levels);
			if (!args.trim()) {
				const currentLevel = pi.getThinkingLevel();
				const choice = await ctx.ui.select(
					`Thinking level (current: ${currentLevel})`,
					levels.map((level) =>
						level === currentLevel ? `${level} (current)` : level,
					),
				);
				if (!choice) return;
				requestedLevel = parseThinkingLevel(
					choice.replace(" (current)", ""),
					levels,
				);
			}

			if (!requestedLevel) {
				ctx.ui.notify(
					`Unsupported thinking level: ${args.trim()}. Available: ${levels.join(", ")}`,
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
