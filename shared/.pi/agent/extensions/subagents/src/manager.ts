import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { runSubagent } from "./runner.js";
import type { AgentRecord } from "./types.js";

interface SpawnOptions {
  description: string;
  prompt: string;
  skills?: string[];
  inheritContext?: boolean;
  maxTurns?: number;
}

export class SubagentManager {
  private agents = new Map<string, AgentRecord>();
  private queue: { id: string; pi: ExtensionAPI; ctx: ExtensionContext; options: SpawnOptions }[] = [];
  private running = 0;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(
    private onComplete: (record: AgentRecord) => void,
    private onStart: (record: AgentRecord) => void,
    private onUpdate: () => void,
    private maxConcurrent = 4,
  ) {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  setMaxConcurrent(value: number): void {
    this.maxConcurrent = Math.max(1, Math.floor(value));
    this.drainQueue();
    this.onUpdate();
  }

  getMaxConcurrent(): number {
    return this.maxConcurrent;
  }

  spawn(pi: ExtensionAPI, ctx: ExtensionContext, options: SpawnOptions): string {
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => { resolveDone = resolve; });
    const id = randomUUID().slice(0, 8);
    const record: AgentRecord = {
      id,
      description: options.description,
      prompt: options.prompt,
      status: "queued",
      startedAt: Date.now(),
      abortController: new AbortController(),
      done,
      resolveDone,
      toolUses: 0,
      activeTools: new Map(),
      latestText: "",
      turnCount: 0,
      maxTurns: options.maxTurns,
    };
    this.agents.set(id, record);
    this.queue.push({ id, pi, ctx, options });
    this.drainQueue();
    this.onUpdate();
    return id;
  }

  private start(id: string, pi: ExtensionAPI, ctx: ExtensionContext, options: SpawnOptions): void {
    const record = this.agents.get(id);
    if (!record || record.status !== "queued") return;

    record.status = "running";
    record.startedAt = Date.now();
    this.running++;
    this.onStart(record);
    this.onUpdate();

    record.promise = runSubagent(ctx, {
      pi,
      prompt: options.prompt,
      skills: options.skills,
      inheritContext: options.inheritContext,
      maxTurns: options.maxTurns,
      signal: record.abortController.signal,
      onSession: (session) => {
        record.session = session;
        if (record.pendingSteers?.length) {
          for (const message of record.pendingSteers) session.steer(message).catch(() => {});
          record.pendingSteers = undefined;
        }
      },
      onText: (text) => {
        record.latestText = text;
        this.onUpdate();
      },
      onTool: (toolName, phase) => {
        if (phase === "start") {
          record.activeTools.set(`${toolName}-${Date.now()}-${Math.random()}`, toolName);
        } else {
          for (const [key, name] of record.activeTools) {
            if (name === toolName) {
              record.activeTools.delete(key);
              break;
            }
          }
          record.toolUses++;
        }
        this.onUpdate();
      },
      onTurnEnd: (turnCount) => {
        record.turnCount = turnCount;
        this.onUpdate();
      },
    }).then(({ text, session, aborted }) => {
      if (record.status !== "stopped") record.status = aborted ? "aborted" : "completed";
      record.result = text;
      record.session = session;
    }).catch((error) => {
      if (record.status !== "stopped") record.status = "error";
      record.error = error instanceof Error ? error.message : String(error);
    }).finally(() => {
      record.activeTools.clear();
      record.completedAt ??= Date.now();
      this.running = Math.max(0, this.running - 1);
      record.resolveDone();
      this.onComplete(record);
      this.drainQueue();
      this.onUpdate();
    });
  }

  private drainQueue(): void {
    while (this.queue.length > 0 && this.running < this.maxConcurrent) {
      const next = this.queue.shift()!;
      this.start(next.id, next.pi, next.ctx, next.options);
    }
  }

  getRecord(id: string): AgentRecord | undefined {
    return this.agents.get(id);
  }

  list(): AgentRecord[] {
    return [...this.agents.values()].sort((a, b) => b.startedAt - a.startedAt);
  }

  abort(id: string): boolean {
    const record = this.agents.get(id);
    if (!record) return false;
    if (record.status === "queued") {
      this.queue = this.queue.filter((item) => item.id !== id);
      record.status = "stopped";
      record.completedAt = Date.now();
      record.resolveDone();
      this.onComplete(record);
      this.onUpdate();
      return true;
    }
    if (record.status !== "running") return false;
    record.status = "stopped";
    record.completedAt = Date.now();
    record.abortController.abort();
    this.onUpdate();
    return true;
  }

  hasRunning(): boolean {
    return this.list().some((record) => record.status === "queued" || record.status === "running");
  }

  abortAll(): void {
    for (const record of this.agents.values()) {
      if (record.status === "queued" || record.status === "running") this.abort(record.id);
    }
  }

  dispose(): void {
    clearInterval(this.cleanupInterval);
    this.queue = [];
    for (const record of this.agents.values()) {
      if (record.status === "queued" || record.status === "running") {
        record.abortController.abort();
        record.status = "stopped";
        record.completedAt ??= Date.now();
        record.resolveDone();
      }
      record.session?.dispose?.();
    }
    this.agents.clear();
  }

  private cleanup(): void {
    const cutoff = Date.now() - 10 * 60_000;
    for (const [id, record] of this.agents) {
      if (record.status === "queued" || record.status === "running") continue;
      if ((record.completedAt ?? 0) > cutoff) continue;
      record.session?.dispose?.();
      this.agents.delete(id);
    }
  }
}
