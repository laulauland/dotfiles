import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { keyHint } from "@earendil-works/pi-coding-agent";
import { Box, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAgentSurface,
  closeSurface,
  herdrSetupHint,
  isHerdrAvailable,
  pollForExit,
  sendEscape,
  type HerdrSurface,
} from "./herdr.ts";
import { getSubagentActivityFile, readSubagentActivityFile, type ActivityReadResult, type SubagentActivityState } from "./activity.ts";
import { findLastAssistantMessage, getNewEntries, seedSubagentSessionFile } from "./session.ts";
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
const WIDGET_INTERVAL_KEY = Symbol.for("herdr-subagents/widget-interval");
const STATUS_INTERVAL_KEY = Symbol.for("herdr-subagents/status-interval");
const POLL_ABORT_KEY = Symbol.for("herdr-subagents/poll-abort-controller");

{
  const prevWidgetInterval = (globalThis as any)[WIDGET_INTERVAL_KEY];
  if (prevWidgetInterval) clearInterval(prevWidgetInterval);
  const prevStatusInterval = (globalThis as any)[STATUS_INTERVAL_KEY];
  if (prevStatusInterval) clearInterval(prevStatusInterval);
  const prevAbort = (globalThis as any)[POLL_ABORT_KEY] as AbortController | undefined;
  if (prevAbort) prevAbort.abort();
  (globalThis as any)[WIDGET_INTERVAL_KEY] = null;
  (globalThis as any)[STATUS_INTERVAL_KEY] = null;
  (globalThis as any)[POLL_ABORT_KEY] = new AbortController();
}

function getModuleAbortSignal(): AbortSignal {
  return ((globalThis as any)[POLL_ABORT_KEY] as AbortController).signal;
}

const SubagentAction = Type.Union([
  Type.Literal("start"),
  Type.Literal("interrupt"),
  Type.Literal("list"),
  Type.Literal("status"),
]);

const SubagentParams = Type.Object({
  action: SubagentAction,
  id: Type.Optional(Type.String({ description: "Running subagent id for interrupt/status" })),
  name: Type.Optional(Type.String({ description: "Display name for start, or exact running subagent name for interrupt/status" })),
  task: Type.Optional(Type.String({ description: "Task/prompt for action=start" })),
  agent: Type.Optional(Type.String({ description: "Optional agent definition name from .pi/agents or ~/.pi/agent/agents" })),
  systemPrompt: Type.Optional(Type.String({ description: "Role instructions appended to the child task, or used as child system prompt when the agent definition requests it" })),
  model: Type.Optional(Type.String({ description: "Model override for the child Pi session" })),
  skills: Type.Optional(Type.String({ description: "Comma-separated skill names to send as /skill prompts" })),
  tools: Type.Optional(Type.String({ description: "Comma-separated Pi tool allowlist for the child" })),
  cwd: Type.Optional(Type.String({ description: "Working directory for the child" })),
  fork: Type.Optional(Type.Boolean({ description: "Start from a fork of the current session history" })),
  interactive: Type.Optional(Type.Boolean({ description: "When true, treat the child as user-driven and suppress parent wakeups for stall/recovery status transitions" })),
  autoExit: Type.Optional(Type.Boolean({ description: "When true, the child session shuts down automatically after its next completed agent turn. Bare starts default to true; interactive starts default to false." })),
  placement: Type.Optional(Type.Union([
    Type.Literal("stack"),
    Type.Literal("tab"),
    Type.Literal("split"),
  ], { description: "Herdr placement for action=start. 'stack' creates the first child as a right split and later children as downward splits from the subagent column (default); 'tab' opens each child in its own no-focus tab; 'split' opens a right split in the parent tab." })),
});

type SubagentParamsType = typeof SubagentParams.static;
type SubagentSessionMode = "standalone" | "lineage-only" | "fork";
type HerdrPlacement = "stack" | "tab" | "split";
type AgentSource = "global" | "project";

