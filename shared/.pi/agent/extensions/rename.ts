import { CustomEditor, type ExtensionAPI, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import type { AutocompleteProvider, EditorComponent, EditorTheme, Focusable, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

class SessionNameEditor implements EditorComponent, Focusable {
	constructor(
		private readonly base: EditorComponent,
		private readonly getSessionName: () => string | undefined,
		private readonly styleLabel: (text: string) => string,
	) {}

	get wantsKeyRelease(): boolean | undefined {
		return this.base.wantsKeyRelease;
	}

	get focused(): boolean {
		return "focused" in this.base ? Boolean((this.base as EditorComponent & Focusable).focused) : false;
	}

	set focused(value: boolean) {
		if ("focused" in this.base) {
			(this.base as EditorComponent & Focusable).focused = value;
		}
	}

	get onSubmit(): ((text: string) => void) | undefined {
		return this.base.onSubmit;
	}

	set onSubmit(handler: ((text: string) => void) | undefined) {
		this.base.onSubmit = handler;
	}

	get onChange(): ((text: string) => void) | undefined {
		return this.base.onChange;
	}

	set onChange(handler: ((text: string) => void) | undefined) {
		this.base.onChange = handler;
	}

	get borderColor(): ((str: string) => string) | undefined {
		return this.base.borderColor;
	}

	set borderColor(fn: ((str: string) => string) | undefined) {
		this.base.borderColor = fn;
	}

	getText(): string {
		return this.base.getText();
	}

	setText(text: string): void {
		this.base.setText(text);
	}

	handleInput(data: string): void {
		this.base.handleInput(data);
	}

	addToHistory(text: string): void {
		this.base.addToHistory?.(text);
	}

	insertTextAtCursor(text: string): void {
		this.base.insertTextAtCursor?.(text);
	}

	getExpandedText(): string {
		return this.base.getExpandedText?.() ?? this.base.getText();
	}

	setAutocompleteProvider(provider: AutocompleteProvider): void {
		this.base.setAutocompleteProvider?.(provider);
	}

	setPaddingX(padding: number): void {
		this.base.setPaddingX?.(padding);
	}

	setAutocompleteMaxVisible(maxVisible: number): void {
		this.base.setAutocompleteMaxVisible?.(maxVisible);
	}

	render(width: number): string[] {
		const lines = this.base.render(width);
		const name = this.getSessionName()?.trim();
		if (!name || lines.length === 0 || width < 6) return lines;

		const rawLabel = ` ${name} `;
		const maxLabelWidth = Math.max(1, width - 4);
		const visibleLabel = truncateToWidth(rawLabel, maxLabelWidth, "…");
		const labelWidth = visibleWidth(visibleLabel);
		if (labelWidth <= 0 || labelWidth + 2 > width) return lines;

		const colorBorder = this.base.borderColor ?? ((text: string) => text);
		const rightCorner = colorBorder("╮");
		const prefix = truncateToWidth(lines[0]!, width - labelWidth - 1, "");
		lines[0] = truncateToWidth(`${prefix}${this.styleLabel(visibleLabel)}${rightCorner}`, width, "");
		return lines;
	}

	invalidate(): void {
		this.base.invalidate();
	}
}

export default function renameSessionExtension(pi: ExtensionAPI) {
	let currentName: string | undefined;
	let activeTui: TUI | undefined;

	pi.registerCommand("rename", {
		description: "Rename the current session and show the name on the input border",
		handler: async (args, ctx) => {
			const name = args.trim();
			if (!name) {
				ctx.ui.notify(currentName ? `Session name: ${currentName}` : "Usage: /rename <name>", "info");
				return;
			}

			pi.setSessionName(name);
			currentName = name;
			activeTui?.requestRender();
			ctx.ui.notify(`Renamed session to: ${name}`, "success");
		},
	});

	pi.on("session_start", (_event, ctx) => {
		currentName = pi.getSessionName();
		if (ctx.mode !== "tui") return;

		const previous = ctx.ui.getEditorComponent();
		ctx.ui.setEditorComponent((tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) => {
			activeTui = tui;
			const base = previous ? previous(tui, theme, keybindings) : new CustomEditor(tui, theme, keybindings);
			return new SessionNameEditor(base, () => currentName, (text) => ctx.ui.theme.fg("accent", text));
		});
	});

	pi.on("session_shutdown", () => {
		activeTui = undefined;
	});
}
