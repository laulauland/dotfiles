import { CustomEditor, type ExtensionAPI, type ExtensionContext, type KeybindingsManager } from "@mariozechner/pi-coding-agent";
import type { AutocompleteProvider, EditorComponent, EditorTheme, Focusable, TUI } from "@mariozechner/pi-tui";

const FAST_MODE_EVENT = "fast-mode:changed";
const FAST_PROVIDER = "openai-codex";
const FAST_PAYLOAD = { service_tier: "priority" };

type FastModeChange = {
	readonly enabled: boolean;
};

function isFocusableEditor(editor: EditorComponent): editor is EditorComponent & Focusable {
	return "focused" in editor;
}

function isOpenAiCodex(model: ExtensionContext["model"]): boolean {
	return model?.provider === FAST_PROVIDER;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withInputSurface(text: string, backgroundAnsi: string | undefined): string {
	if (!backgroundAnsi) return text;
	return `${backgroundAnsi}${text.replace(/\x1b\[0m/g, `\x1b[0m${backgroundAnsi}`)}\x1b[49m`;
}

class FastModeInputSurfaceEditor implements EditorComponent, Focusable {
	private focusedFallback = false;

	constructor(
		private readonly editor: EditorComponent,
		private readonly getInputBackgroundAnsi: () => string | undefined,
	) {}

	get focused(): boolean {
		return isFocusableEditor(this.editor) ? this.editor.focused : this.focusedFallback;
	}

	set focused(value: boolean) {
		this.focusedFallback = value;
		if (isFocusableEditor(this.editor)) this.editor.focused = value;
	}

	get wantsKeyRelease(): boolean | undefined {
		return this.editor.wantsKeyRelease;
	}

	get onSubmit(): ((text: string) => void) | undefined {
		return this.editor.onSubmit;
	}

	set onSubmit(handler: ((text: string) => void) | undefined) {
		this.editor.onSubmit = handler;
	}

	get onChange(): ((text: string) => void) | undefined {
		return this.editor.onChange;
	}

	set onChange(handler: ((text: string) => void) | undefined) {
		this.editor.onChange = handler;
	}

	get borderColor(): ((text: string) => string) | undefined {
		return this.editor.borderColor;
	}

	set borderColor(style: ((text: string) => string) | undefined) {
		this.editor.borderColor = style;
	}

	getText(): string {
		return this.editor.getText();
	}

	setText(text: string): void {
		this.editor.setText(text);
	}

	handleInput(data: string): void {
		this.editor.handleInput(data);
	}

	addToHistory(text: string): void {
		this.editor.addToHistory?.(text);
	}

	getExpandedText(): string {
		return this.editor.getExpandedText?.() ?? this.editor.getText();
	}

	insertTextAtCursor(text: string): void {
		this.editor.insertTextAtCursor?.(text);
	}

	invalidate(): void {
		this.editor.invalidate();
	}

	render(width: number): string[] {
		return this.editor.render(width).map((line) => withInputSurface(line, this.getInputBackgroundAnsi()));
	}

	setAutocompleteProvider(provider: AutocompleteProvider): void {
		this.editor.setAutocompleteProvider?.(provider);
	}

	setAutocompleteMaxVisible(maxVisible: number): void {
		this.editor.setAutocompleteMaxVisible?.(maxVisible);
	}

	setPaddingX(padding: number): void {
		this.editor.setPaddingX?.(padding);
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

		const baseEditorFactory = ctx.ui.getEditorComponent();
		ctx.ui.setEditorComponent((tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) => {
			activeTui = tui;
			const baseEditor = baseEditorFactory?.(tui, theme, keybindings) ?? new CustomEditor(tui, theme, keybindings);
			return new FastModeInputSurfaceEditor(
				baseEditor,
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
