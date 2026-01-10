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
import { Key, matchesKey, truncateToWidth, type EditorTheme, type TUI, visibleWidth } from "@mariozechner/pi-tui";
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
 * Fuzzy match a query against text
 */
function fuzzyMatch(query: string, text: string): boolean {
	if (!query) return true;
	const lowerQuery = query.toLowerCase();
	const lowerText = text.toLowerCase();

	// Simple substring match for now
	return lowerText.includes(lowerQuery);
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
 * Thread picker UI component
 */
class ThreadPicker {
	readonly width = 100;

	private globalScope = false;
	private query = "";
	private threads: ThreadInfo[] = [];
	private filteredThreads: ThreadInfo[] = [];
	private selectedIndex = 0;
	private scrollOffset = 0;
	private maxVisible = 10;

	constructor(
		private tui: { requestRender: (force?: boolean) => void },
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
			this.filteredThreads = this.threads.filter(
				(t) =>
					fuzzyMatch(this.query, t.firstMessage) ||
					fuzzyMatch(this.query, t.id) ||
					fuzzyMatch(this.query, t.cwd),
			);
		}
		this.selectedIndex = 0;
		this.scrollOffset = 0;
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.done(null);
			return;
		}

		if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
			this.done(this.filteredThreads[this.selectedIndex] ?? null);
			return;
		}

		if (matchesKey(data, Key.tab)) {
			this.globalScope = !this.globalScope;
			this.refreshThreads();
			this.tui.requestRender(true);
			return;
		}

		if (matchesKey(data, Key.up)) {
			if (this.selectedIndex > 0) {
				this.selectedIndex--;
				if (this.selectedIndex < this.scrollOffset) {
					this.scrollOffset = this.selectedIndex;
				}
				this.tui.requestRender(true);
			}
			return;
		}

		if (matchesKey(data, Key.down)) {
			if (this.selectedIndex < this.filteredThreads.length - 1) {
				this.selectedIndex++;
				if (this.selectedIndex >= this.scrollOffset + this.maxVisible) {
					this.scrollOffset = this.selectedIndex - this.maxVisible + 1;
				}
				this.tui.requestRender(true);
			}
			return;
		}

		if (matchesKey(data, Key.backspace)) {
			if (this.query.length > 0) {
				this.query = this.query.slice(0, -1);
				this.filterThreads();
				this.tui.requestRender(true);
			}
			return;
		}

		// Regular character input - handle single chars or pasted text
		const isPrintable = data.length > 0 && [...data].every((c) => c.charCodeAt(0) >= 32);
		if (isPrintable) {
			this.query += data;
			this.filterThreads();
			this.tui.requestRender(true);
		}
	}

	render(width: number): string[] {
		const th = this.theme;

		const PANEL_WIDTH = Math.max(40, Math.min(this.width, width));
		const INNER_WIDTH = PANEL_WIDTH - 4; // borders + spaces

		const clip = (s: string) => truncateToWidth(s, INNER_WIDTH, "");

		const boxLine = (content: string, align: "left" | "center" = "left"): string => {
			const clipped = clip(content);
			const contentWidth = visibleWidth(clipped);

			let padded: string;
			if (align === "center") {
				const leftSpace = Math.floor((INNER_WIDTH - contentWidth) / 2);
				const rightSpace = INNER_WIDTH - contentWidth - leftSpace;
				padded =
					" ".repeat(Math.max(0, leftSpace)) +
					clipped +
					" ".repeat(Math.max(0, rightSpace));
			} else {
				padded = clipped + " ".repeat(Math.max(0, INNER_WIDTH - contentWidth));
			}

			return th.fg("borderMuted", "│") + " " + padded + " " + th.fg("borderMuted", "│");
		};

		const lines: string[] = [];

		// Top border
		lines.push(th.fg("borderMuted", `╭${"─".repeat(PANEL_WIDTH - 2)}╮`));

		// Title with tabs
		const dirTab = this.globalScope
			? th.fg("dim", "DIRECTORY")
			: th.fg("accent", th.bold("DIRECTORY"));
		const globalTab = this.globalScope
			? th.fg("accent", th.bold("GLOBAL"))
			: th.fg("dim", "GLOBAL");
		const tabLine = `${dirTab} ${th.fg("borderMuted", "│")} ${globalTab}`;
		lines.push(boxLine(tabLine, "center"));

		// Search input
		const searchPrompt = th.fg("accent", "❯ ");
		const searchText = this.query || th.fg("dim", "Search threads...");
		lines.push(boxLine(searchPrompt + searchText));

		// Divider
		lines.push(th.fg("borderMuted", `├${"─".repeat(PANEL_WIDTH - 2)}┤`));

		// Thread list - always show maxVisible slots
		const visibleThreads = this.filteredThreads.slice(this.scrollOffset, this.scrollOffset + this.maxVisible);

		for (let i = 0; i < this.maxVisible; i++) {
			if (i < visibleThreads.length) {
				const thread = visibleThreads[i]!;
				const actualIndex = this.scrollOffset + i;
				const isSelected = actualIndex === this.selectedIndex;

				const prefix = isSelected ? th.fg("accent", "❯ ") : "  ";
				const date = th.fg("muted", formatDate(thread.modified));

				let cwdDisplay = "";
				if (this.globalScope) {
					cwdDisplay = th.fg("dim", ` [${formatPath(thread.cwd)}]`);
				}

				const fixedWidth = visibleWidth(`${prefix}${date} `) + visibleWidth(cwdDisplay);
				const maxMsgWidth = Math.max(10, INNER_WIDTH - fixedWidth);
				const msgColor = isSelected ? "text" : "muted";
				const msg = truncateToWidth(th.fg(msgColor, toSingleLine(thread.firstMessage)), maxMsgWidth, "…");

				lines.push(boxLine(`${prefix}${date} ${msg}${cwdDisplay}`));
			} else if (i === 0 && this.filteredThreads.length === 0) {
				lines.push(boxLine(th.fg("dim", "  No threads found")));
			} else {
				lines.push(boxLine(""));
			}
		}

		// Status line (scroll indicator or empty)
		if (this.filteredThreads.length > this.maxVisible) {
			const shown = `${this.scrollOffset + 1}-${Math.min(
				this.scrollOffset + this.maxVisible,
				this.filteredThreads.length,
			)}`;
			const total = this.filteredThreads.length;
			lines.push(boxLine(th.fg("dim", `(${shown} of ${total})`), "center"));
		} else {
			lines.push(boxLine(""));
		}

		// Footer
		lines.push(boxLine(th.fg("dim", "[Tab] scope  [Enter] select  [Esc] cancel"), "center"));

		// Bottom border
		lines.push(th.fg("borderMuted", `╰${"─".repeat(PANEL_WIDTH - 2)}╯`));

		return lines;
	}

	invalidate(): void {}
}