interface AgentDefaults {
  model?: string;
  tools?: string;
  skills?: string;
  thinking?: string;
  denyTools?: string;
  spawning?: boolean;
  autoExit?: boolean;
  interactive?: boolean;
  systemPromptMode?: "append" | "replace";
  sessionMode?: SubagentSessionMode;
  cwd?: string;
  body?: string;
  description?: string;
  disableModelInvocation?: boolean;
}

interface ListedAgentDefinition extends AgentDefaults {
  name: string;
  source: AgentSource;
}

interface RunningSubagent {
  id: string;
  name: string;
  task: string;
  agent?: string;
  surface: HerdrSurface;
  startTime: number;
  sessionFile: string;
  launchScriptFile?: string;
  activityFile?: string;
  activity?: SubagentActivityState;
  activityRead?: { ok: boolean; reason?: "missing" | "invalid" | "wrong-id"; error?: string };
  abortController?: AbortController;
  statusState: SubagentStatusState;
  interactive: boolean;
}

interface SubagentResult {
  name: string;
  task: string;
  summary: string;
  sessionFile?: string;
  exitCode: number;
  elapsed: number;
  error?: string;
  errorMessage?: string;
}

const SPAWNING_TOOLS = new Set(["subagent"]);
const SUBAGENT_CONTROL_TOOLS = ["subagent_done"] as const;
const runningSubagents = new Map<string, RunningSubagent>();
const statusConfig = loadStatusConfig();

let latestCtx: ExtensionContext | null = null;
let runtimeAlive = false;
let launchQueue: Promise<void> = Promise.resolve();
let widgetInterval: ReturnType<typeof setInterval> | null = null;
let statusInterval: ReturnType<typeof setInterval> | null = null;

function shellEscape(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function getAgentConfigDir(): string {
  return process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
}

function getFrontmatterValue(frontmatter: string, key: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match ? match[1].trim() : undefined;
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  return value == null ? undefined : value.toLowerCase() === "true";
}

function parseSessionMode(value: string | undefined): SubagentSessionMode | undefined {
  return value === "standalone" || value === "lineage-only" || value === "fork" ? value : undefined;
}

function parseAgentDefinition(content: string, fallbackName: string): AgentDefaults & { name: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const frontmatter = match[1];
  const body = content.replace(/^---\n[\s\S]*?\n---\n*/, "").trim();
  const systemPromptMode = getFrontmatterValue(frontmatter, "system-prompt");
  return {
    name: getFrontmatterValue(frontmatter, "name") ?? fallbackName,
    description: getFrontmatterValue(frontmatter, "description"),
    model: getFrontmatterValue(frontmatter, "model"),
    tools: getFrontmatterValue(frontmatter, "tools"),
    skills: getFrontmatterValue(frontmatter, "skill") ?? getFrontmatterValue(frontmatter, "skills"),
    thinking: getFrontmatterValue(frontmatter, "thinking"),
    denyTools: getFrontmatterValue(frontmatter, "deny-tools"),
    spawning: parseOptionalBoolean(getFrontmatterValue(frontmatter, "spawning")),
    autoExit: parseOptionalBoolean(getFrontmatterValue(frontmatter, "auto-exit")),
    interactive: parseOptionalBoolean(getFrontmatterValue(frontmatter, "interactive")),
    sessionMode: parseSessionMode(getFrontmatterValue(frontmatter, "session-mode")),
    cwd: getFrontmatterValue(frontmatter, "cwd"),
    systemPromptMode: systemPromptMode === "replace" || systemPromptMode === "append" ? systemPromptMode : undefined,
    body: body || undefined,
    disableModelInvocation: getFrontmatterValue(frontmatter, "disable-model-invocation")?.toLowerCase() === "true",
  };
}

function discoverAgentDefinitions(cwd = process.cwd()): ListedAgentDefinition[] {
  const agents = new Map<string, ListedAgentDefinition>();
  const dirs: Array<{ path: string; source: AgentSource }> = [
    { path: join(getAgentConfigDir(), "agents"), source: "global" },
    { path: join(cwd, ".pi", "agents"), source: "project" },
  ];
  for (const { path: dir, source } of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((entry) => entry.endsWith(".md"))) {
      const parsed = parseAgentDefinition(readFileSync(join(dir, file), "utf8"), file.replace(/\.md$/, ""));
      if (parsed) agents.set(parsed.name, { ...parsed, source });
    }
  }
  return [...agents.values()];
}

