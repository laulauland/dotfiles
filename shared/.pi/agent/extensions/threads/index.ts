import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { FileFinder, type FileFinderApi } from "@ff-labs/fff-node";
import { StringEnum } from "@earendil-works/pi-ai";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	getAgentDir,
	SessionManager,
	truncateHead,
	type ExtensionAPI,
	type ExtensionContext,
	type SessionEntry,
	type SessionInfo,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const SCAN_TIMEOUT_MS = 15_000;
const SEARCH_PAGE_SIZE = 1_000;
const MAX_SEARCH_PAGES = 100;
const MAX_SESSION_FILE_SIZE = 100 * 1024 * 1024;
const DEFAULT_RESULT_LIMIT = 10;
const MAX_RESULT_LIMIT = 100;
const PREVIEW_LENGTH = 240;

type ThreadSort = "recent" | "oldest" | "relevance";

type SessionManagerWithStorageMode = ExtensionContext["sessionManager"] & {
	usesDefaultSessionDir?: () => boolean;
};

interface StorageScope {
	root: string;
	listRoot?: string;
}

interface ThreadSummary {
	id: string;
	name?: string;
	cwd: string;
	created: string;
	modified: string;
	preview: string;
	messageCount: number;
	filePath: string;
	matchCount?: number;
}

interface ThreadMessage {
	role: string;
	content: string;
	timestamp?: string;
	model?: string;
	toolName?: string;
}

function storageScope(ctx: ExtensionContext): StorageScope {
	const manager = ctx.sessionManager as SessionManagerWithStorageMode;
	const managerDir = manager.getSessionDir();
	const environmentDir = process.env.PI_CODING_AGENT_SESSION_DIR;

	// Ephemeral sessions have no manager directory. They should still be able to
	// inspect persisted threads, using the same environment override as Pi.
	if (!managerDir) {
		if (environmentDir) {
			const root = resolve(environmentDir);
			return { root, listRoot: root };
		}
		return { root: join(getAgentDir(), "sessions") };
	}

	const usesDefault = manager.usesDefaultSessionDir?.() ?? !environmentDir;
	if (!usesDefault) {
		const root = resolve(managerDir);
		return { root, listRoot: root };
	}
	return { root: join(getAgentDir(), "sessions") };
}

function normalizePath(filePath: string): string {
	return resolve(filePath.startsWith("~/") ? join(homedir(), filePath.slice(2)) : filePath);
}

function textContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part: any) => {
			if (part?.type === "text" && typeof part.text === "string") return part.text;
			if (part?.type === "toolCall" && typeof part.name === "string") return `[Tool call: ${part.name}]`;
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function entryMessage(entry: SessionEntry, includeToolResults: boolean): ThreadMessage | null {
	if (entry.type === "custom_message") {
		const content = textContent(entry.content).trim();
		return content
			? { role: `custom:${entry.customType}`, content, timestamp: entry.timestamp }
			: null;
	}
	if (entry.type === "compaction") {
		return { role: "compaction", content: entry.summary, timestamp: entry.timestamp };
	}
	if (entry.type === "branch_summary") {
		return { role: "branchSummary", content: entry.summary, timestamp: entry.timestamp };
	}
	if (entry.type !== "message") return null;
	const message = entry.message;
	if (!("content" in message)) return null;
	if (message.role === "toolResult" && !includeToolResults) return null;
	const content = textContent(message.content).trim();
	if (!content) return null;
	return {
		role: message.role,
		content,
		timestamp: entry.timestamp,
		model: "model" in message && typeof message.model === "string" ? message.model : undefined,
		toolName: "toolName" in message && typeof message.toolName === "string" ? message.toolName : undefined,
	};
}

function formatThread(info: SessionInfo, matchCount?: number): ThreadSummary {
	const preview = (info.name || info.firstMessage || "(no user message)").replace(/\s+/g, " ").trim();
	return {
		id: info.id,
		name: info.name,
		cwd: info.cwd,
		created: info.created.toISOString(),
		modified: info.modified.toISOString(),
		preview: preview.length > PREVIEW_LENGTH ? `${preview.slice(0, PREVIEW_LENGTH)}…` : preview,
		messageCount: info.messageCount,
		filePath: info.path,
		matchCount,
	};
}

function formatSearchOutput(threads: ThreadSummary[], total: number, query?: string): string {
	const lines = [`Found ${total} thread${total === 1 ? "" : "s"}${query ? ` matching ${JSON.stringify(query)}` : ""}.`];
	for (const thread of threads) {
		lines.push(
			"",
			`**${thread.id}**${thread.name ? ` — ${thread.name}` : ""}`,
			`  cwd: ${thread.cwd || "(unknown)"}`,
			`  modified: ${thread.modified}`,
			`  messages: ${thread.messageCount}${thread.matchCount === undefined ? "" : ` | matching lines: ${thread.matchCount}`}`,
			`  preview: ${thread.preview}`,
		);
	}
	if (total > threads.length) lines.push("", `Showing ${threads.length} of ${total}; increase limit to see more.`);
	return lines.join("\n");
}

function formatReadOutput(thread: {
	id: string;
	name?: string;
	cwd: string;
	created: Date;
	messages: ThreadMessage[];
	totalMessages: number;
}): string {
	const lines = [
		`# Thread ${thread.id}${thread.name ? ` — ${thread.name}` : ""}`,
		`Directory: ${thread.cwd || "(unknown)"}`,
		`Started: ${thread.created.toISOString()}`,
		`Messages shown: ${thread.messages.length} of ${thread.totalMessages}`,
		"",
	];
	for (const message of thread.messages) {
		const role = message.role === "toolResult" ? `tool:${message.toolName ?? "unknown"}` : message.role;
		lines.push(`## ${role}${message.model ? ` (${message.model})` : ""}`, "", message.content, "");
	}
	return lines.join("\n");
}

function truncateToolOutput(text: string, label: string): { text: string; fullOutputPath?: string } {
	const truncated = truncateHead(text, { maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES });
	if (!truncated.truncated) return { text };
	const directory = mkdtempSync(join(tmpdir(), "pi-threads-"));
	const fullOutputPath = join(directory, `${label}.md`);
	writeFileSync(fullOutputPath, text, "utf8");
	return {
		text:
			`${truncated.content}\n\n` +
			`[Output truncated: ${truncated.outputLines} of ${truncated.totalLines} lines ` +
			`(${formatSize(truncated.outputBytes)} of ${formatSize(truncated.totalBytes)}). ` +
			`Full output saved to: ${fullOutputPath}]`,
		fullOutputPath,
	};
}

class ThreadCatalog {
	private finder: FileFinderApi | null = null;
	private finderRoot: string | null = null;
	private finderPromise: Promise<FileFinderApi> | null = null;
	private pendingRoot: string | null = null;

	destroy(): void {
		if (this.finder && !this.finder.isDestroyed) this.finder.destroy();
		this.finder = null;
		this.finderRoot = null;
	}

	private async ensureFinder(root: string): Promise<FileFinderApi> {
		if (this.finder && !this.finder.isDestroyed && this.finderRoot === root) return this.finder;
		if (this.finderPromise) {
			if (this.pendingRoot === root) return this.finderPromise;
			await this.finderPromise;
			return this.ensureFinder(root);
		}

		this.destroy();
		this.pendingRoot = root;
		this.finderPromise = (async () => {
			const created = FileFinder.create({
				basePath: root,
				aiMode: true,
				enableHomeDirScanning: true,
			});
			if (!created.ok) throw new Error(`FFF initialization failed: ${created.error}`);
			this.finder = created.value;
			this.finderRoot = root;
			await this.finder.waitForScan(SCAN_TIMEOUT_MS);
			return this.finder;
		})().finally(() => {
			this.finderPromise = null;
			this.pendingRoot = null;
		});
		return this.finderPromise;
	}

	private async matchingFiles(root: string, query: string, signal?: AbortSignal): Promise<Map<string, number>> {
		const finder = await this.ensureFinder(root);
		const counts = new Map<string, number>();
		let cursor = null;
		for (let page = 0; page < MAX_SEARCH_PAGES; page++) {
			if (signal?.aborted) throw new Error("Operation aborted");
			const result = finder.grep(query, {
				mode: "plain",
				smartCase: true,
				maxFileSize: MAX_SESSION_FILE_SIZE,
				maxMatchesPerFile: 200,
				pageSize: SEARCH_PAGE_SIZE,
				cursor,
			});
			if (!result.ok) throw new Error(`FFF search failed: ${result.error}`);
			for (const match of result.value.items) {
				const filePath = resolve(root, match.relativePath);
				counts.set(filePath, (counts.get(filePath) ?? 0) + 1);
			}
			cursor = result.value.nextCursor;
			if (!cursor) return counts;
		}
		throw new Error(`FFF search exceeded ${MAX_SEARCH_PAGES} pages; narrow the query`);
	}

	async list(
		scope: StorageScope,
		options: { query?: string; cwd?: string; limit: number; sort: ThreadSort; currentFile?: string },
		signal?: AbortSignal,
	): Promise<{ threads: ThreadSummary[]; total: number }> {
		const sessions = await SessionManager.listAll(scope.listRoot);
		if (sessions.length === 0) return { threads: [], total: 0 };
		const matchCounts = options.query ? await this.matchingFiles(scope.root, options.query, signal) : undefined;
		const cwd = options.cwd?.toLowerCase();
		const currentFile = options.currentFile ? normalizePath(options.currentFile) : undefined;
		let filtered = sessions.filter((session) => {
			const filePath = normalizePath(session.path);
			if (currentFile && filePath === currentFile) return false;
			if (cwd && !session.cwd.toLowerCase().includes(cwd)) return false;
			if (matchCounts && !matchCounts.has(filePath)) return false;
			return true;
		});
		if (options.sort === "recent") filtered.sort((a, b) => b.modified.getTime() - a.modified.getTime());
		else if (options.sort === "oldest") filtered.sort((a, b) => a.created.getTime() - b.created.getTime());
		else if (matchCounts) {
			filtered.sort((a, b) => (matchCounts.get(normalizePath(b.path)) ?? 0) - (matchCounts.get(normalizePath(a.path)) ?? 0));
		}
		const total = filtered.length;
		return {
			threads: filtered.slice(0, options.limit).map((session) => formatThread(session, matchCounts?.get(normalizePath(session.path)))),
			total,
		};
	}

	async resolveSession(scope: StorageScope, threadId: string): Promise<SessionInfo> {
		if (threadId.endsWith(".jsonl") || threadId.startsWith("/") || threadId.startsWith("~/")) {
			const filePath = normalizePath(threadId);
			if (!existsSync(filePath)) throw new Error(`Thread file not found: ${threadId}`);
			const manager = SessionManager.open(filePath);
			const header = manager.getHeader();
			if (!header) throw new Error(`Invalid session file: ${filePath}`);
			return {
				path: filePath,
				id: header.id,
				cwd: header.cwd,
				created: new Date(header.timestamp),
				modified: new Date(header.timestamp),
				messageCount: manager.getEntries().filter((entry) => entry.type === "message").length,
				firstMessage: "",
				allMessagesText: "",
				name: manager.getSessionName(),
			};
		}
		const sessions = await SessionManager.listAll(scope.listRoot);
		const matches = sessions.filter((session) => session.id === threadId || session.id.startsWith(threadId));
		if (matches.length === 0) throw new Error(`Thread not found: ${threadId}`);
		if (matches.length > 1) throw new Error(`Thread ID is ambiguous: ${threadId} (${matches.length} matches)`);
		return matches[0]!;
	}

	async read(
		scope: StorageScope,
		options: { threadId: string; includeToolResults: boolean; maxMessages?: number },
	): Promise<{ thread: ReturnType<typeof formatThread>; messages: ThreadMessage[]; totalMessages: number; output: string }> {
		const info = await this.resolveSession(scope, options.threadId);
		const manager = SessionManager.open(info.path);
		const allMessages = manager
			.getBranch()
			.map((entry) => entryMessage(entry, options.includeToolResults))
			.filter((message): message is ThreadMessage => message !== null);
		const messages = options.maxMessages ? allMessages.slice(-options.maxMessages) : allMessages;
		const output = formatReadOutput({
			id: info.id,
			name: info.name,
			cwd: info.cwd,
			created: info.created,
			messages,
			totalMessages: allMessages.length,
		});
		return { thread: formatThread(info), messages, totalMessages: allMessages.length, output };
	}
}

const FindThreadsParams = Type.Object({
	query: Type.Optional(Type.String({ description: "Literal text to search for with FFF" })),
	cwd: Type.Optional(Type.String({ description: "Filter by working directory (partial match)" })),
	limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_RESULT_LIMIT, default: DEFAULT_RESULT_LIMIT })),
	sort: Type.Optional(StringEnum(["recent", "oldest", "relevance"] as const, { default: "recent" })),
	include_current: Type.Optional(Type.Boolean({ description: "Include the current thread (default: false)", default: false })),
});

