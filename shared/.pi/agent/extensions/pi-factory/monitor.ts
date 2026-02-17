import type { Component, TUI } from "@mariozechner/pi-tui";
import { matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { RunRegistry, RunRecord } from "./registry.js";
import { formatElapsed, statusIcon, agentLabel } from "./format.js";
import { scanRuns, cwdToSessionDir, getSessionsBase, cancelRunByPidFiles } from "./scanner.js";
import type { ExecutionResult } from "./types.js";

/**
 * 3-level drill-down TUI for monitoring pi-factory subagent runs.
 *
 * Level 1: Run list
 * Level 2: Agent list (within a run)
 * Level 3: Agent detail (single agent, scrollable)
 *
 * Works in two contexts:
 * - In-session overlay: reads from a RunRegistry
 * - Standalone mode: scans filesystem for run.json files
 */

type Level = 1 | 2 | 3;

const MAX_RUNS_VISIBLE = 12;
const MAX_AGENTS_VISIBLE = 10;

export interface MonitorOptions {
	tui: TUI;
	theme: Theme;
	done: () => void;
	registry?: RunRegistry;
	sessionDir?: string;
}

export class FactoryMonitor implements Component {
	protected tui: TUI;
	protected theme: Theme;
	protected done: () => void;
	private registry?: RunRegistry;
	private sessionDir?: string;

	// Navigation state
	private level: Level = 1;
	private selectedRunIndex = 0;
	private runListScroll = 0;
	private selectedAgentIndex = 0;
	private agentListScroll = 0;
	private detailScroll = 0;

	// Filesystem-scanned runs (standalone mode)
	private scannedRuns: RunRecord[] = [];

	// Polling for auto-refresh
	private refreshTimer: ReturnType<typeof setInterval> | undefined;
	private renderTimeout: ReturnType<typeof setTimeout> | undefined;

	constructor(options: MonitorOptions) {
		this.tui = options.tui;
		this.theme = options.theme;
		this.done = options.done;
		this.registry = options.registry;
		this.sessionDir = options.sessionDir;

		if (this.sessionDir) {
			this.refreshScannedRuns();
		}
		this.startAutoRefresh();
	}

	// ── Data access ────────────────────────────────────────────────────

	private getSortedRuns(): RunRecord[] {
		const runs = this.registry
			? this.registry.getAll()
			: this.scannedRuns;

		return [...runs].sort((a, b) => {
			if (a.status === "running" && b.status !== "running") return -1;
			if (b.status === "running" && a.status !== "running") return 1;
			return b.startedAt - a.startedAt;
		});
	}

	private refreshScannedRuns(): void {
		if (!this.sessionDir) return;
		const base = getSessionsBase();
		const dirName = cwdToSessionDir(this.sessionDir);
		const raw = scanRuns(base, dirName);
		this.scannedRuns = raw as RunRecord[];
	}

	// ── Rendering ──────────────────────────────────────────────────────

	render(width: number): string[] {
		const t = this.theme;
		const innerW = Math.max(10, width - 2);
		const border = (c: string) => t.fg("border", c);
		const pad = (s: string) => truncateToWidth(s, innerW, "…", true);
		const row = (s: string) => border("│") + pad(" " + s) + border("│");
		const emptyRow = () => border("│") + pad("") + border("│");
		const lines: string[] = [];
		const runs = this.getSortedRuns();

		// ── Top border with title ──
		const titleText = this.buildTitle(runs);
		const titleW = visibleWidth(titleText);
		const leftPad = Math.floor((innerW - titleW) / 2);
		const rightPad = innerW - titleW - leftPad;
		lines.push(
			border("╭") +
			border("─".repeat(Math.max(0, leftPad))) +
			t.fg("accent", titleText) +
			border("─".repeat(Math.max(0, rightPad))) +
			border("╮"),
		);

		switch (this.level) {
			case 1:
				this.renderRunList(lines, runs, innerW, border, row, emptyRow);
				break;
			case 2:
				this.renderAgentList(lines, runs, innerW, border, row, emptyRow);
				break;
			case 3:
				this.renderAgentDetail(lines, runs, innerW, border, row, emptyRow);
				break;
		}

		// ── Footer ──
		lines.push(border("├") + border("─".repeat(innerW)) + border("┤"));
		lines.push(row(t.fg("dim", this.footerHints())));
		lines.push(border("╰") + border("─".repeat(innerW)) + border("╯"));

		return lines;
	}

	private buildTitle(runs: RunRecord[]): string {
		switch (this.level) {
			case 1:
				return ` factory (${runs.length} run${runs.length === 1 ? "" : "s"}) `;
			case 2: {
				const run = runs[this.selectedRunIndex];
				const label = run ? agentLabel(run) : "run";
				return ` ${label} `;
			}
			case 3: {
				const run = runs[this.selectedRunIndex];
				const agent = run?.summary.results[this.selectedAgentIndex];
				const name = agent?.agent ?? "agent";
				return ` ${name} `;
			}
		}
	}

	private footerHints(): string {
		switch (this.level) {
			case 1:
				return "j/k select  Enter drill  c cancel  r refresh  q/Esc close";
			case 2:
				return "j/k select  Enter detail  Esc back";
			case 3:
				return "j/k scroll  Esc back";
		}
	}

	// ── Level 1: Run list ──────────────────────────────────────────────

	private renderRunList(
		lines: string[],
		runs: RunRecord[],
		innerW: number,
		border: (c: string) => string,
		row: (s: string) => string,
		emptyRow: () => string,
	): void {
		const t = this.theme;

		if (runs.length === 0) {
			lines.push(row(t.fg("muted", "No subagent runs.")));
			lines.push(emptyRow());
			return;
		}

		// Clamp selection
		this.selectedRunIndex = Math.max(0, Math.min(this.selectedRunIndex, runs.length - 1));
		this.clampScroll("run", runs.length, MAX_RUNS_VISIBLE);

		lines.push(emptyRow());

		let rendered = 0;

		// Scroll-up indicator
		if (this.runListScroll > 0) {
			lines.push(row(t.fg("dim", `▲ ${this.runListScroll} more above`)));
			rendered++;
		}

		const visible = runs.slice(this.runListScroll, this.runListScroll + MAX_RUNS_VISIBLE);
		for (let i = 0; i < visible.length && rendered < MAX_RUNS_VISIBLE; i++) {
			const globalIdx = this.runListScroll + i;
			const r = visible[i]!;
			const selected = globalIdx === this.selectedRunIndex;
			const prefix = selected ? t.fg("accent", "▶ ") : "  ";
			const line = this.formatRunLine(r, innerW - 4);
			lines.push(row(prefix + line));
			rendered++;
		}

		// Scroll-down indicator
		const remaining = runs.length - this.runListScroll - visible.length;
		if (remaining > 0 && rendered < MAX_RUNS_VISIBLE) {
			lines.push(row(t.fg("dim", `▼ ${remaining} more below`)));
			rendered++;
		}

		// Pad to fixed height
		while (rendered < MAX_RUNS_VISIBLE) {
			lines.push(emptyRow());
			rendered++;
		}
	}

	private formatRunLine(r: RunRecord, maxWidth: number): string {
		const t = this.theme;
		const elapsed = formatElapsed((r.completedAt ?? Date.now()) - r.startedAt);
		const icon = this.coloredStatusIcon(r.status);
		const task = agentLabel(r);
		const agentCount = r.summary.results.length;
		const model = r.summary.results[0]?.model ?? "";
		const modelShort = model.includes("/") ? model.split("/").pop()! : model;

		const parts = [icon, t.fg("accent", task), t.fg("dim", elapsed)];
		if (agentCount > 1) parts.push(t.fg("muted", `${agentCount} agents`));
		if (modelShort) parts.push(t.fg("muted", modelShort));

		return truncateToWidth(parts.join("  "), maxWidth);
	}

	// ── Level 2: Agent list ────────────────────────────────────────────

	private renderAgentList(
		lines: string[],
		runs: RunRecord[],
		innerW: number,
		border: (c: string) => string,
		row: (s: string) => string,
		emptyRow: () => string,
	): void {
		const t = this.theme;
		const run = runs[this.selectedRunIndex];
		if (!run) {
			lines.push(row(t.fg("error", "Run not found.")));
			return;
		}

		const flat = (s: string) => s.replace(/[\n\r]+/g, " ").trim();

		// Run header info
		lines.push(emptyRow());
		lines.push(row(t.fg("muted", "Task: ") + flat(agentLabel(run))));

		const elapsed = formatElapsed((run.completedAt ?? Date.now()) - run.startedAt);
		lines.push(row(t.fg("muted", "Status: ") + this.coloredStatusIcon(run.status) + " " + run.status + "  " + t.fg("dim", elapsed)));

		// Total cost
		const totalCost = run.summary.results.reduce((sum, r) => sum + (r.usage?.cost ?? 0), 0);
		if (totalCost > 0) {
			lines.push(row(t.fg("muted", "Cost: ") + t.fg("dim", `$${totalCost.toFixed(4)}`)));
		}

		if (run.summary.error) {
			lines.push(row(t.fg("error", "Error: " + flat(`${run.summary.error.code} — ${run.summary.error.message}`))));
		}

		// Separator
		lines.push(border("├") + border("─".repeat(innerW)) + border("┤"));

		// Agent list
		const agents = run.summary.results;
		if (agents.length === 0) {
			lines.push(row(t.fg("muted", "No child agents.")));
			lines.push(emptyRow());
			return;
		}

		this.selectedAgentIndex = Math.max(0, Math.min(this.selectedAgentIndex, agents.length - 1));
		this.clampScroll("agent", agents.length, MAX_AGENTS_VISIBLE);

		let rendered = 0;

		if (this.agentListScroll > 0) {
			lines.push(row(t.fg("dim", `▲ ${this.agentListScroll} more above`)));
			rendered++;
		}

		const visible = agents.slice(this.agentListScroll, this.agentListScroll + MAX_AGENTS_VISIBLE);
		for (let i = 0; i < visible.length && rendered < MAX_AGENTS_VISIBLE; i++) {
			const globalIdx = this.agentListScroll + i;
			const agent = visible[i]!;
			const selected = globalIdx === this.selectedAgentIndex;
			const prefix = selected ? t.fg("accent", "▶ ") : "  ";
			const agentLine = this.formatAgentLine(agent, innerW - 4);
			lines.push(row(prefix + agentLine));
			rendered++;
		}

		const remaining = agents.length - this.agentListScroll - visible.length;
		if (remaining > 0 && rendered < MAX_AGENTS_VISIBLE) {
			lines.push(row(t.fg("dim", `▼ ${remaining} more below`)));
			rendered++;
		}

		while (rendered < MAX_AGENTS_VISIBLE) {
			lines.push(emptyRow());
			rendered++;
		}
	}

	private formatAgentLine(agent: ExecutionResult, maxWidth: number): string {
		const t = this.theme;
		const icon =
			agent.exitCode === 0 ? t.fg("success", "✓") :
			agent.exitCode > 0 ? t.fg("error", "✗") :
			agent.exitCode === -1 ? t.fg("warning", "●") :
			t.fg("warning", "?");

		const model = agent.model ?? "";
		const modelShort = model.includes("/") ? model.split("/").pop()! : model;

		const outputSnippet = agent.text
			? agent.text.replace(/[\n\r]+/g, " ").trim().slice(0, 40)
			: "";

		const parts = [icon, t.fg("accent", agent.agent)];
		if (modelShort) parts.push(t.fg("muted", modelShort));
		if (agent.exitCode >= 0) {
			parts.push(t.fg(agent.exitCode === 0 ? "success" : "error", `exit=${agent.exitCode}`));
		}
		if (outputSnippet) parts.push(t.fg("dim", outputSnippet));

		return truncateToWidth(parts.join("  "), maxWidth);
	}

	// ── Level 3: Agent detail ──────────────────────────────────────────

	private renderAgentDetail(
		lines: string[],
		runs: RunRecord[],
		innerW: number,
		_border: (c: string) => string,
		row: (s: string) => string,
		emptyRow: () => string,
	): void {
		const t = this.theme;
		const run = runs[this.selectedRunIndex];
		const agent = run?.summary.results[this.selectedAgentIndex];
		if (!run || !agent) {
			lines.push(row(t.fg("error", "Agent not found.")));
			return;
		}

		const allLines = this.buildAgentDetailLines(agent, innerW - 2);
		const maxVisible = 20;

		// Clamp scroll
		const maxScroll = Math.max(0, allLines.length - maxVisible);
		this.detailScroll = Math.max(0, Math.min(this.detailScroll, maxScroll));

		let rendered = 0;

		if (this.detailScroll > 0) {
			lines.push(row(t.fg("dim", `▲ ${this.detailScroll} more above`)));
			rendered++;
		}

		const scrolled = allLines.slice(this.detailScroll, this.detailScroll + maxVisible);
		for (const dl of scrolled) {
			if (rendered >= maxVisible) break;
			lines.push(row(dl));
			rendered++;
		}

		const below = allLines.length - this.detailScroll - scrolled.length;
		if (below > 0 && rendered < maxVisible) {
			lines.push(row(t.fg("dim", `▼ ${below} more below`)));
			rendered++;
		}

		while (rendered < maxVisible) {
			lines.push(emptyRow());
			rendered++;
		}
	}

	private buildAgentDetailLines(agent: ExecutionResult, maxWidth: number): string[] {
		const t = this.theme;
		const lines: string[] = [];

		lines.push("");
		lines.push(t.fg("muted", "Agent: ") + t.fg("accent", agent.agent));
		if (agent.model) lines.push(t.fg("muted", "Model: ") + agent.model);
		lines.push(t.fg("muted", "Exit code: ") + (agent.exitCode >= 0 ? String(agent.exitCode) : t.fg("warning", "running")));

		if (agent.usage) {
			const u = agent.usage;
			const parts: string[] = [];
			if (u.turns > 0) parts.push(`${u.turns} turns`);
			if (u.input > 0 || u.output > 0) parts.push(`${u.input} in / ${u.output} out`);
			if (u.cost > 0) parts.push(`$${u.cost.toFixed(4)}`);
			if (parts.length > 0) {
				lines.push(t.fg("muted", "Usage: ") + t.fg("dim", parts.join("  ")));
			}
		}

		if (agent.sessionPath) {
			lines.push(t.fg("muted", "Session: ") + t.fg("dim", agent.sessionPath));
		}

		if (agent.stopReason && agent.stopReason !== "end_turn" && agent.stopReason !== "toolUse" && agent.exitCode >= 0) {
			lines.push(t.fg("muted", "Stop reason: ") + agent.stopReason);
		}
		if (agent.errorMessage) {
			lines.push(t.fg("error", "Error: ") + agent.errorMessage);
		}

		// Task
		lines.push("");
		lines.push(t.fg("muted", "── Task ──"));
		const taskWrapped = wrapTextWithAnsi(agent.task || "(no task)", maxWidth);
		for (const wl of taskWrapped) lines.push(wl);

		// Full output
		lines.push("");
		lines.push(t.fg("muted", "── Output ──"));
		if (agent.text) {
			const outputWrapped = wrapTextWithAnsi(agent.text, maxWidth);
			for (const wl of outputWrapped) lines.push(wl);
		} else {
			lines.push(t.fg("dim", "(no output)"));
		}

		return lines;
	}

	// ── Input handling ─────────────────────────────────────────────────

	handleInput(data: string): void {
		// q or Esc at level 1 closes, at deeper levels goes back
		if (matchesKey(data, "escape") || (this.level === 1 && matchesKey(data, "q"))) {
			if (this.level === 1) {
				this.dispose();
				this.done();
			} else {
				this.level = (this.level - 1) as Level;
				if (this.level === 1) this.detailScroll = 0;
				if (this.level === 2) this.detailScroll = 0;
			}
			return;
		}

		switch (this.level) {
			case 1:
				this.handleLevel1Input(data);
				break;
			case 2:
				this.handleLevel2Input(data);
				break;
			case 3:
				this.handleLevel3Input(data);
				break;
		}
	}

	private handleLevel1Input(data: string): void {
		const runs = this.getSortedRuns();

		if (matchesKey(data, "j")) {
			if (this.selectedRunIndex < runs.length - 1) {
				this.selectedRunIndex++;
			}
			return;
		}
		if (matchesKey(data, "k")) {
			if (this.selectedRunIndex > 0) {
				this.selectedRunIndex--;
			}
			return;
		}
		if (matchesKey(data, "return")) {
			if (runs.length > 0) {
				this.level = 2;
				this.selectedAgentIndex = 0;
				this.agentListScroll = 0;
			}
			return;
		}
		if (matchesKey(data, "c")) {
			const run = runs[this.selectedRunIndex];
			if (run && run.status === "running") {
				if (this.registry) {
					// In-session: use abort controller via registry
					this.registry.cancel(run.runId);
				} else {
					// Standalone mode: kill by PID files
					const artifactsDir = run.summary.observability?.artifactsDir;
					if (artifactsDir) {
						cancelRunByPidFiles(artifactsDir);
					}
				}
			}
			return;
		}
		if (matchesKey(data, "r")) {
			if (this.sessionDir) {
				this.refreshScannedRuns();
			}
			return;
		}
	}

	private handleLevel2Input(data: string): void {
		const runs = this.getSortedRuns();
		const run = runs[this.selectedRunIndex];
		if (!run) return;
		const agents = run.summary.results;

		if (matchesKey(data, "j")) {
			if (this.selectedAgentIndex < agents.length - 1) {
				this.selectedAgentIndex++;
			}
			return;
		}
		if (matchesKey(data, "k")) {
			if (this.selectedAgentIndex > 0) {
				this.selectedAgentIndex--;
			}
			return;
		}
		if (matchesKey(data, "return")) {
			if (agents.length > 0) {
				this.level = 3;
				this.detailScroll = 0;
			}
			return;
		}
	}

	private handleLevel3Input(data: string): void {
		if (matchesKey(data, "j")) {
			this.detailScroll++;
			return;
		}
		if (matchesKey(data, "k")) {
			if (this.detailScroll > 0) this.detailScroll--;
			return;
		}
	}

	// ── Helpers ────────────────────────────────────────────────────────

	private coloredStatusIcon(status: string): string {
		const t = this.theme;
		const icon = statusIcon(status);
		switch (status) {
			case "running": return t.fg("warning", icon);
			case "done": return t.fg("success", icon);
			case "failed": return t.fg("error", icon);
			case "cancelled": return t.fg("muted", icon);
			default: return t.fg("dim", icon);
		}
	}

	private clampScroll(which: "run" | "agent", total: number, maxVisible: number): void {
		if (which === "run") {
			const maxScroll = Math.max(0, total - maxVisible);
			this.runListScroll = Math.max(0, Math.min(this.runListScroll, maxScroll));
			if (this.selectedRunIndex < this.runListScroll) {
				this.runListScroll = this.selectedRunIndex;
			} else if (this.selectedRunIndex >= this.runListScroll + maxVisible) {
				this.runListScroll = this.selectedRunIndex - maxVisible + 1;
			}
		} else {
			const maxScroll = Math.max(0, total - maxVisible);
			this.agentListScroll = Math.max(0, Math.min(this.agentListScroll, maxScroll));
			if (this.selectedAgentIndex < this.agentListScroll) {
				this.agentListScroll = this.selectedAgentIndex;
			} else if (this.selectedAgentIndex >= this.agentListScroll + maxVisible) {
				this.agentListScroll = this.selectedAgentIndex - maxVisible + 1;
			}
		}
	}

	// ── Auto-refresh ───────────────────────────────────────────────────

	private startAutoRefresh(): void {
		const interval = this.sessionDir ? 1000 : 500;
		this.refreshTimer = setInterval(() => {
			if (this.sessionDir) {
				this.refreshScannedRuns();
				this.debouncedRender();
			} else if (this.registry && this.registry.getActive().length > 0) {
				this.debouncedRender();
			}
		}, interval);
	}

	private debouncedRender(): void {
		if (this.renderTimeout) clearTimeout(this.renderTimeout);
		this.renderTimeout = setTimeout(() => {
			this.renderTimeout = undefined;
			this.tui.requestRender();
		}, 16);
	}

	invalidate(): void {
		// No-op: render() is always fresh
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
