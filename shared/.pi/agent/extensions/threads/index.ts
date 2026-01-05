/**
 * Thread Search and Reading Extension
 *
 * Provides find_threads and read_thread tools for searching and reading
 * past conversation sessions.
 *
 * Performance optimizations:
 * - ripgrep for full-text search (sub-20ms for typical searches)
 * - Lazy parsing: only parse files that match search criteria
 * - Index caching: cache session metadata to avoid re-parsing headers
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	parseSessionEntries,
	type FileEntry,
	type SessionEntry,
	type SessionHeader,
} from "@mariozechner/pi-coding-agent";
import { Text, Container, Spacer } from "@mariozechner/pi-tui";

// ============================================================================
// Types
// ============================================================================

interface SessionMeta {
	id: string;
	timestamp: string;
	cwd: string;
	filePath: string;
	fileSize: number;
	modifiedAt: Date;
}

interface ThreadSearchResult {
	id: string;
	cwd: string;
	timestamp: string;
	preview: string;
	messageCount: number;
	filePath: string;
	matchCount?: number;
}

interface ThreadContent {
	id: string;
	cwd: string;
	timestamp: string;
	messages: Array<{
		role: string;
		content: string;
		timestamp?: string;
		model?: string;
		toolName?: string;
	}>;
	totalTokens: number;
	totalCost: number;
}

interface FindThreadsDetails {
	threads: ThreadSearchResult[];
	searchTime: number;
	totalSessions: number;
}

interface ReadThreadDetails {
	thread: ThreadContent | null;
	error?: string;
}

// ============================================================================
// Session Index Cache
// ============================================================================

const indexCache = new Map<string, SessionMeta>();

// ============================================================================
// Session Parsing Utilities
// ============================================================================

function getSessionsDir(): string {
	return path.join(os.homedir(), ".pi", "agent", "sessions");
}

function cwdFromDirName(dirName: string): string {
	// Convert --Users-laurynas-fp-Code-project-- to /Users/laurynas-fp/Code/project
	return dirName.replace(/^--/, "/").replace(/--$/, "").replace(/-/g, "/");
}

function loadSessionFile(filePath: string): FileEntry[] {
	const content = fs.readFileSync(filePath, "utf-8");
	return parseSessionEntries(content);
}

function getSessionHeader(entries: FileEntry[]): SessionHeader | null {
	const header = entries.find((e): e is SessionHeader => e.type === "session");
	return header ?? null;
}

function getSessionEntries(entries: FileEntry[]): SessionEntry[] {
	return entries.filter((e): e is SessionEntry => e.type !== "session");
}

function parseSessionHeader(filePath: string): SessionMeta | null {
	const stats = fs.statSync(filePath);
	const cacheKey = `${filePath}:${stats.mtimeMs}`;

	if (indexCache.has(cacheKey)) {
		return indexCache.get(cacheKey)!;
	}

	try {
		const entries = loadSessionFile(filePath);
		const header = getSessionHeader(entries);

		if (!header) return null;

		const meta: SessionMeta = {
			id: header.id,
			timestamp: header.timestamp,
			cwd: header.cwd || cwdFromDirName(path.basename(path.dirname(filePath))),
			filePath,
			fileSize: stats.size,
			modifiedAt: stats.mtime,
		};
		indexCache.set(cacheKey, meta);
		return meta;
	} catch {
		return null;
	}
}

function extractTextContent(content: unknown): string {
	if (typeof content === "string") {
		return content;
	}
	if (Array.isArray(content)) {
		const parts: string[] = [];
		for (const part of content) {
			if (part.type === "text" && part.text) {
				parts.push(part.text);
			} else if (part.type === "toolCall" && part.name) {
				parts.push(`[Tool: ${part.name}]`);
			}
		}
		return parts.join("\n");
	}
	return "";
}

function getFirstUserMessage(entries: SessionEntry[]): string {
	for (const entry of entries) {
		if (entry.type === "message" && entry.message.role === "user") {
			const text = extractTextContent(entry.message.content);
			if (text) {
				return text.slice(0, 200);
			}
		}
	}
	return "(no user message)";
}

function countMessages(entries: SessionEntry[]): number {
	return entries.filter((e) => e.type === "message").length;
}

// ============================================================================
// Search Functions
// ============================================================================

async function searchWithRipgrep(
	exec: (cmd: string, args: string[], opts?: { timeout?: number }) => Promise<{ stdout: string; stderr: string; code: number }>,
	query: string,
	sessionsDir: string,
): Promise<Map<string, number>> {
	const results = new Map<string, number>();

	try {
		const { stdout } = await exec("rg", ["-c", "-i", "--", query, sessionsDir], { timeout: 10000 });

		for (const line of stdout.split("\n")) {
			if (!line.trim()) continue;
			const match = line.match(/^(.+):(\d+)$/);
			if (match) {
				results.set(match[1], parseInt(match[2], 10));
			}
		}
	} catch {
		// Ripgrep returns non-zero if no matches, which is fine
	}

	return results;
}

async function getAllSessions(sessionsDir: string): Promise<string[]> {
	const sessions: string[] = [];

	if (!fs.existsSync(sessionsDir)) return sessions;

	for (const dirEntry of fs.readdirSync(sessionsDir, { withFileTypes: true })) {
		if (!dirEntry.isDirectory() || dirEntry.name.startsWith(".")) continue;

		const dirPath = path.join(sessionsDir, dirEntry.name);
		for (const fileEntry of fs.readdirSync(dirPath, { withFileTypes: true })) {
			if (fileEntry.name.endsWith(".jsonl")) {
				sessions.push(path.join(dirPath, fileEntry.name));
			}
		}
	}

	return sessions;
}

// ============================================================================
// Extension
// ============================================================================

const FindThreadsParams = Type.Object({
	query: Type.Optional(Type.String({ description: "Text to search for in messages (uses ripgrep)" })),
	cwd: Type.Optional(Type.String({ description: "Filter by working directory (partial match)" })),
	limit: Type.Optional(Type.Number({ description: "Maximum results to return (default: 10)", default: 10 })),
	sort: Type.Optional(
		StringEnum(["recent", "oldest", "relevance"] as const, {
			description: "Sort order: recent (default), oldest, or relevance (by match count)",
			default: "recent",
		}),
	),
});

const ReadThreadParams = Type.Object({
	thread_id: Type.String({ description: "Thread ID (session UUID) or file path" }),
	include_tool_results: Type.Optional(
		Type.Boolean({ description: "Include tool call results in output (default: false)", default: false }),
	),
	max_messages: Type.Optional(Type.Number({ description: "Maximum messages to return (default: all)" })),
});

export default function (pi: ExtensionAPI) {
	// ========================================================================
	// find_threads tool
	// ========================================================================
	pi.registerTool<typeof FindThreadsParams, FindThreadsDetails>({
		name: "find_threads",
		label: "Find Threads",
		description:
			"Search through past conversation sessions. Use to find previous discussions, code changes, or decisions. Searches message content using ripgrep for speed.",
		parameters: FindThreadsParams,

		async execute(_toolCallId, params, _onUpdate, _ctx, _signal) {
			const startTime = Date.now();
			const sessionsDir = getSessionsDir();
			const limit = params.limit ?? 10;
			const sort = params.sort ?? "recent";

			let sessionFiles = await getAllSessions(sessionsDir);
			let matchCounts: Map<string, number> | null = null;

			// Filter by query using ripgrep
			if (params.query) {
				matchCounts = await searchWithRipgrep(pi.exec.bind(pi), params.query, sessionsDir);
				sessionFiles = sessionFiles.filter((f) => matchCounts!.has(f));
			}

			// Filter by cwd
			if (params.cwd) {
				const cwdFilter = params.cwd.toLowerCase();
				sessionFiles = sessionFiles.filter((f) => {
					const dirName = path.basename(path.dirname(f));
					const cwd = cwdFromDirName(dirName).toLowerCase();
					return cwd.includes(cwdFilter);
				});
			}

			// Parse headers and build results
			const results: ThreadSearchResult[] = [];
			for (const filePath of sessionFiles) {
				const meta = parseSessionHeader(filePath);
				if (!meta) continue;

				const fileEntries = loadSessionFile(filePath);
				const sessionEntries = getSessionEntries(fileEntries);

				results.push({
					id: meta.id,
					cwd: meta.cwd,
					timestamp: meta.timestamp,
					preview: getFirstUserMessage(sessionEntries),
					messageCount: countMessages(sessionEntries),
					filePath: meta.filePath,
					matchCount: matchCounts?.get(filePath),
				});
			}

			// Sort
			if (sort === "recent") {
				results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
			} else if (sort === "oldest") {
				results.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
			} else if (sort === "relevance" && matchCounts) {
				results.sort((a, b) => (b.matchCount ?? 0) - (a.matchCount ?? 0));
			}

			// Limit
			const limitedResults = results.slice(0, limit);

			const searchTime = Date.now() - startTime;
			const details: FindThreadsDetails = {
				threads: limitedResults,
				searchTime,
				totalSessions: sessionFiles.length,
			};

			// Format text output
			let text = `Found ${results.length} threads`;
			if (params.query) text += ` matching "${params.query}"`;
			if (params.cwd) text += ` in ${params.cwd}`;
			text += ` (${searchTime}ms)\n\n`;

			for (const r of limitedResults) {
				const date = new Date(r.timestamp).toLocaleDateString();
				text += `**${r.id}** (${date})\n`;
				text += `  📁 ${r.cwd}\n`;
				text += `  💬 ${r.messageCount} messages`;
				if (r.matchCount) text += ` | ${r.matchCount} matches`;
				text += `\n  📝 ${r.preview}\n\n`;
			}

			if (results.length > limit) {
				text += `... and ${results.length - limit} more. Use limit parameter to see more.`;
			}

			return {
				content: [{ type: "text", text }],
				details,
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("find_threads"));
			if (args.query) text += " " + theme.fg("accent", `"${args.query}"`);
			if (args.cwd) text += " " + theme.fg("muted", `in ${args.cwd}`);
			if (args.limit) text += " " + theme.fg("dim", `limit:${args.limit}`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const { details } = result;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
			}

			const { threads, searchTime } = details;
			const icon = threads.length > 0 ? theme.fg("success", "✓") : theme.fg("muted", "○");

			if (expanded) {
				const container = new Container();
				container.addChild(
					new Text(
						`${icon} Found ${theme.fg("accent", String(threads.length))} threads (${searchTime}ms)`,
						0,
						0,
					),
				);

				for (const t of threads) {
					container.addChild(new Spacer(1));
					const date = new Date(t.timestamp).toLocaleDateString();
					container.addChild(new Text(theme.fg("accent", t.id) + theme.fg("dim", ` (${date})`), 0, 0));
					container.addChild(new Text(theme.fg("muted", `  📁 ${t.cwd}`), 0, 0));
					container.addChild(
						new Text(
							theme.fg("dim", `  💬 ${t.messageCount} msgs`) +
								(t.matchCount ? theme.fg("warning", ` | ${t.matchCount} matches`) : ""),
							0,
							0,
						),
					);
					const preview = t.preview.length > 80 ? t.preview.slice(0, 80) + "..." : t.preview;
					container.addChild(new Text(theme.fg("toolOutput", `  ${preview}`), 0, 0));
				}
				return container;
			}

			// Collapsed view
			let text = `${icon} Found ${theme.fg("accent", String(threads.length))} threads (${searchTime}ms)`;
			for (const t of threads.slice(0, 3)) {
				const date = new Date(t.timestamp).toLocaleDateString();
				const preview = t.preview.length > 50 ? t.preview.slice(0, 50) + "..." : t.preview;
				text += `\n  ${theme.fg("accent", t.id.slice(0, 8))} ${theme.fg("dim", date)} ${theme.fg("muted", preview)}`;
			}
			if (threads.length > 3) {
				text += `\n  ${theme.fg("muted", `... +${threads.length - 3} more (Ctrl+O to expand)`)}`;
			}
			return new Text(text, 0, 0);
		},
	});

	// ========================================================================
	// read_thread tool
	// ========================================================================
	pi.registerTool<typeof ReadThreadParams, ReadThreadDetails>({
		name: "read_thread",
		label: "Read Thread",
		description:
			"Read a specific conversation thread by ID or file path. Returns the full conversation history with user messages, assistant responses, and optionally tool results.",
		parameters: ReadThreadParams,

		async execute(_toolCallId, params, _onUpdate, _ctx, _signal) {
			const { thread_id, include_tool_results, max_messages } = params;
			const sessionsDir = getSessionsDir();

			// Find the session file
			let filePath: string | null = null;

			if (thread_id.endsWith(".jsonl") || thread_id.startsWith("/")) {
				// Direct file path
				filePath = thread_id;
			} else {
				// Search by UUID
				const allSessions = await getAllSessions(sessionsDir);
				for (const sessionPath of allSessions) {
					if (sessionPath.includes(thread_id)) {
						filePath = sessionPath;
						break;
					}
				}
			}

			if (!filePath || !fs.existsSync(filePath)) {
				return {
					content: [{ type: "text", text: `Thread not found: ${thread_id}` }],
					details: { thread: null, error: "Thread not found" },
					isError: true,
				};
			}

			const fileEntries = loadSessionFile(filePath);
			const header = getSessionHeader(fileEntries);

			if (!header) {
				return {
					content: [{ type: "text", text: `Invalid session file: ${filePath}` }],
					details: { thread: null, error: "Invalid session file" },
					isError: true,
				};
			}

			const sessionEntries = getSessionEntries(fileEntries);

			// Build message list
			const messages: ThreadContent["messages"] = [];
			let totalTokens = 0;
			let totalCost = 0;

			for (const entry of sessionEntries) {
				if (entry.type !== "message") continue;

				const msg = entry.message;
				const role = msg.role;

				// Skip tool results unless requested
				if (role === "toolResult" && !include_tool_results) continue;

				// Extract text content
				const content = extractTextContent(msg.content);
				if (!content.trim()) continue;

				messages.push({
					role,
					content: content.trim(),
					timestamp: entry.timestamp,
					model: "model" in msg ? (msg as any).model : undefined,
					toolName: "toolName" in msg ? (msg as any).toolName : undefined,
				});

				// Accumulate usage
				if ("usage" in msg && msg.usage) {
					const usage = msg.usage as { input?: number; output?: number; cost?: { total?: number } };
					totalTokens += (usage.input || 0) + (usage.output || 0);
					totalCost += usage.cost?.total || 0;
				}
			}

			// Apply max_messages limit
			const limitedMessages = max_messages ? messages.slice(-max_messages) : messages;

			const thread: ThreadContent = {
				id: header.id,
				cwd: header.cwd || cwdFromDirName(path.basename(path.dirname(filePath))),
				timestamp: header.timestamp,
				messages: limitedMessages,
				totalTokens,
				totalCost,
			};

			// Format output
			let text = `## Thread ${thread.id}\n`;
			text += `**Directory:** ${thread.cwd}\n`;
			text += `**Started:** ${new Date(thread.timestamp).toLocaleString()}\n`;
			text += `**Messages:** ${messages.length} | **Tokens:** ${totalTokens.toLocaleString()} | **Cost:** $${totalCost.toFixed(4)}\n\n`;

			if (max_messages && messages.length > max_messages) {
				text += `*Showing last ${max_messages} of ${messages.length} messages*\n\n`;
			}

			text += "---\n\n";

			for (const msg of limitedMessages) {
				const roleIcon = msg.role === "user" ? "👤" : msg.role === "assistant" ? "🤖" : "🔧";
				const roleLabel = msg.role === "toolResult" ? `tool:${msg.toolName}` : msg.role;
				text += `### ${roleIcon} ${roleLabel}\n`;
				if (msg.model) text += `*${msg.model}*\n`;
				text += `\n${msg.content}\n\n`;
			}

			return {
				content: [{ type: "text", text }],
				details: { thread },
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("read_thread"));
			text += " " + theme.fg("accent", args.thread_id.slice(0, 36));
			if (args.include_tool_results) text += " " + theme.fg("dim", "+tools");
			if (args.max_messages) text += " " + theme.fg("dim", `last:${args.max_messages}`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const { details } = result;
			if (!details?.thread) {
				const text = result.content[0];
				return new Text(
					text?.type === "text" ? theme.fg("error", text.text) : theme.fg("error", "(error)"),
					0,
					0,
				);
			}

			const { thread } = details;
			const icon = theme.fg("success", "✓");

			if (expanded) {
				const container = new Container();
				container.addChild(
					new Text(
						`${icon} Thread ${theme.fg("accent", thread.id.slice(0, 8))} (${thread.messages.length} messages)`,
						0,
						0,
					),
				);
				container.addChild(new Text(theme.fg("muted", `📁 ${thread.cwd}`), 0, 0));
				container.addChild(
					new Text(
						theme.fg("dim", `📊 ${thread.totalTokens.toLocaleString()} tokens | $${thread.totalCost.toFixed(4)}`),
						0,
						0,
					),
				);

				for (const msg of thread.messages) {
					container.addChild(new Spacer(1));
					const roleIcon = msg.role === "user" ? "👤" : msg.role === "assistant" ? "🤖" : "🔧";
					const preview = msg.content.length > 200 ? msg.content.slice(0, 200) + "..." : msg.content;
					container.addChild(new Text(`${roleIcon} ${theme.fg("accent", msg.role)}`, 0, 0));
					container.addChild(new Text(theme.fg("toolOutput", preview), 0, 0));
				}
				return container;
			}

			// Collapsed
			let text = `${icon} Thread ${theme.fg("accent", thread.id.slice(0, 8))} (${thread.messages.length} messages)`;
			text += `\n  ${theme.fg("muted", thread.cwd)}`;
			for (const msg of thread.messages.slice(0, 3)) {
				const preview = msg.content.slice(0, 60).replace(/\n/g, " ");
				const roleIcon = msg.role === "user" ? "👤" : msg.role === "assistant" ? "🤖" : "🔧";
				text += `\n  ${roleIcon} ${theme.fg("dim", preview)}${msg.content.length > 60 ? "..." : ""}`;
			}
			if (thread.messages.length > 3) {
				text += `\n  ${theme.fg("muted", `... +${thread.messages.length - 3} more (Ctrl+O to expand)`)}`;
			}
			return new Text(text, 0, 0);
		},
	});
}
