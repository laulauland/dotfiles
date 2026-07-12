import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { keyHint } from "@earendil-works/pi-coding-agent";
import { Box, Text, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAgentSurface,
  closeSurface,
  focusSurface,
  herdrSetupHint,
  isHerdrAvailable,
  pollForExit,
  sendEscape,
  sendPrompt,
  surfaceExists,
  type HerdrSurface,
} from "./herdr.ts";
import { getSubagentActivityFile, readSubagentActivityFile, type ActivityReadResult, type SubagentActivityState } from "./activity.ts";
import { clearSubagentExitSidecar, findLastAssistantMessage, getNewEntries, seedSubagentSessionFile } from "./session.ts";
import {
  advanceStatusState,
  capStatusLines,
  classifyStatus,
  createStatusState,
  forceStatusAfterInterrupt,
  formatStatusAggregate,
  formatTransitionLine,
  loadStatusConfig,
  observeStatus,
  type StatusSnapshot,
  type SubagentStatusState,
} from "./status.ts";

const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));
const GLOBAL_STATE_KEY = "__herdrSubagentsExtensionState";

interface ExtensionGlobalState {
  widgetInterval: ReturnType<typeof setInterval> | null;
  statusInterval: ReturnType<typeof setInterval> | null;
  pollAbort: AbortController;
}

type GlobalWithExtensionState = typeof globalThis & {
  __herdrSubagentsExtensionState?: ExtensionGlobalState;
};

// SAFETY: This process-global slot is initialized immediately below and is only used for reload cleanup.
const globalWithExtensionState = globalThis as GlobalWithExtensionState;
const previousGlobalState = globalWithExtensionState[GLOBAL_STATE_KEY];
if (previousGlobalState?.widgetInterval) clearInterval(previousGlobalState.widgetInterval);
if (previousGlobalState?.statusInterval) clearInterval(previousGlobalState.statusInterval);
previousGlobalState?.pollAbort.abort();
const extensionGlobalState: ExtensionGlobalState = {
  widgetInterval: null,
  statusInterval: null,
  pollAbort: new AbortController(),
};
globalWithExtensionState[GLOBAL_STATE_KEY] = extensionGlobalState;

function getModuleAbortSignal(): AbortSignal {
  return extensionGlobalState.pollAbort.signal;
}

const SubagentAction = Type.Union([
  Type.Literal("start"),
  Type.Literal("interrupt"),
  Type.Literal("list"),
  Type.Literal("status"),
  Type.Literal("remove"),
  Type.Literal("resume"),
]);

const SubagentParams = Type.Object({
  action: SubagentAction,
  id: Type.Optional(Type.String({ description: "Subagent id for interrupt/status/remove/resume" })),
  task: Type.Optional(Type.String({ description: "Short human-readable task summary used for the tab label and exact task-based lookup" })),
  prompt: Type.Optional(Type.String({ description: "Full task prompt, mandate, and instructions for action=start" })),
  model: Type.Optional(Type.String({ description: "Model override for the child Pi session" })),
  cwd: Type.Optional(Type.String({ description: "Working directory for the child" })),
  fork: Type.Optional(Type.Boolean({ description: "Start from a fork of the current session history" })),
}, { additionalProperties: false });

type SubagentParamsType = typeof SubagentParams.static;

interface RunningSubagent {
  id: string;
  task: string;
  cwd: string;
  model?: string;
  surface: HerdrSurface;
  startTime: number;
  sessionFile: string;
  launchScriptFile?: string;
  activityFile?: string;
  activity?: SubagentActivityState;
  activityRead?: { ok: boolean; reason?: "missing" | "invalid" | "wrong-id"; error?: string };
  abortController?: AbortController;
  settledAt?: number;
  removed?: boolean;
  statusState: SubagentStatusState;
}

interface SubagentResult {
  id: string;
  task: string;
  summary: string;
  sessionFile?: string;
  exitCode: number;
  elapsed: number;
  error?: string;
  errorMessage?: string;
}

type StoredSubagentState = "running" | "settled";

interface StoredSubagent {
  readonly id: string;
  readonly task: string;
  readonly sessionFile: string;
  readonly cwd: string;
  readonly model?: string;
  readonly launchScriptFile?: string;
  readonly surface?: HerdrSurface;
  readonly state: StoredSubagentState;
  readonly updatedAt: number;
}

const runningSubagents = new Map<string, RunningSubagent>();
const storedSubagents = new Map<string, StoredSubagent>();
const statusConfig = loadStatusConfig();

let latestCtx: ExtensionContext | null = null;
let runtimeAlive = false;
let agentsSelectorOpen = false;
let launchQueue: Promise<void> = Promise.resolve();
let widgetInterval: ReturnType<typeof setInterval> | null = null;
let statusInterval: ReturnType<typeof setInterval> | null = null;
const watcherTasks = new Set<Promise<void>>();

