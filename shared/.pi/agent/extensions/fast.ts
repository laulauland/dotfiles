import { CustomEditor, type ExtensionAPI, type ExtensionContext, type KeybindingsManager } from "@mariozechner/pi-coding-agent";
import type { EditorTheme, TUI } from "@mariozechner/pi-tui";

const FAST_MODE_EVENT = "fast-mode:changed";
const FAST_PROVIDER = "openai-codex";
const FAST_PAYLOAD = { service_tier: "priority" };

type FastModeChange = {
	readonly enabled: boolean;
};

function isOpenAiCodex(model: ExtensionContext["model"]): boolean {
	return model?.provider === FAST_PROVIDER;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withInputSurface(text: string, backgroundAnsi: string | undefined): string {
	if (!backgroundAnsi) return text;
	const reset = "\x1b[0m";
	return `${backgroundAnsi}${text.split(reset).join(`${reset}${backgroundAnsi}`)}\x1b[49m`;
}

class FastModeInputSurfaceEditor extends CustomEditor {
	constructor(
		tui: TUI,
		theme: EditorTheme,
		keybindings: KeybindingsManager,
		private readonly getInputBackgroundAnsi: () => string | undefined,
	) {
		super(tui, theme, keybindings);
	}

	render(width: number): string[] {
		return super.render(width).map((line) => withInputSurface(line, this.getInputBackgroundAnsi()));
	}
}

/** Enables OpenAI Codex priority service for requests made while `/fast` is active. */
export default function fastMode(pi: ExtensionAPI) {
	let activeTui: TUI | undefined;
	let enabled = false;

	function setEnabled(nextEnabled: boolean): void {
		if (enabled === nextEnabled) return;
		enabled = nextEnabled;
		pi.events.emit(FAST_MODE_EVENT, { enabled } satisfies FastModeChange);
		activeTui?.requestRender();
	}

	pi.registerCommand("fast", {
		description: "Toggle priority service for OpenAI Codex models",
		handler: async (_args, ctx) => {
			if (!isOpenAiCodex(ctx.model)) {
				ctx.ui.notify("Fast mode is available only for OpenAI Codex models.", "warning");
				return;
			}

			setEnabled(!enabled);
		},
	});

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		ctx.ui.setEditorComponent((tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) => {
			activeTui = tui;
			return new FastModeInputSurfaceEditor(
				tui,
				theme,
				keybindings,
				() => (enabled ? ctx.ui.theme.getBgAnsi("userMessageBg") : undefined),
			);
		});
	});

	pi.on("session_shutdown", () => {
		activeTui = undefined;
	});

	pi.on("model_select", async (event) => {
		if (!isOpenAiCodex(event.model)) setEnabled(false);
	});

	pi.on("before_provider_request", (event, ctx) => {
		if (!enabled || !isOpenAiCodex(ctx.model) || !isRecord(event.payload)) return;

		Object.assign(event.payload, FAST_PAYLOAD);
		return event.payload;
	});
}
