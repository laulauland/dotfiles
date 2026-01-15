/**
 * Thread Reference Extension - Reference past conversations in your prompts
 *
 * Inspired by ampcode.com's "Referencing Threads" feature.
 *
 * Features:
 * - Ctrl+R shortcut to open thread picker
 * - Tab to toggle between DIRECTORY (current cwd) and GLOBAL (all sessions)
 * - Fuzzy search through thread titles
 * - Inserts @thread:UUID reference at cursor
 * - Automatically injects context from referenced threads on prompt submit
 *
 * Usage:
 * 1. Press Ctrl+R while editing a prompt
 * 2. Search for a thread by typing
 * 3. Use Tab to toggle between local and global threads
 * 4. Press Enter to insert the reference
 * 5. Submit your prompt - context will be injected automatically
 */

import { CustomEditor, type ExtensionAPI, type ExtensionContext, type Theme } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, visibleWidth, type EditorTheme, type TUI } from "@mariozechner/pi-tui";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// Thread reference pattern: @thread:UUID or @thread:UUID#entryId
const THREAD_REF_PATTERN = /@thread:([a-f0-9-]+)(?:#([a-f0-9-]+))?/gi;

interface ThreadInfo {
	path: string;
	id: string;
	cwd: string;
	created: Date;
	modified: Date;
	messageCount: number;
	firstMessage: string;
	summary?: string; // From compaction or branch summary
}

interface SessionHeader {
	type: "session";
	id: string;
	timestamp: string;
	cwd: string;
}

/**
 * Note: We don't decode the session directory name because hyphens in the original
 * path are indistinguishable from path separators. Instead, we read the cwd from
 * the session header directly.
 */

function toSingleLine(text: string): string {
	// Session messages can contain literal newlines (tool output, code blocks, etc.).
	// Keep the picker 1-row-per-item by collapsing all whitespace.
	return text.replace(/[\s\u00A0]+/g, " ").trim();
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

function getEntrySnippet(thread: ThreadInfo, entryId: string): string | null {
	try {
		const content = readFileSync(thread.path, "utf8");
		const lines = content.trim().split("\n");
		for (const line of lines) {
			try {
				const entry = JSON.parse(line);
				if (entry?.id !== entryId) continue;
				if (entry.type === "message") {
					const text = extractTextContent(entry.message?.content);
					return text ? toSingleLine(text) : null;
				}
				if (entry.type === "custom_message") {
					const text = extractTextContent(entry.content);
					return text ? toSingleLine(text) : null;
				}
				if ((entry.type === "compaction" || entry.type === "branch_summary") && entry.summary) {
					return toSingleLine(entry.summary);
				}
				if (entry.type === "session_info" && entry.name) {
					return toSingleLine(entry.name);
				}
				return null;
			} catch {
				// Skip malformed lines
			}
		}
	} catch {
		// Ignore read errors
	}
	return null;
}

/**
 * Format a path for display, replacing home directory with ~
 */
function formatPath(path: string): string {
	const home = homedir();
	if (path.startsWith(home)) {
		return "~" + path.slice(home.length);
	}
	return path;
}

/**
 * List all session directories
 */
function getSessionDirectories(): string[] {
	const sessionsRoot = join(homedir(), ".pi", "agent", "sessions");
	try {
		return readdirSync(sessionsRoot)
			.filter((name) => name.startsWith("--"))
			.map((name) => join(sessionsRoot, name));
	} catch {
		return [];
	}
}

/**
 * List threads from a session directory
 */
function listThreadsFromDir(sessionDir: string): ThreadInfo[] {
	const threads: ThreadInfo[] = [];

	try {
		const files = readdirSync(sessionDir).filter((f) => f.endsWith(".jsonl"));

		for (const file of files) {
			const filePath = join(sessionDir, file);
			try {
				const content = readFileSync(filePath, "utf8");
				const lines = content.trim().split("\n");
				if (lines.length === 0) continue;

				// Parse header - get cwd from header, not directory name
				let header: SessionHeader | null = null;
				try {
					const first = JSON.parse(lines[0]!);
					if (first.type === "session" && first.id && first.cwd) {
						header = first;
					}
				} catch {
					continue;
				}
				if (!header) continue;

				const cwd = header.cwd;

				const stats = statSync(filePath);
				let messageCount = 0;
				let firstMessage = "";
				let summary: string | undefined;

				for (let i = 1; i < lines.length; i++) {
					try {
						const entry = JSON.parse(lines[i]!);

						// Count messages
						if (entry.type === "message") {
							messageCount++;
							if (!firstMessage && entry.message?.role === "user") {
								const textContent = entry.message.content
									?.filter((c: any) => c.type === "text")
									.map((c: any) => c.text)
									.join(" ");
								if (textContent) {
									firstMessage = toSingleLine(textContent);
								}
							}
						}

						// Look for summaries (prefer most recent)
						if (entry.type === "compaction" && entry.summary) {
							summary = entry.summary;
						}
						if (entry.type === "branch_summary" && entry.summary) {
							summary = entry.summary;
						}
					} catch {
						// Skip malformed lines
					}
				}

				threads.push({
					path: filePath,
					id: header.id,
					cwd,
					created: new Date(header.timestamp),
					modified: stats.mtime,
					messageCount,
					firstMessage: firstMessage || "(no messages)",
					summary,
				});
			} catch {
				// Skip unreadable files
			}
		}
	} catch {
		// Directory not readable
	}

	return threads;
}

/**
 * Get all threads, optionally filtered to current directory
 */
function getAllThreads(currentCwd: string, globalScope: boolean): ThreadInfo[] {
	const sessionDirs = getSessionDirectories();
	const threads: ThreadInfo[] = [];

	for (const dir of sessionDirs) {
		const dirThreads = listThreadsFromDir(dir);
		if (globalScope) {
			threads.push(...dirThreads);
		} else {
			// Filter to current cwd
			threads.push(...dirThreads.filter((t) => t.cwd === currentCwd));
		}
	}

	// Sort by modified date, most recent first
	threads.sort((a, b) => b.modified.getTime() - a.modified.getTime());

	return threads;
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays === 0) {
		return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	} else if (diffDays === 1) {
		return "yesterday";
	} else if (diffDays < 7) {
		return `${diffDays}d ago`;
	}
	return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * Thread picker overlay component
 */
class ThreadPickerOverlay {
	readonly width = 80;
	private readonly maxVisible = 10;

	private globalScope = false;
	private query = "";
	private threads: ThreadInfo[] = [];
	private filteredThreads: ThreadInfo[] = [];
	private selectedIndex = 0;
	private scrollOffset = 0;

	constructor(
		private theme: Theme,
		private currentCwd: string,
		private done: (result: ThreadInfo | null) => void,
	) {
		this.refreshThreads();
	}

	private refreshThreads(): void {
		this.threads = getAllThreads(this.currentCwd, this.globalScope);
		this.filterThreads();
	}

	private filterThreads(): void {
		if (!this.query) {
			this.filteredThreads = this.threads;
		} else {
			const lowerQuery = this.query.toLowerCase();
			this.filteredThreads = this.threads.filter(
				(t) =>
					t.firstMessage.toLowerCase().includes(lowerQuery) ||
					t.id.toLowerCase().includes(lowerQuery) ||
					t.cwd.toLowerCase().includes(lowerQuery),
			);
		}
		this.selectedIndex = 0;
		this.scrollOffset = 0;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			this.done(null);
			return;
		}

		if (matchesKey(data, "return")) {
			this.done(this.filteredThreads[this.selectedIndex] ?? null);
			return;
		}

		if (matchesKey(data, "tab")) {
			this.globalScope = !this.globalScope;
			this.refreshThreads();
			return;
		}

		if (matchesKey(data, "up")) {
			if (this.selectedIndex > 0) {
				this.selectedIndex--;
				if (this.selectedIndex < this.scrollOffset) {
					this.scrollOffset = this.selectedIndex;
				}
			}
			return;
		}

		if (matchesKey(data, "down")) {
			if (this.selectedIndex < this.filteredThreads.length - 1) {
				this.selectedIndex++;
				if (this.selectedIndex >= this.scrollOffset + this.maxVisible) {
					this.scrollOffset = this.selectedIndex - this.maxVisible + 1;
				}
			}
			return;
		}

		if (matchesKey(data, "backspace")) {
			if (this.query.length > 0) {
				this.query = this.query.slice(0, -1);
				this.filterThreads();
			}
			return;
		}

		// Regular character input
		if (data.length === 1 && data.charCodeAt(0) >= 32) {
			this.query += data;
			this.filterThreads();
		}
	}

	render(_width: number): string[] {
		const w = this.width;
		const th = this.theme;
		const innerW = w - 2;
		const lines: string[] = [];

		const pad = (s: string, len: number) => {
			const vis = visibleWidth(s);
			return s + " ".repeat(Math.max(0, len - vis));
		};

		const row = (content: string) => th.fg("border", "│") + pad(content, innerW) + th.fg("border", "│");

		// Top border
		lines.push(th.fg("border", `╭${"─".repeat(innerW)}╮`));

		// Title with scope tabs
		const dirTab = this.globalScope
			? th.fg("dim", "DIRECTORY")
			: th.fg("accent", th.bold("DIRECTORY"));
		const globalTab = this.globalScope
			? th.fg("accent", th.bold("GLOBAL"))
			: th.fg("dim", "GLOBAL");
		lines.push(row(` ${dirTab} ${th.fg("border", "│")} ${globalTab}`));

		// Search input
		const searchPrompt = th.fg("accent", "❯ ");
		const searchText = this.query || th.fg("dim", "Search threads...");
		lines.push(row(` ${searchPrompt}${searchText}`));

		// Divider
		lines.push(th.fg("border", `├${"─".repeat(innerW)}┤`));

		// Thread list
		const visibleThreads = this.filteredThreads.slice(
			this.scrollOffset,
			this.scrollOffset + this.maxVisible,
		);

		for (let i = 0; i < this.maxVisible; i++) {
			if (i < visibleThreads.length) {
				const thread = visibleThreads[i]!;
				const actualIndex = this.scrollOffset + i;
				const isSelected = actualIndex === this.selectedIndex;

				const prefix = isSelected ? th.fg("accent", " ▶ ") : "   ";
				const date = th.fg("muted", formatDate(thread.modified));

				let cwdDisplay = "";
				if (this.globalScope) {
					cwdDisplay = th.fg("dim", ` [${formatPath(thread.cwd)}]`);
				}

				const fixedWidth = visibleWidth(prefix) + visibleWidth(date) + 1 + visibleWidth(cwdDisplay);
				const maxMsgWidth = Math.max(10, innerW - fixedWidth - 1);
				const msg = toSingleLine(thread.firstMessage);
				const truncatedMsg = visibleWidth(msg) > maxMsgWidth
					? msg.slice(0, maxMsgWidth - 1) + "…"
					: msg;
				const msgStyled = isSelected ? th.fg("text", truncatedMsg) : th.fg("muted", truncatedMsg);

				lines.push(row(`${prefix}${date} ${msgStyled}${cwdDisplay}`));
			} else if (i === 0 && this.filteredThreads.length === 0) {
				lines.push(row(th.fg("dim", "   No threads found")));
			} else {
				lines.push(row(""));
			}
		}

		// Scroll indicator
		if (this.filteredThreads.length > this.maxVisible) {
			const shown = `${this.scrollOffset + 1}-${Math.min(
				this.scrollOffset + this.maxVisible,
				this.filteredThreads.length,
			)}`;
			const total = this.filteredThreads.length;
			lines.push(row(th.fg("dim", ` (${shown} of ${total})`)));
		} else {
			lines.push(row(""));
		}

		// Footer
		lines.push(row(th.fg("dim", " [Tab] scope  ↑↓ navigate  [Enter] select  [Esc] cancel")));

		// Bottom border
		lines.push(th.fg("border", `╰${"─".repeat(innerW)}╯`));

		return lines;
	}

	invalidate(): void {}
	dispose(): void {}
}

/**
 * Extract context from a thread for injection
 */
function extractThreadContext(thread: ThreadInfo, entryId?: string): string {
	const entrySnippet = entryId ? getEntrySnippet(thread, entryId) : null;
	const entryLine = entrySnippet ? `\n\n**Entry ${entryId}:** ${entrySnippet}` : "";

	if (thread.summary) {
		return `## Referenced Thread: ${thread.id}\n\n**Summary:**\n${thread.summary}\n\n**First message:** ${thread.firstMessage}${entryLine}`;
	}

	// No summary available - provide hint
	return `## Referenced Thread: ${thread.id}\n\n**First message:** ${thread.firstMessage}${entryLine}\n\n_No summary available. Use the \`read_thread\` tool with thread_id "${thread.id}" to see the full conversation._`;
}

/**
 * Resolve thread references in a prompt
 */
function resolveThreadReferences(prompt: string, currentCwd: string): { resolvedPrompt: string; contexts: string[] } {
	const contexts: string[] = [];
	const allThreads = getAllThreads(currentCwd, true); // Search globally for references

	const resolvedPrompt = prompt.replace(THREAD_REF_PATTERN, (match, threadId, entryId) => {
		const thread = allThreads.find((t) => t.id === threadId);
		if (thread) {
			contexts.push(extractThreadContext(thread, entryId));
			return entryId ? `@thread:${threadId}#${entryId}` : `@thread:${threadId}`;
		}
		return match; // Keep unresolved references as-is
	});

	return { resolvedPrompt, contexts };
}

class ThreadReferenceEditor extends CustomEditor {
	private opening = false;

	constructor(
		tui: TUI,
		theme: EditorTheme,
		keybindings: any,
		private ui: ExtensionContext["ui"],
		private getCwd: () => string,
	) {
		super(tui, theme, keybindings);
		this.tui = tui;
	}

	private tui: TUI;

	handleInput(data: string): void {
		if (this.opening) return;

		if (data === "@" && this.shouldTriggerThreadPicker()) {
			this.opening = true;

			// Close the built-in @ file autocomplete UI and open the thread picker.
			// We don't mutate the editor text here to reduce flicker; we replace the
			// leading "@" only after a thread is selected.
			if (this.isShowingAutocomplete()) {
				super.handleInput("\x1b");
			}
			this.tui.requestRender(true);

			void this.openThreadPicker();
			return;
		}

		super.handleInput(data);
	}

	private shouldTriggerThreadPicker(): boolean {
		const cursor = this.getCursor();
		const line = this.getLines()[cursor.line] ?? "";

		// Cursor is after the first @. If the char immediately before cursor is @,
		// and it's at the start of the line or preceded by whitespace, treat the
		// next @ as the @@ trigger.
		if (cursor.col < 1) return false;
		if (line[cursor.col - 1] !== "@") return false;
		if (cursor.col === 1) return true;

		const before = line[cursor.col - 2];
		return before === " " || before === "\t";
	}

	private async openThreadPicker(): Promise<void> {
		try {
			const result = await this.ui.custom<ThreadInfo | null>(
				(_tui, theme, _kb, done) => new ThreadPickerOverlay(theme, this.getCwd(), done),
				{ overlay: true },
			);

			if (result) {
				// Replace the leading '@' (typed as @@ trigger) with @thread:...
				super.handleInput("\x7f");
				this.insertTextAtCursor(`@thread:${result.id} `);
				// Inserting @thread:... would re-trigger file autocomplete; close it.
				if (this.isShowingAutocomplete()) {
					super.handleInput("\x1b");
				}
				this.tui.requestRender(true);
			} else {
				// Ensure screen refresh after closing overlay even if cancelled.
				this.tui.requestRender(true);
			}
		} finally {
			this.opening = false;
		}
	}
}

export default function (pi: ExtensionAPI) {
	// @@ trigger: open thread picker overlay and insert @thread:... at cursor.
	const attachEditor = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		ctx.ui.setEditorComponent((tui, theme, keybindings) => new ThreadReferenceEditor(tui, theme, keybindings, ctx.ui, () => ctx.cwd));
	};

	pi.on("session_start", (_event, ctx) => {
		attachEditor(ctx);
	});

	pi.on("session_switch", (_event, ctx) => {
		attachEditor(ctx);
	});

	pi.registerShortcut(Key.ctrl("r"), {
		description: "Insert thread reference",
		handler: async (ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("Thread picker requires interactive mode", "error");
				return;
			}

			const result = await ctx.ui.custom<ThreadInfo | null>(
				(_tui, theme, _kb, done) => new ThreadPickerOverlay(theme, ctx.cwd, done),
				{ overlay: true },
			);

			if (result) {
				const currentText = ctx.ui.getEditorText();
				ctx.ui.setEditorText(currentText + `@thread:${result.id} `);
				ctx.ui.notify(`Inserted reference to: ${result.firstMessage.slice(0, 40)}...`, "info");
			}
		},
	});

	// Inject context when prompt contains thread references
	pi.on("before_agent_start", async (event, ctx) => {
		const { contexts } = resolveThreadReferences(event.prompt, ctx.cwd);

		if (contexts.length === 0) {
			return; // No thread references found
		}

		// Inject contexts as a message
		const contextMessage = contexts.join("\n\n---\n\n");

		return {
			message: {
				customType: "thread-reference",
				content: contextMessage,
				display: true,
			},
		};
	});
}
