import { appendFileSync, copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

/** Minimal validated shape shared by Pi session entries. */
export interface SessionEntry {
  readonly type: string;
  readonly id: string;
  readonly parentId?: string;
  readonly [key: string]: unknown;
}

/** Validated message entry projection used for child result extraction. */
export interface MessageEntry extends SessionEntry {
  readonly type: "message";
  readonly message: {
    readonly role: "user" | "assistant" | "toolResult";
    readonly stopReason?: "stop" | "length" | "toolUse" | "error" | "aborted";
    readonly errorMessage?: string;
    readonly content: ReadonlyArray<{ readonly type: string; readonly text?: string; readonly [key: string]: unknown }>;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseSessionEntry(value: unknown, lineNumber?: number): SessionEntry {
  if (!isRecord(value) || typeof value.type !== "string" || typeof value.id !== "string") {
    const suffix = lineNumber === undefined ? "" : ` on line ${lineNumber}`;
    throw new Error(`Invalid Pi session entry${suffix}: expected type and id strings.`);
  }
  if (value.parentId !== undefined && typeof value.parentId !== "string") {
    const suffix = lineNumber === undefined ? "" : ` on line ${lineNumber}`;
    throw new Error(`Invalid Pi session entry${suffix}: parentId must be a string when present.`);
  }
  return {
    ...value,
    type: value.type,
    id: value.id,
    ...(typeof value.parentId === "string" ? { parentId: value.parentId } : {}),
  };
}

function parseSessionLine(line: string, lineNumber: number): SessionEntry {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown parse error";
    throw new Error(`Invalid Pi session JSON on line ${lineNumber}: ${detail}`);
  }
  return parseSessionEntry(value, lineNumber);
}

function readSessionEntries(sessionFile: string): SessionEntry[] {
  const raw = readFileSync(sessionFile, "utf8");
  return raw
    .split("\n")
    .flatMap((line, index) => line.trim() ? [parseSessionLine(line, index + 1)] : []);
}

function parseMessageEntry(entry: SessionEntry): MessageEntry | null {
  if (entry.type !== "message" || !isRecord(entry.message)) return null;
  const message = entry.message;
  const role = message.role;
  if (role !== "user" && role !== "assistant" && role !== "toolResult") return null;
  if (!Array.isArray(message.content)) return null;

  const content: Array<{ readonly type: string; readonly text?: string; readonly [key: string]: unknown }> = [];
  for (const rawBlock of message.content) {
    if (!isRecord(rawBlock) || typeof rawBlock.type !== "string") return null;
    if (rawBlock.text !== undefined && typeof rawBlock.text !== "string") return null;
    content.push({
      ...rawBlock,
      type: rawBlock.type,
      ...(typeof rawBlock.text === "string" ? { text: rawBlock.text } : {}),
    });
  }

  const stopReason = message.stopReason;
  if (
    stopReason !== undefined &&
    stopReason !== "stop" &&
    stopReason !== "length" &&
    stopReason !== "toolUse" &&
    stopReason !== "error" &&
    stopReason !== "aborted"
  ) return null;
  if (message.errorMessage !== undefined && typeof message.errorMessage !== "string") return null;

  return {
    ...entry,
    type: "message",
    message: {
      ...message,
      role,
      content,
      ...(typeof stopReason === "string" ? { stopReason } : {}),
      ...(typeof message.errorMessage === "string" ? { errorMessage: message.errorMessage } : {}),
    },
  };
}

/** Remove a prior completion marker before sending a follow-up to a durable child session. */
export function clearSubagentExitSidecar(sessionFile: string): void {
  rmSync(`${sessionFile}.exit`, { force: true });
}

function getForkContentLines(parentSessionFile: string): string[] {
  const entries = readSessionEntries(parentSessionFile);

  let truncateAt = entries.length;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.type === "message" && isRecord(entry.message) && entry.message.role === "user") {
      truncateAt = i;
      break;
    }
  }

  return entries
    .slice(0, truncateAt)
    .filter((entry) => entry.type !== "session")
    .map((entry) => JSON.stringify(entry));
}

/** Seed a child session with the parent history before its current user turn. */
export function seedSubagentSessionFile(params: {
  readonly parentSessionFile: string;
  readonly childSessionFile: string;
  readonly childCwd: string;
}): void {
  const header = {
    type: "session",
    version: 3,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    cwd: params.childCwd,
    parentSession: params.parentSessionFile,
  };
  const lines = [JSON.stringify(header), ...getForkContentLines(params.parentSessionFile)];

  mkdirSync(dirname(params.childSessionFile), { recursive: true });
  writeFileSync(params.childSessionFile, lines.join("\n") + "\n", "utf8");
}

/** Return the id of the last validated entry in a session file. */
export function getLeafId(sessionFile: string): string | null {
  const entries = readSessionEntries(sessionFile);
  return entries.length > 0 ? entries[entries.length - 1]?.id ?? null : null;
}

/** Return validated entries added after `afterLine` (a 1-indexed existing-entry count). */
export function getNewEntries(sessionFile: string, afterLine: number): SessionEntry[] {
  return readSessionEntries(sessionFile).slice(afterLine);
}

/**
 * Find the last assistant message text in a list of validated entries.
 *
 * Falls back to the `errorMessage` field when the last assistant message has
 * `stopReason: "error"` and no usable text content — this happens when
 * auto-retry exhausts on a provider overload / rate limit / server error, and
 * without this fallback the parent would silently see a stale earlier message.
 */
export function findLastAssistantMessage(entries: ReadonlyArray<SessionEntry>): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!entry) continue;
    const messageEntry = parseMessageEntry(entry);
    if (!messageEntry || messageEntry.message.role !== "assistant") continue;

    const texts = messageEntry.message.content
      .filter((block) => block.type === "text" && typeof block.text === "string" && block.text.trim() !== "")
      .flatMap((block) => typeof block.text === "string" ? [block.text] : []);

    if (texts.length > 0 && texts.join("").trim()) return texts.join("\n");

    if (
      messageEntry.message.stopReason === "error" &&
      typeof messageEntry.message.errorMessage === "string" &&
      messageEntry.message.errorMessage.trim() !== ""
    ) {
      return `Subagent error: ${messageEntry.message.errorMessage.trim()}`;
    }
  }
  return null;
}

/** Append a branch summary entry to a session file and return its id. */
export function appendBranchSummary(
  sessionFile: string,
  branchPointId: string,
  fromId: string | null,
  summary: string,
): string {
  const id = randomBytes(4).toString("hex");
  const entry = {
    type: "branch_summary",
    id,
    parentId: branchPointId,
    timestamp: new Date().toISOString(),
    fromId: fromId ?? branchPointId,
    summary,
  };
  appendFileSync(sessionFile, JSON.stringify(entry) + "\n", "utf8");
  return id;
}

/** Copy a session file to a destination directory for worker isolation. */
export function copySessionFile(sessionFile: string, destDir: string): string {
  const id = randomBytes(4).toString("hex");
  const dest = join(destDir, `subagent-${id}.jsonl`);
  copyFileSync(sessionFile, dest);
  return dest;
}

/** Read new entries from a source file and append them to a target file. */
export function mergeNewEntries(
  sourceFile: string,
  targetFile: string,
  afterLine: number,
): SessionEntry[] {
  const entries = getNewEntries(sourceFile, afterLine);
  for (const entry of entries) {
    appendFileSync(targetFile, JSON.stringify(entry) + "\n", "utf8");
  }
  return entries;
}
