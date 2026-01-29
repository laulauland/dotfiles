/**
 * Thread Search and Reading Extension
 *
 * Provides find_threads and search_thread tools for searching and reading
 * past conversation sessions.
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
// Session Parsing Utilities
// ============================================================================

function getSessionsDir(): string {
	return path.join(os.homedir(), ".pi", "agent", "sessions");
}

function loadSessionFile(filePath: string): FileEntry[] {
	const content = fs.readFileSync(filePath, "utf-8");
	return parseSessionEntries(content);
}

function getSessionHeader(entries: FileEntry[]): SessionHeader | null {
	return entries.find((e): e is SessionHeader => e.type === "session") ?? null;
}

function getSessionEntries(entries: FileEntry[]): SessionEntry[] {
	return entries.filter((e): e is SessionEntry => e.type !== "session");
}

function getLeafEntry(entries: SessionEntry[]): SessionEntry | null {
	if (entries.length === 0) return null;

	const parentIds = new Set<string>();
	for (const entry of entries) {
		if ("parentId" in entry && entry.parentId) {
			parentIds.add(entry.parentId);
		}
	}

	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i]!;
		if (!parentIds.has(entry.id)) {
			return entry;
		}
	}

	return entries[entries.length - 1] ?? null;
}

function getEntryPath(entries: SessionEntry[]): SessionEntry[] {
	const leaf = getLeafEntry(entries);
	if (!leaf) return [];

	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	const path: SessionEntry[] = [];
	let current: SessionEntry | undefined = leaf;

	while (current) {
		path.push(current);
		const parentId = "parentId" in current ? current.parentId : null;
		if (!parentId) break;
		current = byId.get(parentId);
	}

	return path.reverse();
}

function extractTextContent(content: unknown): string {
	if (typeof content === "string") return content;
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
			if (text) return text.slice(0, 200);
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

async function searchWithGrep(
	exec: (cmd: string, args: string[], opts?: { timeout?: number }) => Promise<{ stdout: string; stderr: string; code: number }>,
	query: string,
	sessionsDir: string,
	onFallback?: () => void,
): Promise<Map<string, number>> {
	const results = new Map<string, number>();

	// Try ripgrep first
	try {
		const { stdout, code } = await exec("rg", ["-c", "-i", "--", query, sessionsDir], { timeout: 10000 });
		if (code === 0 || code === 1) { // 1 = no matches, which is fine
			for (const line of stdout.split("\n")) {
				if (!line.trim()) continue;
				const match = line.match(/^(.+):(\d+)$/);
				if (match) results.set(match[1], parseInt(match[2], 10));
			}
			return results;
		}
	} catch {
		// ripgrep not found or failed, fall back to grep
	}

	// Fallback to grep
	onFallback?.();
	try {
		const { stdout } = await exec("grep", ["-r", "-c", "-i", query, sessionsDir], { timeout: 30000 });
		for (const line of stdout.split("\n")) {
			if (!line.trim()) continue;
			const match = line.match(/^(.+):(\d+)$/);
			if (match && parseInt(match[2], 10) > 0) {
				results.set(match[1], parseInt(match[2], 10));
			}
		}
	} catch {
		// grep also failed or no matches
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

const SearchThreadParams = Type.Object({
	thread_id: Type.String({ description: "Thread ID (session UUID) or file path" }),
	query: Type.Optional(Type.String({ description: "Search for messages containing this text (case-insensitive). If omitted, returns all messages." })),
	context: Type.Optional(Type.Number({ description: "Include N messages before/after each match (default: 0)", default: 0 })),
	roles: Type.Optional(Type.Array(Type.String(), { description: "Filter to specific roles: user, assistant, toolResult (default: all)" })),
	max_messages: Type.Optional(Type.Number({ description: "Maximum messages to return" })),
	max_content_length: Type.Optional(Type.Number({ description: "Truncate each message content to N chars" })),
});

export default function (pi: ExtensionAPI) {
	// ========================================================================
	// find_threads tool
	// ========================================================================
	pi.registerTool({
		name: "find_threads",
		label: "Find Threads",
		description:
			"Search through past conversation sessions. Use to find previous discussions, code changes, or decisions. Searches message content using ripgrep for speed.",
		parameters: FindThreadsParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const startTime = Date.now();
			const sessionsDir = getSessionsDir();
			const limit = params.limit ?? 10;
			const sort = params.sort ?? "recent";

			let sessionFiles = await getAllSessions(sessionsDir);
			let matchCounts: Map<string, number> | null = null;

			// Filter by query using ripgrep (with grep fallback)
			if (params.query) {
				matchCounts = await searchWithGrep(
					pi.exec.bind(pi),
					params.query,
					sessionsDir,
					() => ctx.ui.notify("ripgrep not found, falling back to grep (slower)", "warning"),
				);
				sessionFiles = sessionFiles.filter((f) => matchCounts!.has(f));
			}

			// Filter by cwd
			if (params.cwd) {
				const cwdFilter = params.cwd.toLowerCase();
				sessionFiles = sessionFiles.filter((f) => {
					const entries = loadSessionFile(f);
					const header = getSessionHeader(entries);
					return header?.cwd?.toLowerCase().includes(cwdFilter);
				});
			}

			// Parse and build results
			const results: Array<{
				id: string;
				cwd: string;
				timestamp: string;
				preview: string;
				messageCount: number;
				filePath: string;
				matchCount?: number;
			}> = [];

			for (const filePath of sessionFiles) {
				const entries = loadSessionFile(filePath);
				const header = getSessionHeader(entries);
				if (!header) continue;

				const sessionEntries = getSessionEntries(entries);
				results.push({
					id: header.id,
					cwd: header.cwd || "",
					timestamp: header.timestamp,
					preview: getFirstUserMessage(sessionEntries),
					messageCount: countMessages(sessionEntries),
					filePath,
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

			const limitedResults = results.slice(0, limit);
			const searchTime = Date.now() - startTime;

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
				details: { threads: limitedResults, searchTime, totalSessions: sessionFiles.length },
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
			if (!details?.threads) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
			}

			const { threads, searchTime } = details;
			const icon = threads.length > 0 ? theme.fg("success", "✓") : theme.fg("muted", "○");

			if (expanded) {
				const container = new Container();
				container.addChild(
					new Text(`${icon} Found ${theme.fg("accent", String(threads.length))} threads (${searchTime}ms)`, 0, 0),
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
	// search_thread tool
	// ========================================================================
	pi.registerTool({
		name: "search_thread",
		label: "Search Thread",
		description:
			"Search and read a specific conversation thread by ID or file path. Returns conversation messages with optional filtering by query text, roles, and context window.",
		parameters: SearchThreadParams,

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const { thread_id, query, context = 0, roles, max_messages, max_content_length } = params;
			const sessionsDir = getSessionsDir();

			// Find the session file
			let filePath: string | null = null;

			if (thread_id.endsWith(".jsonl") || thread_id.startsWith("/")) {
				filePath = thread_id;
			} else {
				const allSessions = await getAllSessions(sessionsDir);
				for (const sessionPath of allSessions) {
					const entries = loadSessionFile(sessionPath);
					const header = getSessionHeader(entries);
					if (header?.id === thread_id) {
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
			const branchEntries = getEntryPath(sessionEntries);

			// Build message list
			const allMessages: Array<{
				role: string;
				content: string;
				timestamp?: string;
				model?: string;
				toolName?: string;
			}> = [];
			let totalTokens = 0;
			let totalCost = 0;

			for (const entry of branchEntries) {
				if (entry.type === "custom_message") {
					const customEntry = entry as any;
					const customContent = extractTextContent(customEntry.content);
					if (!customContent.trim()) continue;
					allMessages.push({
						role: customEntry.customType ? `custom:${customEntry.customType}` : "custom",
						content: customContent.trim(),
						timestamp: customEntry.timestamp,
					});
					continue;
				}

				if (entry.type !== "message") continue;

				const msg = entry.message;
				const content = extractTextContent(msg.content);
				if (!content.trim()) continue;

				allMessages.push({
					role: msg.role,
					content: content.trim(),
					timestamp: entry.timestamp,
					model: "model" in msg ? (msg as any).model : undefined,
					toolName: "toolName" in msg ? (msg as any).toolName : undefined,
				});

				if ("usage" in msg && msg.usage) {
					const usage = msg.usage as { input?: number; output?: number; cost?: { total?: number } };
					totalTokens += (usage.input || 0) + (usage.output || 0);
					totalCost += usage.cost?.total || 0;
				}
			}

			// Apply filtering
			let filteredMessages = allMessages;
			const originalCount = allMessages.length;

			// 1. Filter by roles if specified
			if (roles && roles.length > 0) {
				const rolesLower = roles.map(r => r.toLowerCase());
				filteredMessages = filteredMessages.filter(msg => 
					rolesLower.includes(msg.role.toLowerCase())
				);
			}

			// 2. Filter by query if specified, with context
			let matchCount = 0;
			if (query) {
				const queryLower = query.toLowerCase();
				const matchIndices = new Set<number>();
				
				// Find matching message indices
				for (let i = 0; i < filteredMessages.length; i++) {
					if (filteredMessages[i].content.toLowerCase().includes(queryLower)) {
						matchCount++;
						// Add the match and context
						for (let j = Math.max(0, i - context); j <= Math.min(filteredMessages.length - 1, i + context); j++) {
							matchIndices.add(j);
						}
					}
				}
				
				// Keep only messages in the match set (preserving order)
				filteredMessages = filteredMessages.filter((_, idx) => matchIndices.has(idx));
			}

			// 3. Apply max_messages limit (from end)
			const limitedMessages = max_messages ? filteredMessages.slice(-max_messages) : filteredMessages;

			// 4. Apply content length truncation
			const finalMessages = max_content_length
				? limitedMessages.map(msg => ({
						...msg,
						content: msg.content.length > max_content_length 
							? msg.content.slice(0, max_content_length) + "..."
							: msg.content,
					}))
				: limitedMessages;

			const thread = {
				id: header.id,
				cwd: header.cwd || "",
				timestamp: header.timestamp,
				messages: finalMessages,
				totalTokens,
				totalCost,
			};

			// Format output
			let text = `## Thread ${thread.id}\n`;
			text += `**Directory:** ${thread.cwd}\n`;
			text += `**Started:** ${new Date(thread.timestamp).toLocaleString()}\n`;
			text += `**Messages:** ${originalCount} total | **Tokens:** ${totalTokens.toLocaleString()} | **Cost:** $${totalCost.toFixed(4)}\n`;
			
			// Show filtering info
			const filters: string[] = [];
			if (query) filters.push(`query="${query}" (${matchCount} matches)`);
			if (roles) filters.push(`roles=[${roles.join(", ")}]`);
			if (context > 0) filters.push(`context=${context}`);
			if (max_messages) filters.push(`max_messages=${max_messages}`);
			if (max_content_length) filters.push(`truncate=${max_content_length}`);
			
			if (filters.length > 0) {
				text += `**Filters:** ${filters.join(" | ")}\n`;
				text += `**Showing:** ${finalMessages.length} of ${originalCount} messages\n`;
			}
			
			text += "\n---\n\n";

			for (const msg of finalMessages) {
				const roleIcon = msg.role === "user" ? "👤" : msg.role === "assistant" ? "🤖" : "🔧";
				const roleLabel = msg.role === "toolResult" ? `tool:${msg.toolName}` : msg.role;
				text += `### ${roleIcon} ${roleLabel}\n`;
				if (msg.model) text += `*${msg.model}*\n`;
				text += `\n${msg.content}\n\n`;
			}

			return {
				content: [{ type: "text", text }],
				details: { thread, matchCount, originalCount },
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("search_thread"));
			text += " " + theme.fg("accent", args.thread_id.slice(0, 36));
			if (args.query) text += " " + theme.fg("warning", `"${args.query}"`);
			if (args.roles) text += " " + theme.fg("dim", `roles:[${args.roles.join(",")}]`);
			if (args.context) text += " " + theme.fg("dim", `ctx:${args.context}`);
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

			const { thread, matchCount, originalCount } = details;
			const icon = theme.fg("success", "✓");
			const countInfo = matchCount !== undefined 
				? `${matchCount} matches, ${thread.messages.length}/${originalCount} shown`
				: `${thread.messages.length} messages`;

			if (expanded) {
				const container = new Container();
				container.addChild(
					new Text(`${icon} Thread ${theme.fg("accent", thread.id.slice(0, 8))} (${countInfo})`, 0, 0),
				);
				container.addChild(new Text(theme.fg("muted", `📁 ${thread.cwd}`), 0, 0));
				container.addChild(
					new Text(theme.fg("dim", `📊 ${thread.totalTokens.toLocaleString()} tokens | $${thread.totalCost.toFixed(4)}`), 0, 0),
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
			let text = `${icon} Thread ${theme.fg("accent", thread.id.slice(0, 8))} (${countInfo})`;
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
