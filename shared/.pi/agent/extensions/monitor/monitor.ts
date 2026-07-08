import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";

export interface MonitorStartParams {
  name?: string;
  command: string;
  cwd: string;
  filter?: string;
  regex?: boolean;
  includeStderr?: boolean;
  notifyOnExit?: boolean;
  maxEvents?: number;
}

export interface MonitorRecord {
  id: string;
  name: string;
  command: string;
  cwd: string;
  filter: string | null;
  regex: boolean;
  includeStderr: boolean;
  notifyOnExit: boolean;
  maxEvents: number;
  startTime: number;
  matchedEvents: number;
  totalLines: number;
  lastLine?: string;
  lastMatch?: string;
  exited?: {
    code: number | null;
    signal: NodeJS.Signals | null;
    at: number;
  };
}

interface MonitorEvent {
  source: "stdout" | "stderr";
  line: string;
  matchedEvents: number;
  totalLines: number;
}

interface RunningMonitor extends MonitorRecord {
  process: ChildProcessWithoutNullStreams;
  matcher: (line: string) => boolean;
  pendingEvents: MonitorEvent[];
  pendingFlush: ReturnType<typeof setTimeout> | null;
}

export interface MonitorToolParams {
  action: "start" | "list" | "status" | "stop";
  id?: string;
  name?: string;
  command?: string;
  cwd?: string;
  filter?: string;
  regex?: boolean;
  includeStderr?: boolean;
  notifyOnExit?: boolean;
  maxEvents?: number;
}

const monitors = new Map<string, RunningMonitor>();
const suppressedMonitorIds = new Set<string>();
const changeListeners = new Set<() => void>();

function emitMonitorChange(): void {
  for (const listener of changeListeners) {
    try {
      listener();
    } catch {
      // Ignore stale UI listeners; monitor notifications are best-effort.
    }
  }
}