const ReadThreadParams = Type.Object({
	thread_id: Type.String({ description: "Full or unambiguous partial session UUID, or a JSONL file path" }),
	include_tool_results: Type.Optional(Type.Boolean({ default: false })),
	max_messages: Type.Optional(Type.Integer({ minimum: 1, maximum: 1_000 })),
});

export default function threadsExtension(pi: ExtensionAPI) {
	const catalog = new ThreadCatalog();

	pi.on("session_shutdown", () => catalog.destroy());

	pi.registerTool({
		name: "find_threads",
		label: "Find Threads",
		description: "Find other Pi conversation threads across projects. Uses FFF for fast literal content search and SessionManager for authoritative metadata. Excludes the current thread by default.",
		promptSnippet: "Find previous Pi conversation threads by content or project",
		promptGuidelines: ["Use find_threads when prior conversations may contain decisions, context, or implementation history relevant to the task."],
		parameters: FindThreadsParams,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const started = Date.now();
			const result = await catalog.list(
				storageScope(ctx),
				{
					query: params.query?.trim() || undefined,
					cwd: params.cwd?.trim() || undefined,
					limit: params.limit ?? DEFAULT_RESULT_LIMIT,
					sort: params.sort ?? "recent",
					currentFile: params.include_current ? undefined : ctx.sessionManager.getSessionFile(),
				},
				signal,
			);
			const output = truncateToolOutput(formatSearchOutput(result.threads, result.total, params.query), "find-threads");
			return {
				content: [{ type: "text", text: output.text }],
				details: { ...result, searchTimeMs: Date.now() - started, engine: "fff", fullOutputPath: output.fullOutputPath },
			};
		},
		renderCall(args, theme) {
			return new Text(`${theme.fg("toolTitle", theme.bold("find_threads"))}${args.query ? ` ${theme.fg("accent", JSON.stringify(args.query))}` : ""}`, 0, 0);
		},
		renderResult(result, _options, theme) {
			const count = (result.details as any)?.threads?.length;
			return new Text(count === undefined ? theme.fg("error", "Thread search failed") : `${theme.fg("success", "✓")} ${count} thread${count === 1 ? "" : "s"} shown via FFF`, 0, 0);
		},
	});

	pi.registerTool({
		name: "read_thread",
		label: "Read Thread",
		description: `Read the active branch of another Pi thread by ID or path. Output is capped at ${formatSize(DEFAULT_MAX_BYTES)} or ${DEFAULT_MAX_LINES} lines; complete truncated output is saved to a temporary Markdown file.`,
		promptSnippet: "Read a previous Pi conversation thread",
		promptGuidelines: ["Call find_threads before read_thread unless the user supplied a thread ID or session path."],
		parameters: ReadThreadParams,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			if (signal?.aborted) throw new Error("Operation aborted");
			const result = await catalog.read(storageScope(ctx), {
				threadId: params.thread_id,
				includeToolResults: params.include_tool_results ?? false,
				maxMessages: params.max_messages,
			});
			const output = truncateToolOutput(result.output, `thread-${result.thread.id}`);
			return {
				content: [{ type: "text", text: output.text }],
				details: { thread: result.thread, messages: result.messages, totalMessages: result.totalMessages, fullOutputPath: output.fullOutputPath },
			};
		},
		renderCall(args, theme) {
			return new Text(`${theme.fg("toolTitle", theme.bold("read_thread"))} ${theme.fg("accent", args.thread_id)}`, 0, 0);
		},
		renderResult(result, _options, theme) {
			const details = result.details as any;
			return new Text(details?.thread ? `${theme.fg("success", "✓")} Thread ${theme.fg("accent", details.thread.id.slice(0, 8))}: ${details.messages.length}/${details.totalMessages} messages` : theme.fg("error", "Thread read failed"), 0, 0);
		},
	});
}
