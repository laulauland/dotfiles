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

interface RunningMonitor extends MonitorRecord {
  process: ChildProcessWithoutNullStreams;
  matcher: (line: string) => boolean;
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
  const { process: _process, matcher: _matcher, ...record } = monitor;
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

function handleLine(
  monitor: RunningMonitor,
  rawLine: string,
  source: "stdout" | "stderr",
  pi: ExtensionAPI,
): void {
  const line = truncateLine(rawLine);
  monitor.totalLines += 1;
  monitor.lastLine = line;
  if (!monitor.matcher(line)) return;
  if (monitor.matchedEvents >= monitor.maxEvents) return;

  monitor.matchedEvents += 1;
  monitor.lastMatch = line;
  safeSendMessage(
    pi,
    {
      customType: "monitor_event",
      content: `Monitor "${monitor.name}" matched ${source}:\n\n${line}`,
      display: true,
      details: {
        id: monitor.id,
        name: monitor.name,
        command: monitor.command,
        cwd: monitor.cwd,
        source,
        line,
        matchedEvents: monitor.matchedEvents,
        totalLines: monitor.totalLines,
      },
    },
    { triggerTurn: true, deliverAs: "steer" },
  );
}

export function startMonitor(params: MonitorStartParams, pi: ExtensionAPI): MonitorRecord {
  const id = makeId();
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
  };
  monitors.set(id, monitor);

  const buffers = { stdout: "", stderr: "" };
  child.stdout.on("data", (chunk: Buffer) => appendChunk({ monitor, chunk, source: "stdout", buffers, pi }));
  child.stderr.on("data", (chunk: Buffer) => {
    if (includeStderr) appendChunk({ monitor, chunk, source: "stderr", buffers, pi });
  });
  child.on("close", (code, signal) => {
    if (buffers.stdout) handleLine(monitor, buffers.stdout, "stdout", pi);
    if (includeStderr && buffers.stderr) handleLine(monitor, buffers.stderr, "stderr", pi);
    monitor.exited = { code, signal, at: Date.now() };
    monitors.delete(id);
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
    monitor.exited = { code: 1, signal: null, at: Date.now() };
    monitors.delete(id);
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

export function stopMonitor(params: { id?: string; name?: string }): MonitorRecord | null {
  const monitor = resolveTarget(params);
  if (!monitor) return null;
  monitor.process.kill("SIGTERM");
  return publicRecord(monitor);
}

export function stopAllMonitors(): void {
  for (const monitor of monitors.values()) {
    monitor.process.kill("SIGTERM");
  }
  monitors.clear();
}
