import type { Component, TUI } from "@mariozechner/pi-tui";
import { matchesKey, truncateToWidth, wrapTextWithAnsi, visibleWidth } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { RunRegistry, RunRecord } from "./registry.js";
import { formatElapsed, agentLabel } from "./format.js";

// Box-drawing characters
const TL = "╭", TR = "╮", BL = "╰", BR = "╯", H = "─", V = "│";

export class FactoryOverlay implements Component {
	private tui: TUI;
	private theme: Theme;
	private registry: RunRegistry;
	private done: () => void;
	private selectedIndex = 0;
	private detailScroll = 0;
	private refreshTimer: ReturnType<typeof setInterval> | undefined;
	private cachedLines: string[] | undefined;

	constructor(tui: TUI, theme: Theme, registry: RunRegistry, done: () => void) {
		this.tui = tui;
		this.theme = theme;
		this.registry = registry;
		this.done = done;
		this.startAutoRefresh();
	}

	private renderTimeout: ReturnType<typeof setTimeout> | undefined;

	private debouncedRender(): void {
		if (this.renderTimeout) clearTimeout(this.renderTimeout);
		this.renderTimeout = setTimeout(() => {
			this.renderTimeout = undefined;
			this.invalidate();
			this.tui.requestRender();
		}, 16);
	}

	private startAutoRefresh(): void {
		this.refreshTimer = setInterval(() => {
			if (this.registry.getActive().length > 0) {
				this.debouncedRender();
			}
		}, 500);
	}