export function onMonitorChange(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

function makeId(): string {
  return randomBytes(4).toString("hex");
}

function truncateLine(line: string, maxLength = 4000): string {
  if (line.length <= maxLength) return line;
  return `${line.slice(0, maxLength)}… [truncated ${line.length - maxLength} chars]`;
}

function compileMatcher(filter: string | undefined, regex: boolean): (line: string) => boolean {
  if (!filter || filter.length === 0) return () => true;
  if (!regex) return (line) => line.includes(filter);
  const expression = new RegExp(filter);
  return (line) => expression.test(line);
}

function publicRecord(monitor: RunningMonitor): MonitorRecord {
  const {
    process: _process,
    matcher: _matcher,
    pendingEvents: _pendingEvents,
    pendingFlush: _pendingFlush,
    ...record
  } = monitor;
  return record;
}

function resolveTarget(params: { id?: string; name?: string }): RunningMonitor | null {
  if (params.id?.trim()) return monitors.get(params.id.trim()) ?? null;
  if (!params.name?.trim()) return null;
  const matches = [...monitors.values()].filter((monitor) => monitor.name === params.name!.trim());
  return matches.length === 1 ? matches[0] : null;
}

function appendChunk(params: {
  monitor: RunningMonitor;
  chunk: Buffer;
  source: "stdout" | "stderr";
  buffers: { stdout: string; stderr: string };
  pi: ExtensionAPI;
}): void {
  const key = params.source;
  params.buffers[key] += params.chunk.toString("utf8");
  const lines = params.buffers[key].split(/\r?\n/);
  params.buffers[key] = lines.pop() ?? "";
  for (const rawLine of lines) handleLine(params.monitor, rawLine, params.source, params.pi);
}

function safeSendMessage(
  pi: ExtensionAPI,
  message: Parameters<ExtensionAPI["sendMessage"]>[0],
  options: Parameters<ExtensionAPI["sendMessage"]>[1],
): void {
  try {
    pi.sendMessage(message, options);
  } catch {
    // The parent Pi runtime may have exited/reloaded while the monitor process was closing.
  }
}

function isMonitorActive(monitor: RunningMonitor): boolean {
  return monitors.get(monitor.id) === monitor;
}

function clearPendingWake(monitor: RunningMonitor): void {
  if (monitor.pendingFlush) clearTimeout(monitor.pendingFlush);
  monitor.pendingFlush = null;
  monitor.pendingEvents = [];
}

function formatMonitorEventBatch(monitor: RunningMonitor, events: MonitorEvent[]): string {
  if (events.length === 1) {
    const event = events[0];
    if (!event) return `Monitor "${monitor.name}" matched output.`;
    return `Monitor "${monitor.name}" matched ${event.source}:\n\n${event.line}`;
  }

  const lines = events.map((event) => `[${event.source}] ${event.line}`);
  return `Monitor "${monitor.name}" matched ${events.length} lines:\n\n${lines.join("\n")}`;
}

function flushPendingEvents(monitor: RunningMonitor, pi: ExtensionAPI): void {
  if (monitor.pendingFlush) clearTimeout(monitor.pendingFlush);
  monitor.pendingFlush = null;

  if (!isMonitorActive(monitor)) {
    clearPendingWake(monitor);
    return;
  }

  const events = monitor.pendingEvents;
  monitor.pendingEvents = [];
  if (events.length === 0) return;

  const lastEvent = events.at(-1);
  safeSendMessage(
    pi,
    {
      customType: "monitor_event",
      content: formatMonitorEventBatch(monitor, events),
      display: false,
      details: {
        id: monitor.id,
        name: monitor.name,
        command: monitor.command,
        cwd: monitor.cwd,
        source: lastEvent?.source ?? "output",
        line: lastEvent?.line ?? "",
        events,
        eventCount: events.length,
        matchedEvents: monitor.matchedEvents,
        totalLines: monitor.totalLines,
      },
    },
    { triggerTurn: true, deliverAs: "steer" },
  );
}

function schedulePendingEventFlush(monitor: RunningMonitor, pi: ExtensionAPI): void {
  if (monitor.pendingFlush) return;
  monitor.pendingFlush = setTimeout(() => flushPendingEvents(monitor, pi), 250);
}

function handleLine(
  monitor: RunningMonitor,
  rawLine: string,
  source: "stdout" | "stderr",
  pi: ExtensionAPI,
): void {
  if (!isMonitorActive(monitor)) return;

  const line = truncateLine(rawLine);
  monitor.totalLines += 1;
  monitor.lastLine = line;
  if (!monitor.matcher(line)) return;
  if (monitor.matchedEvents >= monitor.maxEvents) return;

  monitor.matchedEvents += 1;
  monitor.lastMatch = line;
  monitor.pendingEvents.push({
    source,
    line,
    matchedEvents: monitor.matchedEvents,
    totalLines: monitor.totalLines,
  });
  schedulePendingEventFlush(monitor, pi);
  emitMonitorChange();
}

export function startMonitor(params: MonitorStartParams, pi: ExtensionAPI): MonitorRecord {
  const id = makeId();
  suppressedMonitorIds.delete(id);
  const name = params.name?.trim() || `monitor-${id}`;
  const regex = params.regex ?? false;
  const includeStderr = params.includeStderr ?? true;
  const notifyOnExit = params.notifyOnExit ?? true;
  const maxEvents = Math.max(1, Math.min(params.maxEvents ?? 100, 1000));
  const matcher = compileMatcher(params.filter, regex);
  const child = spawn(params.command, {
    cwd: params.cwd,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  const monitor: RunningMonitor = {
    id,
    name,
    command: params.command,
    cwd: params.cwd,
    filter: params.filter ?? null,
    regex,
    includeStderr,
    notifyOnExit,
    maxEvents,
    startTime: Date.now(),
    matchedEvents: 0,
    totalLines: 0,
    process: child,
    matcher,
    pendingEvents: [],
    pendingFlush: null,
  };
  monitors.set(id, monitor);
  emitMonitorChange();

  const buffers = { stdout: "", stderr: "" };
  child.stdout.on("data", (chunk: Buffer) => appendChunk({ monitor, chunk, source: "stdout", buffers, pi }));
  child.stderr.on("data", (chunk: Buffer) => {
    if (includeStderr) appendChunk({ monitor, chunk, source: "stderr", buffers, pi });
  });
  child.on("close", (code, signal) => {
    if (!isMonitorActive(monitor)) return;

    if (buffers.stdout) handleLine(monitor, buffers.stdout, "stdout", pi);
    if (includeStderr && buffers.stderr) handleLine(monitor, buffers.stderr, "stderr", pi);
    flushPendingEvents(monitor, pi);
    monitor.exited = { code, signal, at: Date.now() };
    monitors.delete(id);
    emitMonitorChange();
    if (notifyOnExit) {
      safeSendMessage(
        pi,
        {
          customType: "monitor_exit",
          content: `Monitor "${monitor.name}" exited with ${signal ? `signal ${signal}` : `code ${code ?? "unknown"}`}.`,
          display: true,
          details: publicRecord(monitor),
        },
        { triggerTurn: true, deliverAs: "steer" },
      );
    }
  });
  child.on("error", (error) => {
    if (!isMonitorActive(monitor)) return;

    clearPendingWake(monitor);
    monitor.exited = { code: 1, signal: null, at: Date.now() };
    monitors.delete(id);
    emitMonitorChange();
    safeSendMessage(
      pi,
      {
        customType: "monitor_exit",
        content: `Monitor "${monitor.name}" failed to start: ${error.message}`,
        display: true,
        details: { ...publicRecord(monitor), error: error.message },
      },
      { triggerTurn: true, deliverAs: "steer" },
    );
  });

  return publicRecord(monitor);
}

export function listMonitors(): MonitorRecord[] {
  return [...monitors.values()].map(publicRecord);
}

export function getMonitor(params: { id?: string; name?: string }): MonitorRecord | null {
  const monitor = resolveTarget(params);
  return monitor ? publicRecord(monitor) : null;
}

export function isSuppressedMonitorId(id: string): boolean {
  return suppressedMonitorIds.has(id);
}

export function stopMonitor(params: { id?: string; name?: string }): MonitorRecord | null {
  const monitor = resolveTarget(params);
  if (!monitor) return null;
  const record = publicRecord(monitor);
  monitors.delete(monitor.id);
  suppressedMonitorIds.add(monitor.id);
  clearPendingWake(monitor);
  monitor.process.kill("SIGTERM");
  emitMonitorChange();
  return record;
}

export function stopAllMonitors(): void {
  for (const monitor of monitors.values()) {
    suppressedMonitorIds.add(monitor.id);
    clearPendingWake(monitor);
    monitor.process.kill("SIGTERM");
  }
  monitors.clear();
  emitMonitorChange();
}