function loadAgentDefaults(agentName: string, cwd = process.cwd()): AgentDefaults | null {
  for (const path of [join(cwd, ".pi", "agents", `${agentName}.md`), join(getAgentConfigDir(), "agents", `${agentName}.md`)]) {
    if (!existsSync(path)) continue;
    const parsed = parseAgentDefinition(readFileSync(path, "utf8"), agentName);
    if (parsed) return parsed;
  }
  return null;
}

function resolveDenyTools(agentDefs: AgentDefaults | null): Set<string> {
  const denied = new Set<string>();
  if (!agentDefs) return denied;
  if (agentDefs.spawning === false) for (const tool of SPAWNING_TOOLS) denied.add(tool);
  if (agentDefs.denyTools) {
    for (const tool of agentDefs.denyTools.split(",").map((value) => value.trim()).filter(Boolean)) denied.add(tool);
  }
  return denied;
}

function resolveEffectiveAutoExit(params: SubagentParamsType, agentDefs: AgentDefaults | null): boolean {
  if (params.autoExit != null) return params.autoExit;
  if (agentDefs?.autoExit != null) return agentDefs.autoExit;
  if (params.interactive === true || agentDefs?.interactive === true) return false;
  return true;
}

function resolveEffectiveInteractive(params: SubagentParamsType, agentDefs: AgentDefaults | null, effectiveAutoExit: boolean): boolean {
  if (params.interactive != null) return params.interactive;
  if (agentDefs?.interactive != null) return agentDefs.interactive;
  return !effectiveAutoExit;
}

function resolveEffectiveSessionMode(params: SubagentParamsType, agentDefs: AgentDefaults | null): SubagentSessionMode {
  if (params.fork) return "fork";
  return agentDefs?.sessionMode ?? "standalone";
}

function resolveHerdrPlacement(params: SubagentParamsType): HerdrPlacement {
  const explicit = params.placement;
  if (explicit === "stack" || explicit === "tab" || explicit === "split") return explicit;
  const env = process.env.PI_SUBAGENT_HERDR_PLACEMENT?.trim().toLowerCase();
  if (env === "tab" || env === "split") return env;
  return "stack";
}

function resolveStackSplitTarget(): { splitTargetPaneId?: string; splitDirection?: "right" | "down" } {
  const parentTabId = process.env.HERDR_TAB_ID;
  const stackAgents = [...runningSubagents.values()]
    .filter((agent) => agent.surface.placement === "stack")
    .filter((agent) => !parentTabId || agent.surface.tabId === parentTabId)
    .sort((a, b) => b.startTime - a.startTime);

  const previous = stackAgents[0];
  if (previous) return { splitTargetPaneId: previous.surface.paneId, splitDirection: "down" };
  return { splitTargetPaneId: process.env.HERDR_PANE_ID, splitDirection: "right" };
}

