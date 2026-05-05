import { CustomEditor, type ExtensionAPI, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

type ProviderPatch = {
	/** Exact pi provider name, e.g. "openai", "openai-codex", "anthropic". */
	provider: string;
	/** Optional allowlist of model ids. Omit or leave empty to apply to every model for the provider. */
	models?: string[];
	/** Fields merged into the outgoing provider request while /fast is on. */
	payload: Record<string, unknown>;
};

// Edit this list directly when adding/removing providers or models.
const FAST_PROVIDERS: ProviderPatch[] = [
	{ provider: "openai", payload: { service_tier: "priority" } },
	{ provider: "openai-codex", payload: { service_tier: "priority" } },
	// Anthropic's actual Fast Mode uses `speed: "fast"`.
	// `service_tier: "auto"` is Priority Tier, which is a separate feature.
	{ provider: "anthropic", payload: { speed: "fast" } },
];

const STATUS_ID = "fast-mode";
const EDITOR_LABEL = " FAST ";

class FastModeEditor extends CustomEditor {
	constructor(
		tui: ConstructorParameters<typeof CustomEditor>[0],
		theme: ConstructorParameters<typeof CustomEditor>[1],
		keybindings: ConstructorParameters<typeof CustomEditor>[2],
		private readonly isFastModeActive: () => boolean,
		private readonly accent: (text: string) => string,
	) {
		super(tui, theme, keybindings);
	}

	render(width: number): string[] {
		const lines = super.render(width);
		if (!this.isFastModeActive()) return lines;

		return lines.map((line, index) => {
			let next = line.replace(/[─│╭╮╰╯]/g, (char) => this.accent(char));
			if (index === lines.length - 1 && visibleWidth(next) >= EDITOR_LABEL.length) {
				next = truncateToWidth(next, width - EDITOR_LABEL.length, "") + this.accent(EDITOR_LABEL);
			}
			return next;
		});
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPatch(model: ExtensionContext["model"]): ProviderPatch | undefined {
	if (!model) return undefined;
	return FAST_PROVIDERS.find((entry) => {
		if (entry.provider !== model.provider) return false;
		return !entry.models?.length || entry.models.includes(model.id);
	});
}

function modelLabel(model: ExtensionContext["model"]): string {
	return model ? `${model.provider}/${model.id}` : "no model";
}

export default function fastMode(pi: ExtensionAPI) {
	let enabled = false;
	let currentModel: ExtensionContext["model"];

	function updateStatus(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		if (!enabled) {
			ctx.ui.setStatus(STATUS_ID, undefined);
			return;
		}

		const label = getPatch(currentModel ?? ctx.model) ? "fast" : "fast*";
		ctx.ui.setStatus(STATUS_ID, ctx.ui.theme.fg("accent", label));
	}

	pi.registerCommand("fast", {
		description: "Toggle fast provider mode",
		handler: async (_args, ctx) => {
			enabled = !enabled;
			currentModel = ctx.model;
			updateStatus(ctx);

			const patch = getPatch(ctx.model);
			const suffix = enabled && !patch ? ` (no patch configured for ${modelLabel(ctx.model)})` : "";
			ctx.ui.notify(`Fast mode ${enabled ? "ON" : "OFF"}${suffix}`, enabled && !patch ? "warning" : "info");
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		currentModel = ctx.model;
		if (ctx.hasUI) {
			ctx.ui.setEditorComponent((tui, theme, keybindings) =>
				new FastModeEditor(tui, theme, keybindings, () => enabled, (text) => ctx.ui.theme.fg("accent", text)),
			);
		}
		updateStatus(ctx);
	});

	pi.on("model_select", async (event, ctx) => {
		currentModel = event.model;
		updateStatus(ctx);
	});

	pi.on("before_provider_request", (event, ctx) => {
		if (!enabled || !isRecord(event.payload)) return;

		const patch = getPatch(currentModel ?? ctx.model);
		if (!patch) return;

		Object.assign(event.payload, patch.payload);
		return event.payload;
	});
}
