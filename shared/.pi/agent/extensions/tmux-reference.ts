/**
 * Tmux Reference Extension - Reference tmux pane content in your prompts
 *
 * Features:
 * - Ctrl+Y shortcut to open tmux pane picker
 * - Shows all panes across all sessions
 * - Captures pane content (scrollback buffer)
 * - Inserts @tmux:session:window.pane reference at cursor
 * - Automatically injects pane content on prompt submit
 *
 * Usage:
 * 1. Press Ctrl+Y while editing a prompt
 * 2. Select a tmux pane from the list
 * 3. Press Enter to insert the reference
 * 4. Submit your prompt - pane content will be injected automatically
 */

import { type ExtensionAPI, type ExtensionContext, type Theme } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, visibleWidth } from "@mariozechner/pi-tui";
import { execSync } from "node:child_process";

// Tmux reference pattern: @tmux:session:window.pane
const TMUX_REF_PATTERN = /@tmux:([^:\s]+):(\d+)\.(\d+)/g;

interface TmuxPane {
	sessionName: string;
	windowIndex: number;
	paneIndex: number;
	paneTitle: string;
	currentCommand: string;
	width: number;
	height: number;
}

function isTmuxAvailable(): boolean {
	try {
		execSync("tmux list-sessions", { stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
}

function listTmuxPanes(): TmuxPane[] {
	try {
		const output = execSync(
			'tmux list-panes -a -F "#{session_name}\t#{window_index}\t#{pane_index}\t#{pane_title}\t#{pane_current_command}\t#{pane_width}\t#{pane_height}"',
			{ encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
		);

		return output
			.trim()
			.split("\n")
			.filter((line) => line.trim())
			.map((line) => {
				const [sessionName, windowIndex, paneIndex, paneTitle, currentCommand, width, height] =
					line.split("\t");
				return {
					sessionName: sessionName!,
					windowIndex: parseInt(windowIndex!, 10),
					paneIndex: parseInt(paneIndex!, 10),
					paneTitle: paneTitle || "",
					currentCommand: currentCommand || "",
					width: parseInt(width!, 10),
					height: parseInt(height!, 10),
				};
			});
	} catch {
		return [];
	}
}

function capturePaneContent(pane: TmuxPane, lines = 500): string {
	try {
		const target = `${pane.sessionName}:${pane.windowIndex}.${pane.paneIndex}`;
		const output = execSync(`tmux capture-pane -t "${target}" -p -S -${lines}`, {
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		return output.trim();
	} catch (error) {
		return `[Error capturing pane: ${error instanceof Error ? error.message : String(error)}]`;
	}
}

function formatPaneLabel(pane: TmuxPane): string {
	const target = `${pane.sessionName}:${pane.windowIndex}.${pane.paneIndex}`;
	const title = pane.paneTitle || pane.currentCommand || "untitled";
	return `${target} - ${title}`;
}

/**
 * Tmux pane picker overlay component with preview
 */
class TmuxPickerOverlay {
	readonly width = 120;
	private readonly maxVisible = 8;
	private readonly previewLines = 12;

	private panes: TmuxPane[] = [];
	private filteredPanes: TmuxPane[] = [];
	private query = "";
	private selectedIndex = 0;
	private scrollOffset = 0;
	private previewCache = new Map<string, string[]>();

	constructor(
		private theme: Theme,
		private done: (result: TmuxPane | null) => void,
	) {
		this.refreshPanes();
	}

	private refreshPanes(): void {
		this.panes = listTmuxPanes();
		this.filterPanes();
	}

	private filterPanes(): void {
		if (!this.query) {
			this.filteredPanes = this.panes;
		} else {
			const lowerQuery = this.query.toLowerCase();
			this.filteredPanes = this.panes.filter(
				(p) =>
					p.sessionName.toLowerCase().includes(lowerQuery) ||
					p.paneTitle.toLowerCase().includes(lowerQuery) ||
					p.currentCommand.toLowerCase().includes(lowerQuery),
			);
		}
		this.selectedIndex = 0;
		this.scrollOffset = 0;
	}

	private getPreview(pane: TmuxPane): string[] {
		const key = `${pane.sessionName}:${pane.windowIndex}.${pane.paneIndex}`;
		if (this.previewCache.has(key)) {
			return this.previewCache.get(key)!;
		}

		const content = capturePaneContent(pane, 50);
		const lines = content.split("\n").filter((l) => l.trim());
		const lastLines = lines.slice(-this.previewLines);
		this.previewCache.set(key, lastLines);
		return lastLines;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			this.done(null);
			return;
		}

		if (matchesKey(data, "return")) {
			this.done(this.filteredPanes[this.selectedIndex] ?? null);
			return;
		}

		if (matchesKey(data, "up")) {
			if (this.selectedIndex > 0) {
				this.selectedIndex--;
				if (this.selectedIndex < this.scrollOffset) {
					this.scrollOffset = this.selectedIndex;
				}
			}
			return;
		}

		if (matchesKey(data, "down")) {
			if (this.selectedIndex < this.filteredPanes.length - 1) {
				this.selectedIndex++;
				if (this.selectedIndex >= this.scrollOffset + this.maxVisible) {
					this.scrollOffset = this.selectedIndex - this.maxVisible + 1;
				}
			}
			return;
		}

		if (matchesKey(data, "backspace")) {
			if (this.query.length > 0) {
				this.query = this.query.slice(0, -1);
				this.filterPanes();
			}
			return;
		}

		// Regular character input
		if (data.length === 1 && data.charCodeAt(0) >= 32) {
			this.query += data;
			this.filterPanes();
		}
	}

	render(_width: number): string[] {
		const w = this.width;
		const th = this.theme;
		const innerW = w - 2;
		const lines: string[] = [];

		const pad = (s: string, len: number) => {
			const vis = visibleWidth(s);
			return s + " ".repeat(Math.max(0, len - vis));
		};

		const truncate = (s: string, maxW: number) => {
			if (visibleWidth(s) <= maxW) return s;
			let result = "";
			let width = 0;
			for (const char of s) {
				const charWidth = visibleWidth(char);
				if (width + charWidth > maxW - 1) break;
				result += char;
				width += charWidth;
			}
			return result + "…";
		};

		const row = (content: string) => th.fg("border", "│") + pad(content, innerW) + th.fg("border", "│");

		// Top border
		lines.push(th.fg("border", `╭${"─".repeat(innerW)}╮`));

		// Title
		lines.push(row(` ${th.fg("accent", th.bold("Tmux Panes"))}`));

		// Search input
		const searchPrompt = th.fg("accent", "❯ ");
		const searchText = this.query || th.fg("dim", "Search panes...");
		lines.push(row(` ${searchPrompt}${searchText}`));

		// Divider
		lines.push(th.fg("border", `├${"─".repeat(innerW)}┤`));

		// Pane list
		const visiblePanes = this.filteredPanes.slice(
			this.scrollOffset,
			this.scrollOffset + this.maxVisible,
		);

		// Calculate max target width for alignment
		const targetWidth = 28;

		for (let i = 0; i < this.maxVisible; i++) {
			if (i < visiblePanes.length) {
				const pane = visiblePanes[i]!;
				const actualIndex = this.scrollOffset + i;
				const isSelected = actualIndex === this.selectedIndex;

				const prefix = isSelected ? th.fg("accent", " ▶ ") : "   ";
				const targetStr = `${pane.sessionName}:${pane.windowIndex}.${pane.paneIndex}`;
				const fittedTarget = visibleWidth(targetStr) > targetWidth
					? truncate(targetStr, targetWidth)
					: pad(targetStr, targetWidth);
				const target = th.fg("muted", fittedTarget);
				const separator = th.fg("dim", "│ ");

				const title = pane.paneTitle || pane.currentCommand || "untitled";
				const fixedWidth = 3 + targetWidth + 2; // prefix + target + separator
				const maxTitleWidth = Math.max(10, innerW - fixedWidth - 1);
				const truncatedTitle = truncate(title, maxTitleWidth);
				const titleStyled = isSelected ? th.fg("text", truncatedTitle) : th.fg("muted", truncatedTitle);

				lines.push(row(`${prefix}${target}${separator}${titleStyled}`));
			} else if (i === 0 && this.filteredPanes.length === 0) {
				lines.push(row(th.fg("dim", "   No panes found")));
			} else {
				lines.push(row(""));
			}
		}

		// Scroll indicator
		if (this.filteredPanes.length > this.maxVisible) {
			const shown = `${this.scrollOffset + 1}-${Math.min(
				this.scrollOffset + this.maxVisible,
				this.filteredPanes.length,
			)}`;
			const total = this.filteredPanes.length;
			lines.push(row(th.fg("dim", ` (${shown} of ${total})`)));
		} else {
			lines.push(row(""));
		}

		// Preview section
		lines.push(th.fg("border", `├${"─".repeat(innerW)}┤`));

		const selectedPane = this.filteredPanes[this.selectedIndex];
		if (selectedPane) {
			const target = `${selectedPane.sessionName}:${selectedPane.windowIndex}.${selectedPane.paneIndex}`;
			lines.push(row(` ${th.fg("accent", "Preview:")} ${th.fg("dim", target)}`));
			lines.push(row(""));

			const preview = this.getPreview(selectedPane);
			for (let i = 0; i < this.previewLines; i++) {
				const previewLine = preview[i] ?? "";
				const truncatedPreview = truncate(previewLine, innerW - 2);
				lines.push(row(` ${th.fg("dim", truncatedPreview)}`));
			}
		} else {
			lines.push(row(th.fg("dim", " No pane selected")));
			for (let i = 0; i < this.previewLines + 1; i++) {
				lines.push(row(""));
			}
		}

		// Footer
		lines.push(th.fg("border", `├${"─".repeat(innerW)}┤`));
		lines.push(row(th.fg("dim", " ↑↓ navigate  [Enter] select  [Esc] cancel")));

		// Bottom border
		lines.push(th.fg("border", `╰${"─".repeat(innerW)}╯`));

		return lines;
	}

	invalidate(): void {}
	dispose(): void {}
}

/**
 * Resolve tmux references in a prompt and capture content
 */
function resolveTmuxReferences(prompt: string): { resolvedPrompt: string; contexts: string[] } {
	const contexts: string[] = [];
	const panes = listTmuxPanes();

	const resolvedPrompt = prompt.replace(TMUX_REF_PATTERN, (match, sessionName, windowIndex, paneIndex) => {
		const pane = panes.find(
			(p) =>
				p.sessionName === sessionName &&
				p.windowIndex === parseInt(windowIndex, 10) &&
				p.paneIndex === parseInt(paneIndex, 10),
		);

		if (pane) {
			const content = capturePaneContent(pane);
			const target = `${pane.sessionName}:${pane.windowIndex}.${pane.paneIndex}`;
			const title = pane.paneTitle || pane.currentCommand || "untitled";
			contexts.push(
				`## Tmux Pane: ${target}\n**Title:** ${title}\n**Command:** ${pane.currentCommand}\n\n\`\`\`\n${content}\n\`\`\``,
			);
			return match;
		}
		return match;
	});

	return { resolvedPrompt, contexts };
}

export default function (pi: ExtensionAPI) {
	pi.registerShortcut(Key.ctrl("y"), {
		description: "Insert tmux pane reference",
		handler: async (ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("Tmux picker requires interactive mode", "error");
				return;
			}

			if (!isTmuxAvailable()) {
				ctx.ui.notify("Tmux is not running", "error");
				return;
			}

			const result = await ctx.ui.custom<TmuxPane | null>(
				(_tui, theme, _kb, done) => new TmuxPickerOverlay(theme, done),
				{ overlay: true },
			);

			if (result) {
				const target = `${result.sessionName}:${result.windowIndex}.${result.paneIndex}`;
				const currentText = ctx.ui.getEditorText();
				ctx.ui.setEditorText(currentText + `@tmux:${target} `);
				ctx.ui.notify(`Inserted reference to: ${formatPaneLabel(result).slice(0, 40)}...`, "info");
			}
		},
	});

	// Inject context when prompt contains tmux references
	pi.on("before_agent_start", async (event, _ctx) => {
		const { contexts } = resolveTmuxReferences(event.prompt);

		if (contexts.length === 0) {
			return;
		}

		const contextMessage = contexts.join("\n\n---\n\n");

		return {
			message: {
				customType: "tmux-reference",
				content: contextMessage,
				display: true,
			},
		};
	});
}
