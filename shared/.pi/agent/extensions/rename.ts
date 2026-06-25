import { CustomEditor, type ExtensionAPI, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

class SessionNameEditor extends CustomEditor {
	constructor(
		tui: TUI,
		theme: EditorTheme,
		keybindings: KeybindingsManager,
		private readonly getSessionName: () => string | undefined,
		private readonly styleLabel: (text: string) => string,
	) {
		super(tui, theme, keybindings);
	}

	render(width: number): string[] {
		const lines = super.render(width);
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

		ctx.ui.setEditorComponent((tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) => {
			activeTui = tui;
			return new SessionNameEditor(tui, theme, keybindings, () => currentName, (text) => ctx.ui.theme.fg("accent", text));
		});
	});

	pi.on("session_shutdown", () => {
		activeTui = undefined;
	});
}
