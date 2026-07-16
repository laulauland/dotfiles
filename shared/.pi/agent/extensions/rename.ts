import { CustomEditor, type ExtensionAPI, type KeybindingsManager } from "@mariozechner/pi-coding-agent";
import type { AutocompleteProvider, EditorComponent, EditorTheme, Focusable, TUI } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

function isFocusableEditor(editor: EditorComponent): editor is EditorComponent & Focusable {
	return "focused" in editor;
}

class SessionNameEditor implements EditorComponent, Focusable {
	private focusedFallback = false;

	constructor(
		private readonly editor: EditorComponent,
		private readonly getSessionName: () => string | undefined,
		private readonly styleLabel: (text: string) => string,
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
		const lines = this.editor.render(width);
		const name = this.getSessionName()?.trim();
		if (!name || lines.length === 0 || width < 6) return lines;

		const rawLabel = ` ${name} `;
		const maxLabelWidth = Math.max(1, width - 4);
		const visibleLabel = truncateToWidth(rawLabel, maxLabelWidth, "…");
		const labelWidth = visibleWidth(visibleLabel);
		if (labelWidth <= 0 || labelWidth + 2 > width) return lines;

		const colorBorder = this.borderColor ?? ((text: string) => text);
		const rightCorner = colorBorder("╮");
		const prefix = truncateToWidth(lines[0]!, width - labelWidth - 1, "");
		lines[0] = truncateToWidth(`${prefix}${this.styleLabel(visibleLabel)}${rightCorner}`, width, "");
		return lines;
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

/** Renames the session and displays its name on the active input editor's border. */
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

		const baseEditorFactory = ctx.ui.getEditorComponent();
		ctx.ui.setEditorComponent((tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) => {
			activeTui = tui;
			const baseEditor = baseEditorFactory?.(tui, theme, keybindings) ?? new CustomEditor(tui, theme, keybindings);
			return new SessionNameEditor(baseEditor, () => currentName, (text) => ctx.ui.theme.fg("accent", text));
		});
	});

	pi.on("session_shutdown", () => {
		activeTui = undefined;
	});
}
