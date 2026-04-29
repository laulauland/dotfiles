import { truncateToWidth } from "@mariozechner/pi-tui";
import type { SubagentManager } from "./manager.js";
import type { AgentRecord } from "./types.js";

export const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const MAX_LINES = 12;

type Theme = { fg(color: string, text: string): string; bold(text: string): string };
type UICtx = {
  setStatus(key: string, text: string | undefined): void;
  setWidget(key: string, content: undefined | ((tui: any, theme: Theme) => { render(): string[]; invalidate(): void }), options?: { placement?: "aboveEditor" | "belowEditor" }): void;
};

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function activity(record: AgentRecord): string {
  if (record.activeTools.size > 0) {
    const names = [...new Set(record.activeTools.values())];
    return `using ${names.join(", ")}…`;
  }
  const line = record.latestText.split("\n").find((l) => l.trim())?.trim();
  return line ? `${line.slice(0, 70)}${line.length > 70 ? "…" : ""}` : "thinking…";
}

export class SubagentWidget {
  private uiCtx: UICtx | undefined;
  private registered = false;
  private tui: any | undefined;
  private interval: ReturnType<typeof setInterval> | undefined;
  private frame = 0;
  private lastStatus: string | undefined;
  private finishedAge = new Map<string, number>();

  constructor(private manager: SubagentManager) {}

  setUICtx(ctx: UICtx): void {
    if (ctx === this.uiCtx) return;
    this.uiCtx = ctx;
    this.registered = false;
    this.tui = undefined;
    this.lastStatus = undefined;
  }

  onTurnStart(): void {
    for (const [id, age] of this.finishedAge) this.finishedAge.set(id, age + 1);
    this.update();
  }

  markFinished(id: string): void {
    if (!this.finishedAge.has(id)) this.finishedAge.set(id, 0);
  }

  ensureTimer(): void {
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.frame++;
      this.update();
    }, 100);
  }

  private shouldShow(record: AgentRecord): boolean {
    if (record.status === "running" || record.status === "queued") return true;
    return (this.finishedAge.get(record.id) ?? 99) < 2;
  }

  private render(tui: any, theme: Theme): string[] {
    const width = tui.terminal.columns;
    const truncate = (line: string) => truncateToWidth(line, width);
    const records = this.manager.list().filter((record) => this.shouldShow(record));
    const active = records.some((record) => record.status === "running" || record.status === "queued");
    if (records.length === 0) return [];

    const lines = [truncate(`${theme.fg(active ? "accent" : "dim", active ? "●" : "○")} ${theme.fg(active ? "accent" : "dim", "Subagents")}`)];
    for (const record of records.slice(0, MAX_LINES - 1)) {
      const elapsed = formatMs((record.completedAt ?? Date.now()) - record.startedAt);
      if (record.status === "running") {
        const spin = theme.fg("accent", SPINNER[this.frame % SPINNER.length]!);
        lines.push(truncate(`├─ ${spin} ${theme.bold(record.description)} ${theme.fg("dim", `· ${record.toolUses} tools · ${elapsed}`)}`));
        lines.push(truncate(`│  ${theme.fg("dim", `⎿ ${activity(record)}`)}`));
      } else if (record.status === "queued") {
        lines.push(truncate(`├─ ${theme.fg("muted", "◦")} ${theme.fg("muted", record.description)} ${theme.fg("dim", "· queued")}`));
      } else {
        const ok = record.status === "completed";
        const icon = ok ? theme.fg("success", "✓") : theme.fg("error", "✗");
        lines.push(truncate(`├─ ${icon} ${theme.fg("dim", record.description)} ${theme.fg("dim", `· ${record.status} · ${record.toolUses} tools · ${elapsed}`)}`));
      }
      if (lines.length >= MAX_LINES) break;
    }
    if (records.length > MAX_LINES - 1) lines.push(truncate(theme.fg("dim", `└─ +${records.length - (MAX_LINES - 1)} more`)));
    const last = lines.length - 1;
    if (last > 0) lines[last] = lines[last]!.replace("├─", "└─").replace("│ ", "  ");
    return lines.slice(0, MAX_LINES);
  }

  update(): void {
    if (!this.uiCtx) return;
    const records = this.manager.list().filter((record) => this.shouldShow(record));
    const running = records.filter((record) => record.status === "running").length;
    const queued = records.filter((record) => record.status === "queued").length;

    if (records.length === 0) {
      if (this.registered) this.uiCtx.setWidget("subagents", undefined);
      this.registered = false;
      this.tui = undefined;
      if (this.lastStatus !== undefined) this.uiCtx.setStatus("subagents", undefined);
      this.lastStatus = undefined;
      if (this.interval) clearInterval(this.interval);
      this.interval = undefined;
      return;
    }

    const statusParts: string[] = [];
    if (running) statusParts.push(`${running} running`);
    if (queued) statusParts.push(`${queued} queued`);
    const nextStatus = statusParts.length ? `${statusParts.join(", ")} subagent${running + queued === 1 ? "" : "s"}` : undefined;
    if (nextStatus !== this.lastStatus) {
      this.uiCtx.setStatus("subagents", nextStatus);
      this.lastStatus = nextStatus;
    }

    if (!this.registered) {
      this.uiCtx.setWidget("subagents", (tui, theme) => {
        this.tui = tui;
        return { render: () => this.render(tui, theme), invalidate: () => {} };
      }, { placement: "aboveEditor" });
      this.registered = true;
    } else {
      this.tui?.requestRender();
    }
  }

  dispose(): void {
    if (this.interval) clearInterval(this.interval);
    this.uiCtx?.setWidget("subagents", undefined);
    this.uiCtx?.setStatus("subagents", undefined);
  }
}