/**
 * Extract context from a thread for injection
 */
function extractThreadContext(thread: ThreadInfo): string {
	if (thread.summary) {
		return `## Referenced Thread: ${thread.id}\n\n**Summary:**\n${thread.summary}\n\n**First message:** ${thread.firstMessage}`;
	}

	// No summary available - provide hint
	return `## Referenced Thread: ${thread.id}\n\n**First message:** ${thread.firstMessage}\n\n_No summary available. Use the \`read_thread\` tool with thread_id "${thread.id}" to see the full conversation._`;
}

/**
 * Resolve thread references in a prompt
 */
function resolveThreadReferences(prompt: string, currentCwd: string): { resolvedPrompt: string; contexts: string[] } {
	const contexts: string[] = [];
	const allThreads = getAllThreads(currentCwd, true); // Search globally for references

	const resolvedPrompt = prompt.replace(THREAD_REF_PATTERN, (match, threadId) => {
		const thread = allThreads.find((t) => t.id === threadId);
		if (thread) {
			contexts.push(extractThreadContext(thread));
			return `@thread:${threadId}`; // Keep the reference but we'll inject context
		}
		return match; // Keep unresolved references as-is
	});

	return { resolvedPrompt, contexts };
}

class ThreadReferenceEditor extends CustomEditor {
	private opening = false;

	constructor(
		private tui: TUI,
		theme: EditorTheme,
		keybindings: any,
		private ui: ExtensionContext["ui"],
		private getCwd: () => string,
	) {
		super(theme, keybindings);
	}

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
				(tui, theme, _kb, done) => new ThreadPicker(tui, theme, this.getCwd(), done),
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
	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setEditorComponent((tui, theme, keybindings) => new ThreadReferenceEditor(tui, theme, keybindings, ctx.ui, () => ctx.cwd));
	});

	pi.registerShortcut(Key.ctrl("r"), {
		description: "Insert thread reference",
		handler: async (ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("Thread picker requires interactive mode", "error");
				return;
			}

			const result = await ctx.ui.custom<ThreadInfo | null>(
				(tui, theme, _kb, done) => new ThreadPicker(tui, theme, ctx.cwd, done),
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