function resolveSubagentPaths(params: SubagentParamsType, agentDefs: AgentDefaults | null, ctxCwd: string): { effectiveCwd: string; localAgentDir: string | null; effectiveAgentDir: string } {
  const rawCwd = params.cwd ?? agentDefs?.cwd ?? null;
  const cwdIsFromAgent = !params.cwd && agentDefs?.cwd != null;
  const cwdBase = cwdIsFromAgent ? getAgentConfigDir() : ctxCwd;
  const effectiveCwd = rawCwd ? (rawCwd.startsWith("/") ? rawCwd : join(cwdBase, rawCwd)) : ctxCwd;
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

function buildSubagentToolAllowlist(effectiveTools?: string): string | null {
  const requested = (effectiveTools ?? "").split(",").map((tool) => tool.trim()).filter(Boolean);
  if (requested.length === 0) return null;
  const allow = new Set(requested);
  for (const tool of SUBAGENT_CONTROL_TOOLS) allow.add(tool);
  return [...allow].join(",");
}

function buildPiPromptArgs(effectiveSkills: string | undefined, taskArg: string): string[] {
  const skillPrompts = (effectiveSkills ?? "").split(",").map((skill) => skill.trim()).filter(Boolean).map((skill) => `/skill:${skill}`);
  return [...skillPrompts, taskArg];
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

function renderSubagentWidgetLines(agents: RunningSubagent[], width: number): string[] {
  const lines = [borderTop("Subagents", `${agents.length} running`, width)];
  for (const agent of agents) {
    const elapsed = formatElapsedMMSS(agent.startTime);
    const agentTag = agent.agent ? ` (${agent.agent})` : "";
    const left = ` ${elapsed}  ${agent.name}${agentTag} `;
    const snapshot = classifyStatus(agent.statusState, Date.now());
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
    if (runningSubagents.size === 0) {
      latestCtx.ui.setWidget("herdr-subagent-status", undefined);
      if (widgetInterval) {
        clearInterval(widgetInterval);
        widgetInterval = null;
        (globalThis as any)[WIDGET_INTERVAL_KEY] = null;
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
  (globalThis as any)[WIDGET_INTERVAL_KEY] = widgetInterval;
}

function startStatusRefresh(pi: ExtensionAPI): void {
  if (!runtimeAlive || !statusConfig.enabled || statusInterval) return;
  statusInterval = setInterval(() => {
    if (runningSubagents.size === 0) {
      if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
        (globalThis as any)[STATUS_INTERVAL_KEY] = null;
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
      if (transition && !running.interactive) transitionLines.push(formatTransitionLine(running.name, snapshot, transition));
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
  (globalThis as any)[STATUS_INTERVAL_KEY] = statusInterval;
}

function muxUnavailableResult() {
  return {
    content: [{ type: "text" as const, text: `Subagents require Herdr. ${herdrSetupHint()}` }],
    details: { error: "herdr not available" },
    isError: true,
  };
}

function requireStartParams(params: SubagentParamsType): { name: string; task: string } | { error: string } {
  if (!params.name?.trim()) return { error: "action=start requires name." };
  if (!params.task?.trim()) return { error: "action=start requires task." };
  return { name: params.name.trim(), task: params.task };
}

async function launchSubagent(params: SubagentParamsType, ctx: ExtensionContext): Promise<RunningSubagent> {
  const required = requireStartParams(params);
  if ("error" in required) throw new Error(required.error);

  const startTime = Date.now();
  const id = Math.random().toString(16).slice(2, 10);
  const agentDefs = params.agent ? loadAgentDefaults(params.agent, ctx.cwd) : null;
  const effectiveModel = params.model ?? agentDefs?.model;
  const effectiveTools = params.tools ?? agentDefs?.tools;
  const effectiveSkills = params.skills ?? agentDefs?.skills;
  const effectiveThinking = agentDefs?.thinking;
  const effectiveAutoExit = resolveEffectiveAutoExit(params, agentDefs);
  const effectiveInteractive = resolveEffectiveInteractive(params, agentDefs, effectiveAutoExit);
  const sessionFile = ctx.sessionManager.getSessionFile();
  if (!sessionFile) throw new Error("No session file. Start pi with a persistent session to use subagents.");

  const { effectiveCwd, localAgentDir, effectiveAgentDir } = resolveSubagentPaths(params, agentDefs, ctx.cwd);
  const targetSessionDir = getDefaultSessionDirFor(effectiveCwd, effectiveAgentDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23) + "Z";
  const uuid = [id, Math.random().toString(16).slice(2, 10), Math.random().toString(16).slice(2, 10), Math.random().toString(16).slice(2, 6)].join("-");
  const subagentSessionFile = join(targetSessionDir, `${timestamp}_${uuid}.jsonl`);
  const sessionMode = resolveEffectiveSessionMode(params, agentDefs);
  if (sessionMode !== "standalone") {
    seedSubagentSessionFile({ mode: sessionMode, parentSessionFile: sessionFile, childSessionFile: subagentSessionFile, childCwd: effectiveCwd });
  }

  const artifactDir = getArtifactDir(ctx.sessionManager.getSessionDir(), ctx.sessionManager.getSessionId());
  mkdirSync(artifactDir, { recursive: true });
  const activityFile = getSubagentActivityFile(artifactDir, id);
  mkdirSync(dirname(activityFile), { recursive: true });

  const inheritsConversationContext = sessionMode === "fork";
  const modeHint = effectiveAutoExit
    ? "Complete your task autonomously. The harness will close this session after your next completed turn."
    : "Complete your task. When finished, call the subagent_done tool. The user can interact with you at any time.";
  const summaryInstruction = effectiveAutoExit
    ? "Your FINAL assistant message should summarize what you accomplished."
    : "Your FINAL assistant message before calling subagent_done should summarize what you accomplished.";
  const identity = agentDefs?.body ?? params.systemPrompt ?? null;
  const identityInSystemPrompt = !!(agentDefs?.systemPromptMode && identity);
  const roleBlock = identity && !identityInSystemPrompt ? `\n\n${identity}` : "";
  const fullTask = inheritsConversationContext ? required.task : `${roleBlock}\n\n${modeHint}\n\n${required.task}\n\n${summaryInstruction}`;

  const piArgs = ["--session", subagentSessionFile, "-e", join(EXTENSION_DIR, "child.ts")];
  if (effectiveModel) piArgs.push("--model", effectiveThinking ? `${effectiveModel}:${effectiveThinking}` : effectiveModel);
  if (identityInSystemPrompt && identity) {
    const systemPromptPath = join(artifactDir, "context", `${required.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "subagent"}-system.md`);
    mkdirSync(dirname(systemPromptPath), { recursive: true });
    writeFileSync(systemPromptPath, identity, "utf8");
    piArgs.push(agentDefs?.systemPromptMode === "replace" ? "--system-prompt" : "--append-system-prompt", systemPromptPath);
  }
  const toolAllowlist = buildSubagentToolAllowlist(effectiveTools);
  if (toolAllowlist) piArgs.push("--tools", toolAllowlist);

  let taskArg = fullTask;
  if (!inheritsConversationContext) {
    const taskPath = join(artifactDir, "context", `${required.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "subagent"}-${Date.now()}.md`);
    mkdirSync(dirname(taskPath), { recursive: true });
    writeFileSync(taskPath, fullTask, "utf8");
    taskArg = `@${taskPath}`;
  }
  piArgs.push(...buildPiPromptArgs(effectiveSkills, taskArg));

  const launchScriptFile = join(artifactDir, "subagent-scripts", `${required.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "subagent"}-${id}.sh`);
  mkdirSync(dirname(launchScriptFile), { recursive: true });
  writeFileSync(
    launchScriptFile,
    [
      "#!/bin/bash",
      `# Herdr subagent launch script for ${required.name}`,
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

  const denySet = resolveDenyTools(agentDefs);
  const env: Record<string, string> = {
    PI_SUBAGENT_CHILD: "1",
    PI_SUBAGENT_NAME: required.name,
    PI_SUBAGENT_SESSION: subagentSessionFile,
    PI_SUBAGENT_ID: id,
    PI_SUBAGENT_ACTIVITY_FILE: activityFile,
  };
  if (params.agent) env.PI_SUBAGENT_AGENT = params.agent;
  if (effectiveAutoExit) env.PI_SUBAGENT_AUTO_EXIT = "1";
  if (denySet.size > 0) env.PI_DENY_TOOLS = [...denySet].join(",");
  if (localAgentDir) env.PI_CODING_AGENT_DIR = localAgentDir;
  else if (process.env.PI_CODING_AGENT_DIR) env.PI_CODING_AGENT_DIR = process.env.PI_CODING_AGENT_DIR;

  const placement = resolveHerdrPlacement(params);
  const stackTarget = placement === "stack" ? resolveStackSplitTarget() : {};
  const surface = await createAgentSurface({ name: required.name, cwd: effectiveCwd, env, command: "bash", args: [launchScriptFile], placement, ...stackTarget });
  const running: RunningSubagent = {
    id,
    name: required.name,
    task: required.task,
    agent: params.agent,
    surface,
    startTime,
    sessionFile: subagentSessionFile,
    launchScriptFile,
    activityFile,
    interactive: effectiveInteractive,
    statusState: createStatusState({ source: "pi", startTimeMs: startTime }),
  };
  runningSubagents.set(id, running);
  return running;
}

function resolveTarget(params: { id?: string; name?: string }): { running: RunningSubagent } | { error: string } {
  if (params.id?.trim()) {
    const running = runningSubagents.get(params.id.trim());
    return running ? { running } : { error: `No running subagent with id "${params.id}".` };
  }
  if (!params.name?.trim()) return { error: "Provide a running subagent id or exact name." };
  const matches = [...runningSubagents.values()].filter((running) => running.name === params.name!.trim());
  if (matches.length === 1) return { running: matches[0] };
  if (matches.length === 0) return { error: `No running subagent named "${params.name}".` };
  return { error: `Ambiguous subagent name "${params.name}". Matches: ${matches.map((running) => `${running.name} [${running.id}]`).join(", ")}` };
}

function snapshotFor(running: RunningSubagent): Record<string, unknown> {
  observeRunningSubagent(running);
  const status = classifyStatus(running.statusState, Date.now());
  return {
    id: running.id,
    name: running.name,
    task: running.task,
    agent: running.agent,
    status: status.kind,
    elapsed: status.elapsedText,
    paneId: running.surface.paneId,
    tabId: running.surface.tabId,
    placement: running.surface.placement,
    sessionFile: running.sessionFile,
    launchScriptFile: running.launchScriptFile,
    activityFile: running.activityFile,
    activity: running.activity,
    activityRead: running.activityRead,
    interactive: running.interactive,
  };
}

function handleList() {
  const rows = [...runningSubagents.values()].map((running) => snapshotFor(running));
  if (rows.length === 0) return { content: [{ type: "text" as const, text: "No running subagents." }], details: { subagents: [] } };
  const lines = rows.map((row: any) => `• ${row.name} [${row.id}] — ${row.status}, ${row.elapsed}${row.agent ? ` (${row.agent})` : ""}`);
  return { content: [{ type: "text" as const, text: lines.join("\n") }], details: { subagents: rows } };
}

function handleStatus(params: SubagentParamsType) {
  if (!params.id && !params.name) return handleList();
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
    content: [{ type: "text" as const, text: `Interrupt requested for subagent "${resolved.running.name}".` }],
    details: { id: resolved.running.id, name: resolved.running.name, action: "interrupt", status: "interrupt_requested" },
  };
}

function resolveResultPresentation(result: SubagentResult, name: string): string {
  const sessionRef = result.sessionFile ? `\n\nSession: ${result.sessionFile}\nResume: pi --session ${result.sessionFile}` : "";
  if (result.errorMessage) {
    return `Sub-agent "${name}" failed after ${formatElapsed(result.elapsed)} (provider/agent error).\n\nError: ${result.errorMessage}${sessionRef}`;
  }
  return result.exitCode !== 0
    ? `Sub-agent "${name}" failed (exit code ${result.exitCode}).\n\n${result.summary}${sessionRef}`
    : `Sub-agent "${name}" completed (${formatElapsed(result.elapsed)}).\n\n${result.summary}${sessionRef}`;
}

async function watchSubagent(running: RunningSubagent, signal: AbortSignal): Promise<SubagentResult> {
  const { name, task, surface, startTime, sessionFile } = running;
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
    await closeSurface(surface);
    runningSubagents.delete(running.id);
    return { name, task, summary, sessionFile, exitCode: result.exitCode, elapsed, ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}) };
  } catch (error: any) {
    await closeSurface(surface);
    runningSubagents.delete(running.id);
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    if (signal.aborted) return { name, task, summary: "Subagent cancelled.", sessionFile, exitCode: 1, elapsed, error: "cancelled" };
    return { name, task, summary: `Subagent error: ${error?.message ?? String(error)}`, exitCode: 1, elapsed, error: error?.message ?? String(error), sessionFile };
  }
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

async function handleStart(params: SubagentParamsType, ctx: ExtensionContext, pi: ExtensionAPI) {
  const required = requireStartParams(params);
  if ("error" in required) return { content: [{ type: "text" as const, text: required.error }], details: { error: required.error }, isError: true };
  if (!isHerdrAvailable()) return muxUnavailableResult();

  const running = await enqueueLaunch(() => launchSubagent(params, ctx));
  const watcherAbort = new AbortController();
  running.abortController = watcherAbort;
  startWidgetRefresh();
  startStatusRefresh(pi);

  watchSubagent(running, watcherAbort.signal)
    .then((result) => {
      updateWidget();
      if (!runtimeAlive) return;
      const presentation = resolveResultPresentation(result, running.name);
      pi.sendMessage({
        customType: "subagent_result",
        content: presentation,
        display: true,
        details: {
          name: running.name,
          task: running.task,
          agent: running.agent,
          exitCode: result.exitCode,
          elapsed: result.elapsed,
          sessionFile: result.sessionFile,
          ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
        },
      }, { triggerTurn: true, deliverAs: "steer" });
    })
    .catch((error) => {
      updateWidget();
      if (!runtimeAlive) return;
      pi.sendMessage({
        customType: "subagent_result",
        content: `Sub-agent "${running.name}" error: ${error?.message ?? String(error)}`,
        display: true,
        details: { name: running.name, task: running.task, error: error?.message },
      }, { triggerTurn: true, deliverAs: "steer" });
    });

  return {
    content: [{ type: "text" as const, text: `Sub-agent "${running.name}" launched in Herdr and is running in the background. Results will be delivered automatically as a steer message; do not poll or invent results.` }],
    details: { action: "start", id: running.id, name: running.name, task: running.task, agent: running.agent, sessionFile: running.sessionFile, paneId: running.surface.paneId, tabId: running.surface.tabId, placement: running.surface.placement, launchScriptFile: running.launchScriptFile, status: "started" },
  };
}

export default function herdrSubagentsExtension(pi: ExtensionAPI): void {
  if (process.env.PI_SUBAGENT_CHILD === "1") return;

  pi.on("session_start", (_event, ctx) => {
    latestCtx = ctx;
    runtimeAlive = true;
  });

  pi.on("session_shutdown", () => {
    runtimeAlive = false;
    latestCtx = null;
    launchQueue = Promise.resolve();
    if (widgetInterval) clearInterval(widgetInterval);
    if (statusInterval) clearInterval(statusInterval);
    widgetInterval = null;
    statusInterval = null;
    (globalThis as any)[WIDGET_INTERVAL_KEY] = null;
    (globalThis as any)[STATUS_INTERVAL_KEY] = null;
    const moduleAbort = (globalThis as any)[POLL_ABORT_KEY] as AbortController | undefined;
    if (moduleAbort) moduleAbort.abort();
    for (const agent of runningSubagents.values()) agent.abortController?.abort();
    runningSubagents.clear();
  });

  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description:
      "Manage async Herdr-backed subagents. Use action=start to launch background work; action=interrupt to send Escape to a running child turn; action=list/status only for user-requested inspection or when you lost a child id. Results are delivered automatically as steer messages. Do not poll with list/status, sleep, tail logs, or fabricate results after starting a subagent.",
    promptSnippet:
      "Manage async Herdr-backed subagents. Use subagent({ action: 'start', name, task, ... }) to launch; subagent({ action: 'interrupt', id }) to cancel the active child turn; subagent({ action: 'list' }) or status only for occasional inspection. Results arrive automatically; do not poll or invent them.",
    parameters: SubagentParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      switch (params.action) {
        case "start": return await handleStart(params, ctx, pi);
        case "interrupt": return await handleInterrupt(params);
        case "list": return handleList();
        case "status": return handleStatus(params);
        default: return { content: [{ type: "text" as const, text: `Unknown subagent action: ${(params as any).action}` }], details: { error: "unknown action" }, isError: true };
      }
    },
    renderCall(args, theme) {
      const action = typeof args.action === "string" ? args.action : "start";
      const name = typeof args.name === "string" && args.name ? args.name : typeof args.id === "string" ? args.id : "subagent";
      const agent = typeof args.agent === "string" && args.agent ? theme.fg("dim", ` (${args.agent})`) : "";
      const task = typeof args.task === "string" ? args.task : "";
      let text = "▸ " + theme.fg("toolTitle", theme.bold(name)) + agent + theme.fg("dim", ` — ${action}`);
      if (task) {
        const firstLine = task.split("\n").find((line) => line.trim()) ?? "";
        if (firstLine) text += "\n" + theme.fg("toolOutput", firstLine.length > 100 ? firstLine.slice(0, 100) + "…" : firstLine);
      }
      return new Text(text, 0, 0);
    },
    renderResult(result, _opts, theme) {
      const details = result.details as any;
      if (details?.status === "started") {
        return new Text(theme.fg("accent", "▸") + " " + theme.fg("toolTitle", theme.bold(details.name ?? "subagent")) + theme.fg("dim", " — started"), 0, 0);
      }
      if (details?.status === "interrupt_requested") {
        return new Text(theme.fg("accent", "▸") + " " + theme.fg("toolTitle", theme.bold(details.name ?? details.id ?? "subagent")) + theme.fg("dim", " — interrupt requested"), 0, 0);
      }
      const text = typeof result.content[0]?.text === "string" ? result.content[0].text : "";
      return new Text(theme.fg("dim", text), 0, 0);
    },
  });

  pi.registerMessageRenderer("subagent_result", (message, options, theme) => ({
    render(width: number): string[] {
      const details = message.details as any;
      const name = details?.name ?? "subagent";
      const exitCode = details?.exitCode ?? 0;
      const errorMessage = typeof details?.errorMessage === "string" ? details.errorMessage : "";
      const failed = exitCode !== 0 || !!errorMessage;
      const elapsed = details?.elapsed != null ? formatElapsed(details.elapsed) : "?";
      const icon = failed ? theme.fg("error", "✗") : theme.fg("success", "✓");
      const status = errorMessage ? "failed (provider/agent error)" : failed ? `failed (exit ${exitCode})` : "completed";
      const agentTag = details?.agent ? theme.fg("dim", ` (${details.agent})`) : "";
      const header = `${icon} ${theme.fg("toolTitle", theme.bold(name))}${agentTag} ${theme.fg("dim", "—")} ${status} ${theme.fg("dim", `(${elapsed})`)}`;
      const rawContent = typeof message.content === "string" ? message.content : "";
      const summary = rawContent
        .replace(/\n\nSession: .+\nResume: .+$/, "")
        .replace(`Sub-agent "${name}" completed (${elapsed}).\n\n`, "")
        .replace(`Sub-agent "${name}" failed (exit code ${exitCode}).\n\n`, "");
      const contentLines = [header];
      if (options.expanded) {
        if (summary) contentLines.push(...summary.split("\n").map((line) => line.slice(0, Math.max(0, width - 6))));
        if (details?.sessionFile) {
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
      const details = message.details as any;
      const lines = Array.isArray(details?.lines) ? details.lines : [];
      const overflow = typeof details?.overflow === "number" ? details.overflow : 0;
      const lineWidth = Math.max(0, width - 6);
      const contentLines = [
        `${theme.fg("accent", "•")} ${theme.fg("toolTitle", theme.bold("Subagent status"))}`,
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