	render(width: number): string[] {
		if (this.cachedLines) return this.cachedLines;

		const t = this.theme;
		const runs = this.registry.getAll().sort((a, b) => {
			// Running first, then by most recent
			if (a.status === "running" && b.status !== "running") return -1;
			if (b.status === "running" && a.status !== "running") return 1;
			return b.startedAt - a.startedAt;
		});
		const inner = Math.max(10, width - 2); // content width inside border
		const lines: string[] = [];

		// Top border with title
		const title = ` factory (${runs.length} run${runs.length === 1 ? "" : "s"}) `;
		const titleLen = title.length;
		const padLeft = Math.floor((inner - titleLen) / 2);
		const padRight = inner - titleLen - padLeft;
		lines.push(t.fg("border", TL + H.repeat(Math.max(0, padLeft)) + title + H.repeat(Math.max(0, padRight)) + TR));

		if (runs.length === 0) {
			lines.push(this.bordered(t.fg("muted", "No subagent runs."), inner));
			lines.push(this.bordered("", inner));
			lines.push(this.bordered(t.fg("dim", "Esc to close"), inner));
			lines.push(t.fg("border", BL + H.repeat(inner) + BR));
			this.cachedLines = lines;
			return lines;
		}

		// Clamp selection
		this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, runs.length - 1));

		// Run list
		lines.push(this.bordered("", inner));
		for (let i = 0; i < runs.length; i++) {
			const r = runs[i];
			const selected = i === this.selectedIndex;
			const line = this.formatRunLine(r, inner - 4);
			const prefix = selected ? t.fg("accent", "▶ ") : "  ";
			lines.push(this.bordered(prefix + line, inner));
		}

		// Separator
		lines.push(t.fg("border", V + H.repeat(inner) + V));

		// Detail pane — fixed height to prevent reflow
		const chrome = 1 /* top border */ + 1 /* blank */ + runs.length /* list */ + 1 /* separator */ + 1 /* separator */ + 1 /* footer */ + 1 /* bottom border */;
		const maxHeight = Math.floor(this.tui.terminal.rows * 0.9);
		const detailHeight = Math.max(8, maxHeight - chrome);

		const selectedRun = runs[this.selectedIndex];
		let detailRendered = 0;
		if (selectedRun) {
			const detailLines = this.renderDetail(selectedRun, inner - 2);
			const visibleCount = Math.min(detailLines.length - this.detailScroll, detailHeight - 2 /* scroll indicators */);
			const scrolled = detailLines.slice(this.detailScroll, this.detailScroll + visibleCount);

			if (this.detailScroll > 0) {
				lines.push(this.bordered(t.fg("dim", `▲ ${this.detailScroll} more above`), inner));
				detailRendered++;
			}
			for (const dl of scrolled) {
				lines.push(this.bordered(dl, inner));
				detailRendered++;
			}
			if (this.detailScroll + visibleCount < detailLines.length) {
				lines.push(this.bordered(t.fg("dim", `▼ ${detailLines.length - this.detailScroll - visibleCount} more below`), inner));
				detailRendered++;
			}
		}
		// Pad to fixed height
		while (detailRendered < detailHeight) {
			lines.push(this.bordered("", inner));
			detailRendered++;
		}

		// Footer
		lines.push(t.fg("border", V + H.repeat(inner) + V));
		lines.push(this.bordered(t.fg("dim", "j/k select  J/K scroll detail  c cancel  Esc close"), inner));

		// Bottom border
		lines.push(t.fg("border", BL + H.repeat(inner) + BR));

		this.cachedLines = lines;
		return lines;
	}

	/** Wrap content in border characters, padding to fill inner width. */
	private bordered(content: string, inner: number): string {
		const t = this.theme;
		const maxContent = inner - 1; // 1 char for leading space
		const contentWidth = visibleWidth(content);
		// Safety truncation: if content exceeds available space, truncate it
		const safeContent = contentWidth > maxContent ? truncateToWidth(content, maxContent) : content;
		const safeWidth = contentWidth > maxContent ? visibleWidth(safeContent) : contentWidth;
		const padding = Math.max(0, maxContent - safeWidth);
		return t.fg("border", V) + " " + safeContent + " ".repeat(padding) + t.fg("border", V);
	}

	private formatRunLine(r: RunRecord, maxWidth: number): string {
		const t = this.theme;
		const elapsed = this.elapsedLabel(r);

		const statusIcon =
			r.status === "running" ? t.fg("warning", "●") :
			r.status === "done" ? t.fg("success", "✓") :
			r.status === "cancelled" ? t.fg("muted", "◼") :
			t.fg("error", "✗");

		const agent = agentLabel(r);
		const model = r.summary.results[0]?.model ?? "";
		const modelShort = model.includes("/") ? model.split("/").pop()! : model;

		const parts = [statusIcon, t.fg("accent", agent), t.fg("dim", elapsed)];
		if (modelShort) parts.push(t.fg("muted", modelShort));

		const exitCodes = r.summary.results
			.filter(res => res.exitCode >= 0)
			.map(res => res.exitCode);
		if (exitCodes.length > 0) {
			const allZero = exitCodes.every(c => c === 0);
			parts.push(t.fg(allZero ? "success" : "error", `exit=${exitCodes.join(",")}`));
		}

		return truncateToWidth(parts.join("  "), maxWidth);
	}

	private renderDetail(r: RunRecord, maxWidth: number): string[] {
		const t = this.theme;
		const lines: string[] = [];
		const clamp = (s: string) => truncateToWidth(s, maxWidth);

		// Task — use record metadata, fall back to results
		const task = r.task ?? r.summary.results[0]?.task ?? "(no task)";
		lines.push(clamp(t.fg("muted", "Task: ") + task));

		// Model (child-level only)
		const model = r.summary.results[0]?.model ?? "";
		if (model) lines.push(clamp(t.fg("muted", "Model: ") + model));

		// Status + elapsed
		lines.push(clamp(t.fg("muted", "Status: ") + r.status + "  " + t.fg("dim", this.elapsedLabel(r))));

		// Session path
		const sessionPath = r.summary.results[0]?.sessionPath;
		if (sessionPath) {
			lines.push(clamp(t.fg("muted", "Session: ") + t.fg("dim", sessionPath)));
		}

		// Usage stats
		for (const res of r.summary.results) {
			if (res.usage) {
				const u = res.usage;
				const parts: string[] = [];
				if (u.input > 0 || u.output > 0) parts.push(`${u.input} in / ${u.output} out`);
				if (u.turns > 0) parts.push(`${u.turns} turns`);
				if (u.cost > 0) parts.push(`$${u.cost.toFixed(4)}`);
				if (parts.length > 0) lines.push(clamp(t.fg("muted", "Usage: ") + t.fg("dim", parts.join("  "))));
			}
		}

		// Error
		if (r.summary.error) {
			lines.push("");
			lines.push(clamp(t.fg("error", `Error: ${r.summary.error.code} — ${r.summary.error.message}`)));
		}

		// Child agent results (for program mode)
		if (r.summary.results.length > 0) {
			lines.push("");
			lines.push(clamp(t.fg("muted", "── Child Agents ──")));
			for (const res of r.summary.results) {
				// Status icon based on exit code
				const icon =
					res.exitCode === 0 ? t.fg("success", "✓") :
					res.exitCode > 0 ? t.fg("error", "✗") :
					t.fg("warning", "?");
				
				// Model label
				const modelLabel = res.model ? ` ${t.fg("muted", `[${res.model.includes("/") ? res.model.split("/").pop() : res.model}]`)}` : "";
				
				// Agent header with status icon and model
				lines.push(clamp(icon + " " + t.fg("accent", res.agent) + modelLabel));
				
				// Task
				lines.push(clamp(t.fg("dim", `  Task: ${res.task}`)));
				
				// Output text or "no output" message
				if (res.text) {
					const wrapped = wrapTextWithAnsi(res.text, maxWidth - 2);
					for (const wl of wrapped) lines.push(clamp("  " + wl));
				} else {
					lines.push(t.fg("dim", `  (no output)`));
				}
				
				// Blank line between child agents
				lines.push("");
			}
		}

		return lines;
	}

	private elapsedLabel(r: RunRecord): string {
		return formatElapsed((r.completedAt ?? Date.now()) - r.startedAt);
	}

	handleInput(data: string): void {
		const runs = this.registry.getAll();

		if (matchesKey(data, "escape")) {
			this.dispose();
			this.done();
			return;
		}

		if (matchesKey(data, "j")) {
			if (this.selectedIndex < runs.length - 1) {
				this.selectedIndex++;
				this.detailScroll = 0;
				this.invalidate();
				this.tui.requestRender();
			}
			return;
		}

		if (matchesKey(data, "k")) {
			if (this.selectedIndex > 0) {
				this.selectedIndex--;
				this.detailScroll = 0;
				this.invalidate();
				this.tui.requestRender();
			}
			return;
		}

		if (matchesKey(data, "shift+j")) {
			this.detailScroll++;
			this.invalidate();
			this.tui.requestRender();
			return;
		}

		if (matchesKey(data, "shift+k")) {
			if (this.detailScroll > 0) {
				this.detailScroll--;
				this.invalidate();
				this.tui.requestRender();
			}
			return;
		}

		if (matchesKey(data, "c")) {
			const selected = runs[this.selectedIndex];
			if (selected && selected.status === "running") {
				this.registry.cancel(selected.runId);
				this.invalidate();
				this.tui.requestRender();
			}
			return;
		}
	}

	invalidate(): void {
		this.cachedLines = undefined;
	}

	dispose(): void {
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer);
			this.refreshTimer = undefined;
		}
		if (this.renderTimeout) {
			clearTimeout(this.renderTimeout);
			this.renderTimeout = undefined;
		}
	}
}