function shellEscape(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function copyCommand(): { command: string; args: string[] }[] {
  switch (platform()) {
    case "darwin": return [{ command: "pbcopy", args: [] }];
    case "linux": return [{ command: "wl-copy", args: [] }, { command: "xclip", args: ["-selection", "clipboard"] }, { command: "xsel", args: ["--clipboard", "--input"] }];
    case "win32": return [{ command: "clip.exe", args: [] }];
    default: return [];
  }
}

async function copyToClipboard(text: string): Promise<string> {
  let lastError: unknown;
  for (const candidate of copyCommand()) {
    try {
      await new Promise<void>((resolve, reject) => {
        const process = spawn(candidate.command, candidate.args, { stdio: ["pipe", "ignore", "ignore"] });
        process.on("error", reject);
        process.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${candidate.command} exited with code ${code}`)));
        process.stdin.end(text);
      });
      return candidate.command;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`No clipboard command configured for ${platform()}`);
}

function getAgentConfigDir(): string {
  return process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseHerdrSurface(value: unknown): HerdrSurface | undefined {
  if (!isRecord(value) || typeof value.paneId !== "string" || value.paneId.trim() === "") return undefined;
  if (value.tabId !== undefined && (typeof value.tabId !== "string" || value.tabId.trim() === "")) return undefined;
  return { paneId: value.paneId, ...(typeof value.tabId === "string" ? { tabId: value.tabId } : {}) };
}

function parseStoredSubagent(value: unknown): StoredSubagent | null {
  if (!isRecord(value)) return null;
  const state = value.state;
  const updatedAt = value.updatedAt;
  const surface = value.surface === undefined ? undefined : parseHerdrSurface(value.surface);
  if (
    typeof value.id !== "string" || value.id.trim() === "" ||
    typeof value.task !== "string" || value.task.trim() === "" ||
    typeof value.sessionFile !== "string" || value.sessionFile.trim() === "" ||
    typeof value.cwd !== "string" || value.cwd.trim() === "" ||
    (state !== "running" && state !== "settled") ||
    typeof updatedAt !== "number" ||
    !Number.isFinite(updatedAt) ||
    (value.model !== undefined && typeof value.model !== "string") ||
    (value.launchScriptFile !== undefined && typeof value.launchScriptFile !== "string") ||
    (value.surface !== undefined && surface === undefined)
  ) return null;

  return {
    id: value.id,
    task: value.task,
    sessionFile: value.sessionFile,
    cwd: value.cwd,
    ...(typeof value.model === "string" ? { model: value.model } : {}),
    ...(typeof value.launchScriptFile === "string" ? { launchScriptFile: value.launchScriptFile } : {}),
    ...(surface ? { surface } : {}),
    state,
    updatedAt,
  };
}

function restoreStoredSubagents(ctx: ExtensionContext): void {
  storedSubagents.clear();
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type !== "custom" || entry.customType !== "herdr-subagent") continue;
    const record = parseStoredSubagent(entry.data);
    if (record) storedSubagents.set(record.id, record);
  }
}

function persistSubagent(pi: ExtensionAPI, running: RunningSubagent, state: StoredSubagentState): void {
  const record: StoredSubagent = {
    id: running.id,
    task: running.task,
    sessionFile: running.sessionFile,
    cwd: running.cwd,
    ...(running.model ? { model: running.model } : {}),
    ...(running.launchScriptFile ? { launchScriptFile: running.launchScriptFile } : {}),
    surface: running.surface,
    state,
    updatedAt: Date.now(),
  };
  pi.appendEntry("herdr-subagent", record);
  storedSubagents.set(record.id, record);
}

function resolveSubagentPaths(params: SubagentParamsType, ctxCwd: string, cwdOverride?: string): { effectiveCwd: string; localAgentDir: string | null; effectiveAgentDir: string } {
  const rawCwd = params.cwd ?? cwdOverride ?? null;
  const effectiveCwd = rawCwd ? (rawCwd.startsWith("/") ? rawCwd : join(ctxCwd, rawCwd)) : ctxCwd;
  const localAgentDir = join(effectiveCwd, ".pi", "agent");
  const effectiveAgentDir = existsSync(localAgentDir) ? localAgentDir : getAgentConfigDir();
  return { effectiveCwd, localAgentDir: existsSync(localAgentDir) ? localAgentDir : null, effectiveAgentDir };
}

function getDefaultSessionDirFor(cwd: string, agentDir: string): string {
  const safePath = `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
  const sessionDir = join(agentDir, "sessions", safePath);
  mkdirSync(sessionDir, { recursive: true });
  return sessionDir;
}

function getArtifactDir(sessionDir: string, sessionId: string): string {
  return join(sessionDir, "artifacts", sessionId);
}

function buildSubagentToolAllowlist(activeTools: readonly string[]): string {
  return [...new Set(activeTools)].join(",");
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

function formatElapsedMMSS(startTime: number): string {
  const seconds = Math.floor((Date.now() - startTime) / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

const ACCENT = "\x1b[38;2;77;163;255m";
const RST = "\x1b[0m";

function borderLine(left: string, right: string, width: number): string {
  if (width <= 0) return "";
  if (width === 1) return `${ACCENT}│${RST}`;
  const contentWidth = Math.max(0, width - 2);
  const rightVis = visibleWidth(right);
  if (rightVis >= contentWidth) {
    const truncRight = truncateToWidth(right, contentWidth);
    return `${ACCENT}│${RST}${truncRight}${" ".repeat(Math.max(0, contentWidth - visibleWidth(truncRight)))}${ACCENT}│${RST}`;
  }
  const truncLeft = truncateToWidth(left, Math.max(0, contentWidth - rightVis));
  const pad = Math.max(0, contentWidth - visibleWidth(truncLeft) - rightVis);
  return `${ACCENT}│${RST}${truncLeft}${" ".repeat(pad)}${right}${ACCENT}│${RST}`;
}

function borderTop(title: string, info: string, width: number): string {
  if (width <= 0) return "";
  if (width === 1) return `${ACCENT}╭${RST}`;
  const inner = Math.max(0, width - 2);
  const titlePart = `─ ${title} `;
  const infoPart = ` ${info} ─`;
  const fill = "─".repeat(Math.max(0, inner - titlePart.length - infoPart.length));
  const content = `${titlePart}${fill}${infoPart}`.slice(0, inner).padEnd(inner, "─");
  return `${ACCENT}╭${content}╮${RST}`;
}

function borderBottom(width: number): string {
  if (width <= 0) return "";
  if (width === 1) return `${ACCENT}╰${RST}`;
  return `${ACCENT}╰${"─".repeat(Math.max(0, width - 2))}╯${RST}`;
}

function formatWidgetRightLabel(snapshot: StatusSnapshot): string {
  if (snapshot.kind === "starting") return " starting… ";
  if (snapshot.kind === "running") return ` running ${snapshot.elapsedText} `;
  if (snapshot.kind === "active") {
    const label = snapshot.activityLabel ?? snapshot.activeScope;
    const duration = snapshot.activeDurationText ? ` ${snapshot.activeDurationText}` : "";
    return label ? ` active · ${label}${duration} ` : " active ";
  }
  if (snapshot.kind === "waiting") {
    const duration = snapshot.waitingDurationText ? ` ${snapshot.waitingDurationText}` : "";
    const detail = snapshot.statusLabel ? ` · ${snapshot.statusLabel}` : "";
    return ` waiting${duration}${detail} `;
  }
  const detail = snapshot.statusLabel ? ` · ${snapshot.statusLabel}` : "";
  const duration = snapshot.snapshotProblemText ? ` ${snapshot.snapshotProblemText}` : "";
  return ` stalled${detail}${duration} `;
}

function renderSubagentWidgetLines(agents: RunningSubagent[], width: number, selectedId?: string): string[] {
  const snapshots = agents.map((agent) => ({ agent, snapshot: classifyStatus(agent.statusState, Date.now()) }));
  const header = snapshots.map(({ agent, snapshot }) => `${agent.task} ${snapshot.statusLabel ?? snapshot.kind}`).join(" · ");
  const lines = [borderTop("Subagents", header, width)];
  for (const { agent, snapshot } of snapshots) {
    const elapsed = formatElapsedMMSS(agent.startTime);
    const marker = agent.id === selectedId ? "▸" : " ";
    const left = `${marker} ${elapsed}  ${agent.task} `;
    lines.push(borderLine(left, statusConfig.enabled ? formatWidgetRightLabel(snapshot) : " running… ", width));
  }
  lines.push(borderBottom(width));
  return lines;
}

function updateWidget(): void {
  if (!runtimeAlive || !latestCtx) return;
  try {
    if (!latestCtx.hasUI) return;
  } catch {
    latestCtx = null;
    runtimeAlive = false;
    return;
  }
  try {
    if (agentsSelectorOpen) {
      latestCtx.ui.setWidget("herdr-subagent-status", undefined);
      return;
    }
    if (runningSubagents.size === 0) {
      latestCtx.ui.setWidget("herdr-subagent-status", undefined);
      if (widgetInterval) {
        clearInterval(widgetInterval);
        widgetInterval = null;
        extensionGlobalState.widgetInterval = null;
      }
      return;
    }
    latestCtx.ui.setWidget(
      "herdr-subagent-status",
      () => ({
        invalidate() {},
        render(width: number) {
          return renderSubagentWidgetLines(Array.from(runningSubagents.values()), width);
        },
      }),
      { placement: "aboveEditor" },
    );
  } catch {
    latestCtx = null;
    runtimeAlive = false;
  }
}

function activityLabel(activity: SubagentActivityState): string | undefined {
  if (activity.phase !== "active") return undefined;
  if (activity.activeScope === "tool") return activity.toolName ?? "tool";
  if (activity.activeScope === "provider") return "provider";
  if (activity.activeScope === "streaming") return "streaming";
  return activity.activeScope;
}

function observeRunningSubagent(running: RunningSubagent, observedAt = Date.now()): void {
  const activityFile = running.activityFile;
  const read: ActivityReadResult = activityFile ? readSubagentActivityFile(activityFile, running.id) : { ok: false, reason: "missing" };
  running.activityRead = read.ok ? { ok: true } : { ok: false, reason: read.reason, error: read.error };
  if (read.ok) {
    running.activity = read.activity;
    running.statusState = observeStatus(running.statusState, {
      snapshot: "present",
      updatedAt: read.activity.updatedAt,
      sequence: read.activity.sequence,
      phase: read.activity.phase,
      active: read.activity.phase === "active",
      activeScope: read.activity.activeScope,
      activeSince: read.activity.activeSince,
      waitingSince: read.activity.waitingSince,
      latestEvent: read.activity.latestEvent,
      activityLabel: activityLabel(read.activity),
    }, observedAt);
    return;
  }
  running.statusState = observeStatus(running.statusState, { snapshot: read.reason, snapshotError: read.error }, observedAt);
}

function startWidgetRefresh(): void {
  if (!runtimeAlive || widgetInterval) return;
  updateWidget();
  widgetInterval = setInterval(updateWidget, 1000);
  extensionGlobalState.widgetInterval = widgetInterval;
}

function startStatusRefresh(pi: ExtensionAPI): void {
  if (!runtimeAlive || !statusConfig.enabled || statusInterval) return;
  statusInterval = setInterval(() => {
    if (runningSubagents.size === 0) {
      if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
        extensionGlobalState.statusInterval = null;
      }
      return;
    }
    const transitionLines: string[] = [];
    const now = Date.now();
    let shouldRefreshWidget = false;
    for (const running of runningSubagents.values()) {
      observeRunningSubagent(running, now);
      const { nextState, snapshot, transition } = advanceStatusState(running.statusState, now);
      if (nextState.currentKind !== running.statusState.currentKind) shouldRefreshWidget = true;
      running.statusState = nextState;
      if (transition) transitionLines.push(formatTransitionLine(running.task, snapshot, transition));
    }
    if (shouldRefreshWidget) updateWidget();
    if (runtimeAlive && transitionLines.length > 0) {
      const capped = capStatusLines(transitionLines, statusConfig.lineLimit);
      pi.sendMessage({
        customType: "subagent_status",
        content: formatStatusAggregate(transitionLines, statusConfig.lineLimit),
        display: true,
        details: { lines: capped.visibleLines, overflow: capped.overflow },
      }, { triggerTurn: true, deliverAs: "steer" });
    }
  }, 1000);
  extensionGlobalState.statusInterval = statusInterval;
}

function muxUnavailableResult() {
  return {
    content: [{ type: "text" as const, text: `Subagents require Herdr. ${herdrSetupHint()}` }],
    details: { error: "herdr not available" },
    isError: true,
  };
}

function requireLaunchParams(params: SubagentParamsType, stored?: StoredSubagent): { task: string; prompt: string } | { error: string } {
  const task = params.task?.trim() ?? stored?.task;
  if (!task) return { error: "action=start requires task." };
  if (!params.prompt?.trim()) return { error: "action=start/resume requires prompt." };
  return { task, prompt: params.prompt };
}

async function launchSubagent(params: SubagentParamsType, ctx: ExtensionContext, pi: ExtensionAPI, stored?: StoredSubagent): Promise<RunningSubagent> {
  if (!runtimeAlive) throw new Error("Cannot launch a subagent while the parent session is shutting down.");
  if (stored && runningSubagents.has(stored.id)) throw new Error(`Subagent "${stored.task}" is already running.`);

  const required = requireLaunchParams(params, stored);
  if ("error" in required) throw new Error(required.error);

  const startTime = Date.now();
  const id = stored?.id ?? randomUUID();
  const parentSessionFile = ctx.sessionManager.getSessionFile();
  if (!parentSessionFile) throw new Error("No session file. Start pi with a persistent session to use subagents.");

  const { effectiveCwd, localAgentDir, effectiveAgentDir } = resolveSubagentPaths(params, ctx.cwd, stored?.cwd);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23) + "Z";
  const uuid = randomUUID();
  const subagentSessionFile = stored?.sessionFile ?? join(getDefaultSessionDirFor(effectiveCwd, effectiveAgentDir), `${timestamp}_${uuid}.jsonl`);
  if (stored) clearSubagentExitSidecar(subagentSessionFile);
  if (!stored && params.fork) {
    seedSubagentSessionFile({ parentSessionFile, childSessionFile: subagentSessionFile, childCwd: effectiveCwd });
  }

  const artifactDir = getArtifactDir(ctx.sessionManager.getSessionDir(), ctx.sessionManager.getSessionId());
  mkdirSync(artifactDir, { recursive: true });
  const activityFile = getSubagentActivityFile(artifactDir, id);
  mkdirSync(dirname(activityFile), { recursive: true });

  const fullTask = `Complete the task autonomously. The parent will deliver your result and close this surface on its next input or shutdown.\n\n${required.prompt}\n\nYour final assistant message should summarize what you accomplished.`;
  const taskSlug = required.task.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "subagent";
  const effectiveModel = params.model ?? stored?.model;
  const piArgs = ["--session", subagentSessionFile, "-e", join(EXTENSION_DIR, "child.ts"), "--tools", buildSubagentToolAllowlist(pi.getActiveTools())];
  if (effectiveModel) piArgs.push("--model", effectiveModel);

  let taskArg = fullTask;
  if (!params.fork || stored) {
    const taskPath = join(artifactDir, "context", `${taskSlug}-${Date.now()}.md`);
    mkdirSync(dirname(taskPath), { recursive: true });
    writeFileSync(taskPath, fullTask, "utf8");
    taskArg = `@${taskPath}`;
  }
  let launchScriptFile = stored?.launchScriptFile;
  let surface: HerdrSurface;
  if (stored?.surface && await surfaceExists(stored.surface)) {
    await sendPrompt(stored.surface, taskArg);
    surface = stored.surface;
  } else {
    piArgs.push(taskArg);
    launchScriptFile = join(artifactDir, "subagent-scripts", `${taskSlug}-${id}.sh`);
    mkdirSync(dirname(launchScriptFile), { recursive: true });
    writeFileSync(
      launchScriptFile,
      [
        "#!/bin/bash",
        `# Generated: ${new Date().toISOString()}`,
        `cd ${shellEscape(effectiveCwd)}`,
        `pi ${piArgs.map(shellEscape).join(" ")}`,
        "code=$?",
        "echo \"__SUBAGENT_DONE_${code}__\"",
        "exit $code",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );

    const env: Record<string, string> = {
      PI_SUBAGENT_CHILD: "1",
      PI_SUBAGENT_TASK: required.task,
      PI_SUBAGENT_SESSION: subagentSessionFile,
      PI_SUBAGENT_ID: id,
      PI_SUBAGENT_ACTIVITY_FILE: activityFile,
    };
    if (localAgentDir) env.PI_CODING_AGENT_DIR = localAgentDir;
    else if (process.env.PI_CODING_AGENT_DIR) env.PI_CODING_AGENT_DIR = process.env.PI_CODING_AGENT_DIR;

    surface = await createAgentSurface({
      label: required.task,
      cwd: effectiveCwd,
      env,
      command: "bash",
      args: [launchScriptFile],
      signal: getModuleAbortSignal(),
    });
  }
  const running: RunningSubagent = {
    id,
    task: required.task,
    cwd: effectiveCwd,
    ...(effectiveModel ? { model: effectiveModel } : {}),
    surface,
    startTime,
    sessionFile: subagentSessionFile,
    launchScriptFile,
    activityFile,
    statusState: createStatusState({ source: "pi", startTimeMs: startTime }),
  };
  runningSubagents.set(id, running);
  return running;
}

function resolveTarget(params: { id?: string; task?: string }): { running: RunningSubagent } | { error: string } {
  if (params.id?.trim()) {
    const running = runningSubagents.get(params.id.trim());
    return running ? { running } : { error: `No running subagent with id "${params.id}".` };
  }
  if (!params.task?.trim()) return { error: "Provide a running subagent id or exact task summary." };
  const task = params.task.trim();
  const matches = [...runningSubagents.values()].filter((running) => running.task === task);
  if (matches.length === 1) return { running: matches[0] };
  if (matches.length === 0) return { error: `No running subagent with task "${task}".` };
  return { error: `Ambiguous task "${task}". Matches: ${matches.map((running) => `${running.task} [${running.id}]`).join(", ")}` };
}

function snapshotFor(running: RunningSubagent): Record<string, unknown> {
  observeRunningSubagent(running);
  const status = classifyStatus(running.statusState, Date.now());
  return {
    id: running.id,
    task: running.task,
    status: status.kind,
    elapsed: status.elapsedText,
    paneId: running.surface.paneId,
    tabId: running.surface.tabId,
    sessionFile: running.sessionFile,
    launchScriptFile: running.launchScriptFile,
    activityFile: running.activityFile,
    activity: running.activity,
    activityRead: running.activityRead,
  };
}

function handleList() {
  const rows = [...runningSubagents.values()].map((running) => snapshotFor(running));
  if (rows.length === 0) return { content: [{ type: "text" as const, text: "No running subagents." }], details: { subagents: [] } };
  const lines = rows.map((row) => `• ${row.task} [${row.id}] — ${row.status}, ${row.elapsed}`);
  return { content: [{ type: "text" as const, text: lines.join("\n") }], details: { subagents: rows } };
}

function handleStatus(params: SubagentParamsType) {
  if (!params.id && !params.task) return handleList();
  const resolved = resolveTarget(params);
  if ("error" in resolved) return { content: [{ type: "text" as const, text: resolved.error }], details: { error: resolved.error }, isError: true };
  const status = snapshotFor(resolved.running);
  return { content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }], details: { subagent: status } };
}

async function handleInterrupt(params: SubagentParamsType) {
  const resolved = resolveTarget(params);
  if ("error" in resolved) return { content: [{ type: "text" as const, text: resolved.error }], details: { error: resolved.error }, isError: true };
  await sendEscape(resolved.running.surface);
  resolved.running.statusState = forceStatusAfterInterrupt(resolved.running.statusState, Date.now());
  updateWidget();
  return {
    content: [{ type: "text" as const, text: `Interrupt requested for subagent "${resolved.running.task}".` }],
    details: { id: resolved.running.id, task: resolved.running.task, action: "interrupt", status: "interrupt_requested" },
  };
}

function resolveResultPresentation(result: SubagentResult): string {
  const sessionRef = result.sessionFile ? `\n\nSession: ${result.sessionFile}\nResume: pi --session ${result.sessionFile}` : "";
  if (result.errorMessage) {
    return `Sub-agent "${result.task}" [${result.id}] failed after ${formatElapsed(result.elapsed)} (provider/agent error).\n\nError: ${result.errorMessage}${sessionRef}`;
  }
  return result.exitCode !== 0
    ? `Sub-agent "${result.task}" [${result.id}] failed (exit code ${result.exitCode}).\n\n${result.summary}${sessionRef}`
    : `Sub-agent "${result.task}" [${result.id}] completed (${formatElapsed(result.elapsed)}).\n\n${result.summary}${sessionRef}`;
}

async function watchSubagent(running: RunningSubagent, signal: AbortSignal): Promise<SubagentResult | null> {
  const { task, surface, startTime, sessionFile } = running;
  try {
    const result = await pollForExit(surface, AbortSignal.any([signal, getModuleAbortSignal()]), {
      interval: 1000,
      sessionFile,
      onTick: () => observeRunningSubagent(running),
      existsSync,
      readFileSync,
      rmSync,
    });
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const summary = existsSync(sessionFile)
      ? findLastAssistantMessage(getNewEntries(sessionFile, 0)) ?? (result.errorMessage ? `Subagent error: ${result.errorMessage}` : result.exitCode !== 0 ? `Sub-agent exited with code ${result.exitCode}` : "Sub-agent exited without output")
      : result.errorMessage ? `Subagent error: ${result.errorMessage}` : result.exitCode !== 0 ? `Sub-agent exited with code ${result.exitCode}` : "Sub-agent exited without output";
    if (result.reason === "settled") {
      running.settledAt = Date.now();
    } else {
      await closeSurface(surface);
      runningSubagents.delete(running.id);
    }
    return { id: running.id, task, summary, sessionFile, exitCode: result.exitCode, elapsed, ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}) };
  } catch (error: unknown) {
    const moduleWasAborted = getModuleAbortSignal().aborted;
    if (!moduleWasAborted && !running.removed) await closeSurface(surface);
    runningSubagents.delete(running.id);
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    if (moduleWasAborted || running.removed) return null;
    if (signal.aborted) return { id: running.id, task, summary: "Subagent cancelled.", sessionFile, exitCode: 1, elapsed, error: "cancelled" };
    const message = describeError(error);
    return { id: running.id, task, summary: `Subagent error: ${message}`, exitCode: 1, elapsed, error: message, sessionFile };
  }
}

async function closeSettledSubagent(running: RunningSubagent): Promise<void> {
  if (!running.settledAt || runningSubagents.get(running.id) !== running) return;
  running.removed = true;
  running.abortController?.abort();
  runningSubagents.delete(running.id);
  await closeSurface(running.surface);
  updateWidget();
}

async function closeSettledSubagents(): Promise<void> {
  for (const running of runningSubagents.values()) {
    if (running.settledAt) continue;
    observeRunningSubagent(running);
    if (running.activity?.phase === "done") running.settledAt = Date.now();
  }
  await Promise.all([...runningSubagents.values()].filter((running) => running.settledAt).map(closeSettledSubagent));
}

async function enqueueLaunch<T>(launch: () => Promise<T>): Promise<T> {
  const previous = launchQueue;
  let release: () => void = () => {};
  launchQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => {});
  try {
    return await launch();
  } finally {
    release();
  }
}

async function removeRunningSubagent(running: RunningSubagent): Promise<void> {
  running.removed = true;
  running.abortController?.abort();
  runningSubagents.delete(running.id);
  await closeSurface(running.surface);
  updateWidget();
}

async function handleRemove(params: SubagentParamsType) {
  const resolved = resolveTarget(params);
  if ("error" in resolved) return { content: [{ type: "text" as const, text: resolved.error }], details: { error: resolved.error }, isError: true };
  const running = resolved.running;
  await removeRunningSubagent(running);
  return {
    content: [{ type: "text" as const, text: `Removed subagent "${running.task}" and closed its tab.` }],
    details: { id: running.id, task: running.task, action: "remove", status: "removed" },
  };
}

async function launchAndWatch(params: SubagentParamsType, ctx: ExtensionContext, pi: ExtensionAPI, stored?: StoredSubagent) {
  let running: RunningSubagent;
  try {
    running = await enqueueLaunch(() => launchSubagent(params, ctx, pi, stored));
  } catch (error: unknown) {
    const message = describeError(error);
    return {
      content: [{ type: "text" as const, text: `Failed to launch subagent: ${message}` }],
      details: { action: stored ? "resume" : "start", error: message, status: "launch_failed" },
      isError: true,
    };
  }
  try {
    persistSubagent(pi, running, "running");
  } catch (error: unknown) {
    await removeRunningSubagent(running);
    const message = describeError(error);
    return {
      content: [{ type: "text" as const, text: `Failed to persist subagent: ${message}` }],
      details: { action: stored ? "resume" : "start", error: message, status: "launch_failed" },
      isError: true,
    };
  }

  const watcherAbort = new AbortController();
  running.abortController = watcherAbort;
  startWidgetRefresh();
  startStatusRefresh(pi);

  let watcherTask: Promise<void>;
  watcherTask = watchSubagent(running, watcherAbort.signal)
    .then((result) => {
      updateWidget();
      if (!result || !runtimeAlive) return;
      if (running.settledAt) persistSubagent(pi, running, "settled");
      const presentation = resolveResultPresentation(result);
      pi.sendMessage({
        customType: "subagent_result",
        content: presentation,
        display: true,
        details: {
          id: result.id,
          task: running.task,
          exitCode: result.exitCode,
          elapsed: result.elapsed,
          sessionFile: result.sessionFile,
          ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
        },
      }, { triggerTurn: true, deliverAs: "steer" });
    })
    .catch((error: unknown) => {
      updateWidget();
      if (!runtimeAlive) return;
      const message = describeError(error);
      pi.sendMessage({
        customType: "subagent_result",
        content: `Sub-agent "${running.task}" error: ${message}`,
        display: true,
        details: { task: running.task, error: message },
      }, { triggerTurn: true, deliverAs: "steer" });
    })
    .then(
      () => {
        watcherTasks.delete(watcherTask);
      },
      (_error: unknown) => {
        watcherTasks.delete(watcherTask);
        if (runtimeAlive) console.error("Subagent watcher failed while delivering its result.");
      },
    );
  watcherTasks.add(watcherTask);

  return {
    content: [{ type: "text" as const, text: `Sub-agent "${running.task}" ${stored ? "resumed" : "launched"} in Herdr and is running in the background. Results will be delivered automatically as a steer message; do not poll or invent results.` }],
    details: { action: stored ? "resume" : "start", id: running.id, task: running.task, sessionFile: running.sessionFile, paneId: running.surface.paneId, tabId: running.surface.tabId, launchScriptFile: running.launchScriptFile, status: "started" },
  };
}

async function handleStart(params: SubagentParamsType, ctx: ExtensionContext, pi: ExtensionAPI) {
  const required = requireLaunchParams(params);
  if ("error" in required) return { content: [{ type: "text" as const, text: required.error }], details: { error: required.error }, isError: true };
  if (!isHerdrAvailable()) return muxUnavailableResult();
  return launchAndWatch(params, ctx, pi);
}

async function handleResume(params: SubagentParamsType, ctx: ExtensionContext, pi: ExtensionAPI) {
  if (!params.id?.trim()) return { content: [{ type: "text" as const, text: "action=resume requires id." }], details: { error: "action=resume requires id." }, isError: true };
  const stored = storedSubagents.get(params.id.trim());
  if (!stored) return { content: [{ type: "text" as const, text: `No durable subagent with id "${params.id}".` }], details: { error: "subagent not found" }, isError: true };
  if (runningSubagents.has(stored.id)) return { content: [{ type: "text" as const, text: `Subagent "${stored.task}" is already running.` }], details: { error: "subagent already running" }, isError: true };
  const required = requireLaunchParams(params, stored);
  if ("error" in required) return { content: [{ type: "text" as const, text: required.error }], details: { error: required.error }, isError: true };
  if (!isHerdrAvailable()) return muxUnavailableResult();
  return launchAndWatch(params, ctx, pi, stored);
}

class AgentsSelector {
  private selectedIndex = 0;
  private busy = false;

  constructor(
    private readonly list: () => RunningSubagent[],
    private readonly focus: (running: RunningSubagent) => Promise<void>,
    private readonly kill: (running: RunningSubagent) => Promise<void>,
    private readonly refresh: () => void,
    private readonly done: () => void,
  ) {}

  private agents(): RunningSubagent[] {
    return this.list();
  }

  private selected(): RunningSubagent | undefined {
    const agents = this.agents();
    if (agents.length === 0) return undefined;
    this.selectedIndex = Math.min(this.selectedIndex, agents.length - 1);
    return agents[this.selectedIndex];
  }

  handleInput(data: string): void {
    if (this.busy) return;
    if (matchesKey(data, "escape")) {
      this.done();
      return;
    }

    const agents = this.agents();
    if (matchesKey(data, "up")) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      return;
    }
    if (matchesKey(data, "down")) {
      this.selectedIndex = Math.min(Math.max(0, agents.length - 1), this.selectedIndex + 1);
      return;
    }

    const selected = this.selected();
    if (!selected) {
      if (matchesKey(data, "return")) this.done();
      return;
    }

    if (matchesKey(data, "return")) {
      this.busy = true;
      void this.focus(selected)
        .then(() => this.done())
        .catch(() => { this.busy = false; });
      return;
    }

    if (data === "k" || data === "x") {
      this.busy = true;
      void this.kill(selected)
        .then(() => {
          this.busy = false;
          this.selectedIndex = Math.max(0, this.selectedIndex - (this.selected() ? 0 : 1));
          this.refresh();
        })
        .catch(() => { this.busy = false; });
    }
  }

  render(width: number): string[] {
    const agents = this.agents();
    if (agents.length === 0) {
      return [truncateToWidth("No running agents.", width), "", truncateToWidth("Esc close", width)];
    }
    const selected = this.selected();
    return [
      ...renderSubagentWidgetLines(agents, width, selected?.id),
      truncateToWidth("↑↓ select  Enter switch  k/x kill  Esc close", width),
    ];
  }

  invalidate(): void {}
}

export default function herdrSubagentsExtension(pi: ExtensionAPI): void {
  if (process.env.PI_SUBAGENT_CHILD === "1") return;

  pi.on("session_start", (_event, ctx) => {
    latestCtx = ctx;
    runtimeAlive = true;
    restoreStoredSubagents(ctx);
  });

  pi.on("input", async () => {
    await closeSettledSubagents();
  });

  pi.on("session_shutdown", async () => {
    agentsSelectorOpen = false;
    runtimeAlive = false;
    latestCtx = null;
    launchQueue = Promise.resolve();
    if (widgetInterval) clearInterval(widgetInterval);
    if (statusInterval) clearInterval(statusInterval);
    widgetInterval = null;
    statusInterval = null;
    extensionGlobalState.widgetInterval = null;
    extensionGlobalState.statusInterval = null;
    extensionGlobalState.pollAbort.abort();
    const agents = [...runningSubagents.values()];
    for (const agent of agents) {
      agent.removed = true;
      agent.abortController?.abort();
    }
    runningSubagents.clear();
    await Promise.all(agents.map((agent) => closeSurface(agent.surface)));
    await Promise.allSettled([...watcherTasks]);
    watcherTasks.clear();
  });

  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description:
      "Manage async Herdr-backed subagents. Each child runs in its own named Herdr tab. Use action=start with a short task summary and full prompt to launch background work; use action=resume with an id and follow-up prompt to continue a durable child session; action=interrupt sends Escape; action=remove closes a child; action=list/status only for inspection. Results are delivered automatically as steer messages. Do not poll after starting a subagent.",
    promptSnippet:
      "Manage async Herdr-backed subagents. Start with subagent({ action: 'start', task, prompt, ... }); use task as a short summary and prompt for the full mandate. Use subagent({ action: 'resume', id, prompt }) to continue a durable child session. Use id for later control. Results arrive automatically; do not poll or invent them.",
    parameters: SubagentParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      switch (params.action) {
        case "start": return await handleStart(params, ctx, pi);
        case "interrupt": return await handleInterrupt(params);
        case "list": return handleList();
        case "status": return handleStatus(params);
        case "remove": return await handleRemove(params);
        case "resume": return await handleResume(params, ctx, pi);
        default: return { content: [{ type: "text" as const, text: `Unknown subagent action: ${params.action}` }], details: { error: "unknown action" }, isError: true };
      }
    },
    renderCall(args, theme) {
      const action = typeof args.action === "string" ? args.action : "start";
      const task = typeof args.task === "string" && args.task ? args.task : typeof args.id === "string" ? args.id : "subagent";
      return new Text("▸ " + theme.fg("toolTitle", theme.bold(task)) + theme.fg("dim", ` — ${action}`), 0, 0);
    },
    renderResult(result, _opts, theme) {
      const details = isRecord(result.details) ? result.details : {};
      const task = typeof details.task === "string" ? details.task : typeof details.id === "string" ? details.id : "subagent";
      if (details.status === "started") {
        return new Text(theme.fg("accent", "▸") + " " + theme.fg("toolTitle", theme.bold(task)) + theme.fg("dim", " — started"), 0, 0);
      }
      if (details.status === "interrupt_requested") {
        return new Text(theme.fg("accent", "▸") + " " + theme.fg("toolTitle", theme.bold(task)) + theme.fg("dim", " — interrupt requested"), 0, 0);
      }
      if (details.status === "removed") {
        return new Text(theme.fg("accent", "▸") + " " + theme.fg("toolTitle", theme.bold(task)) + theme.fg("dim", " — removed"), 0, 0);
      }
      const text = typeof result.content[0]?.text === "string" ? result.content[0].text : "";
      return new Text(theme.fg("dim", text), 0, 0);
    },
  });

  pi.registerCommand("agents", {
    description: "Browse running subagents, switch to one, or kill one",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        const result = handleList();
        pi.sendMessage({ customType: "subagent_status", content: result.content[0]?.text ?? "No running agents.", display: true });
        return;
      }
      agentsSelectorOpen = true;
      updateWidget();
      try {
        await ctx.ui.custom<void>((tui, _theme, _keybindings, done) => new AgentsSelector(
        () => [...runningSubagents.values()],
        async (running) => {
          try {
            await focusSurface(running.surface);
          } catch (error) {
            if (ctx.hasUI) ctx.ui.notify(`Could not focus ${running.task}: ${error instanceof Error ? error.message : String(error)}`, "error");
            throw error;
          }
        },
        async (running) => {
          if (ctx.hasUI && !(await ctx.ui.confirm("Kill subagent?", `${running.task} [${running.id}]`))) return;
          await removeRunningSubagent(running);
        },
        () => tui.requestRender(),
        done,
        ));
      } finally {
        agentsSelectorOpen = false;
        updateWidget();
      }
    },
  });

  pi.registerCommand("id", {
    description: "Copy the current Pi and Herdr identifiers",
    handler: async (_args, ctx) => {
      const identifiers = [
        `pi-session=${ctx.sessionManager.getSessionId()}`,
        `pi-file=${ctx.sessionManager.getSessionFile() ?? "ephemeral"}`,
        `herdr-workspace=${process.env.HERDR_WORKSPACE_ID ?? "none"}`,
        `herdr-tab=${process.env.HERDR_TAB_ID ?? "none"}`,
        `herdr-pane=${process.env.HERDR_PANE_ID ?? "none"}`,
      ].join(" ");
      try {
        const clipboard = await copyToClipboard(identifiers);
        if (ctx.hasUI) ctx.ui.notify(`Copied identifiers via ${clipboard}`, "success");
        else console.log(identifiers);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (ctx.hasUI) ctx.ui.notify(`Failed to copy identifiers: ${message}\n${identifiers}`, "error");
        else console.log(identifiers);
      }
    },
  });

  pi.registerMessageRenderer("subagent_result", (message, options, theme) => ({
    render(width: number): string[] {
      const details = isRecord(message.details) ? message.details : {};
      const task = typeof details.task === "string" ? details.task : "subagent";
      const exitCode = typeof details.exitCode === "number" ? details.exitCode : 0;
      const errorMessage = typeof details.errorMessage === "string" ? details.errorMessage : "";
      const failed = exitCode !== 0 || !!errorMessage;
      const elapsed = typeof details.elapsed === "number" ? formatElapsed(details.elapsed) : "?";
      const icon = failed ? theme.fg("error", "✗") : theme.fg("success", "✓");
      const status = errorMessage ? "failed (provider/agent error)" : failed ? `failed (exit ${exitCode})` : "completed";
      const header = `${icon} ${theme.fg("toolTitle", theme.bold(task))} ${theme.fg("dim", "—")} ${status} ${theme.fg("dim", `(${elapsed})`)}`;
      const rawContent = typeof message.content === "string" ? message.content : "";
      const summary = rawContent
        .replace(/\n\nSession: .+\nResume: .+$/, "")
        .replace(new RegExp(`^Sub-agent "${task.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" \\[.+?\\] completed \\(${elapsed}\\)\\.\\n\\n`), "")
        .replace(new RegExp(`^Sub-agent "${task.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" \\[.+?\\] failed \\(exit code ${exitCode}\\)\\.\\n\\n`), "");
      const contentLines = [header];
      if (options.expanded) {
        if (summary) contentLines.push(...summary.split("\n").map((line) => line.slice(0, Math.max(0, width - 6))));
        if (typeof details.sessionFile === "string") {
          contentLines.push("", theme.fg("dim", `Session: ${details.sessionFile}`), theme.fg("dim", `Resume:  pi --session ${details.sessionFile}`));
        }
      } else {
        if (summary) {
          const previewLines = summary.split("\n").slice(0, 5);
          contentLines.push(...previewLines.map((line) => theme.fg("dim", line.slice(0, Math.max(0, width - 6)))));
          const totalLines = summary.split("\n").length;
          if (totalLines > 5) contentLines.push(theme.fg("muted", `… ${totalLines - 5} more lines`));
        }
        contentLines.push(theme.fg("muted", keyHint("app.tools.expand", "to expand")));
      }
      const box = new Box(1, 1, (text: string) => theme.bg(failed ? "toolErrorBg" : "toolSuccessBg", text));
      box.addChild(new Text(contentLines.join("\n"), 0, 0));
      return ["", ...box.render(width)];
    },
  }));

  pi.registerMessageRenderer("subagent_status", (message, options, theme) => ({
    render(width: number): string[] {
      const details = isRecord(message.details) ? message.details : {};
      const lines = Array.isArray(details.lines) ? details.lines.filter((line): line is string => typeof line === "string") : [];
      const overflow = typeof details.overflow === "number" ? details.overflow : 0;
      const lineWidth = Math.max(0, width - 6);
      const contentLines = [
        `${theme.fg("accent", "•")} ${theme.fg("toolTitle", theme.bold(typeof details.title === "string" ? details.title : "Subagent status"))}`, 
        ...lines.map((line: string) => theme.fg("dim", truncateToWidth(line, lineWidth))),
      ];
      if (overflow > 0) contentLines.push(theme.fg("muted", `+${overflow} more running.`));
      if (!options.expanded) contentLines.push(theme.fg("muted", keyHint("app.tools.expand", "to expand")));
      const box = new Box(1, 1, (text: string) => theme.bg("customMessageBg", text));
      box.addChild(new Text(contentLines.join("\n"), 0, 0));
      return ["", ...box.render(width)];
    },
  }));
}
