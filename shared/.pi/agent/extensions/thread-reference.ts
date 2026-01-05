/**
 * Thread Reference Extension - Reference past conversations in your prompts
 *
 * Inspired by ampcode.com's "Referencing Threads" feature.
 *
 * Features:
 * - Ctrl+T shortcut to open thread picker
 * - Tab to toggle between DIRECTORY (current cwd) and GLOBAL (all sessions)
 * - Fuzzy search through thread titles
 * - Inserts @thread:UUID reference at cursor
 * - Automatically injects context from referenced threads on prompt submit
 *
 * Usage:
 * 1. Press Ctrl+T while editing a prompt
 * 2. Search for a thread by typing
 * 3. Use Tab to toggle between local and global threads
 * 4. Press Enter to insert the reference
 * 5. Submit your prompt - context will be injected automatically
 */

import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { matchesKey, Key, truncateToWidth } from "@mariozechner/pi-tui";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";
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
					const first = JSON.parse(lines[0]);
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
						const entry = JSON.parse(lines[i]);

						// Count messages
						if (entry.type === "message") {
							messageCount++;
							if (!firstMessage && entry.message?.role === "user") {
								const textContent = entry.message.content
									?.filter((c: any) => c.type === "text")
									.map((c: any) => c.text)
									.join(" ");
								if (textContent) {
									firstMessage = textContent;
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
	let threads: ThreadInfo[] = [];

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
	} else {
		return date.toLocaleDateString([], { month: "short", day: "numeric" });
	}
}

/**
 * Thread picker UI component
 */
class ThreadPicker {
	private theme: Theme;
	private done: (result: ThreadInfo | null) => void;
	private tui: { requestRender: (force?: boolean) => void };
	private currentCwd: string;
	private globalScope: boolean = false;
	private query: string = "";
	private threads: ThreadInfo[] = [];
	private filteredThreads: ThreadInfo[] = [];
	private selectedIndex: number = 0;
	private scrollOffset: number = 0;
	private maxVisible: number = 10;

	constructor(
		tui: { requestRender: () => void },
		theme: Theme,
		currentCwd: string,
		done: (result: ThreadInfo | null) => void
	) {
		this.tui = tui;
		this.theme = theme;
		this.currentCwd = currentCwd;
		this.done = done;
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
					fuzzyMatch(this.query, t.cwd)
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
			if (this.filteredThreads.length > 0) {
				this.done(this.filteredThreads[this.selectedIndex]);
			} else {
				this.done(null);
			}
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
				this.tui.requestRender(true); // Force full re-render
			}
			return;
		}

		if (matchesKey(data, Key.down)) {
			if (this.selectedIndex < this.filteredThreads.length - 1) {
				this.selectedIndex++;
				if (this.selectedIndex >= this.scrollOffset + this.maxVisible) {
					this.scrollOffset = this.selectedIndex - this.maxVisible + 1;
				}
				this.tui.requestRender(true); // Force full re-render
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
		// Check if all characters are printable (>= 32)
		const isPrintable = data.length > 0 && [...data].every(c => c.charCodeAt(0) >= 32);
		if (isPrintable) {
			this.query += data;
			this.filterThreads();
			this.tui.requestRender(true);
		}
	}

	render(width: number): string[] {
		const th = this.theme;
		
		// Panel dimensions - use most of the width for cleaner look
		const PANEL_WIDTH = Math.min(100, width - 8);
		const INNER_WIDTH = PANEL_WIDTH - 4; // Account for border + padding
		const leftPad = Math.floor((width - PANEL_WIDTH) / 2);
		const pad = " ".repeat(leftPad);
		
		// Helper to get visible width (strips ANSI codes)
		const getVisibleWidth = (str: string): number => {
			return str.replace(/\x1b\[[0-9;]*m/g, '').length;
		};
		
		// Helper to create a boxed line with transparent sides
		// Uses spaces for left padding (preserving background is not possible in TUI)
		const boxLine = (content: string, align: "left" | "center" = "left"): string => {
			const contentWidth = getVisibleWidth(content);
			let padded: string;
			if (align === "center") {
				const leftSpace = Math.floor((INNER_WIDTH - contentWidth) / 2);
				const rightSpace = INNER_WIDTH - contentWidth - leftSpace;
				padded = " ".repeat(Math.max(0, leftSpace)) + content + " ".repeat(Math.max(0, rightSpace));
			} else {
				padded = content + " ".repeat(Math.max(0, INNER_WIDTH - contentWidth));
			}
			return truncateToWidth(pad + th.fg("borderMuted", "│") + " " + padded + " " + th.fg("borderMuted", "│"), width);
		};
		
		const boxLines: string[] = [];
		
		// Top border
		boxLines.push(truncateToWidth(
			pad + th.fg("borderMuted", "╭" + "─".repeat(PANEL_WIDTH - 2) + "╮"), 
			width
		));
		
		// Title with tabs
		const dirTab = this.globalScope
			? th.fg("dim", "DIRECTORY")
			: th.fg("accent", th.bold("DIRECTORY"));
		const globalTab = this.globalScope
			? th.fg("accent", th.bold("GLOBAL"))
			: th.fg("dim", "GLOBAL");
		const tabLine = `${dirTab} ${th.fg("borderMuted", "│")} ${globalTab}`;
		boxLines.push(boxLine(tabLine, "center"));
		
		// Search input
		const searchPrompt = th.fg("accent", "❯ ");
		const searchText = this.query || th.fg("dim", "Search threads...");
		boxLines.push(boxLine(searchPrompt + searchText));
		
		// Divider
		boxLines.push(truncateToWidth(
			pad + th.fg("borderMuted", "├" + "─".repeat(PANEL_WIDTH - 2) + "┤"),
			width
		));
		
		// Thread list - always show maxVisible slots
		const visibleThreads = this.filteredThreads.slice(
			this.scrollOffset,
			this.scrollOffset + this.maxVisible
		);
		
		for (let i = 0; i < this.maxVisible; i++) {
			if (i < visibleThreads.length) {
				const thread = visibleThreads[i];
				const actualIndex = this.scrollOffset + i;
				const isSelected = actualIndex === this.selectedIndex;
				
				const prefix = isSelected ? th.fg("accent", "❯ ") : "  ";
				const date = th.fg("muted", formatDate(thread.modified));
				
				// Show cwd in global mode
				let cwdDisplay = "";
				if (this.globalScope) {
					cwdDisplay = th.fg("dim", ` [${formatPath(thread.cwd)}]`);
				}
				
				// Truncate message to fit
				const metaLength = 15 + (this.globalScope ? 25 : 0);
				const maxMsgLength = Math.max(20, INNER_WIDTH - metaLength);
				let msg = thread.firstMessage;
				if (msg.length > maxMsgLength) {
					msg = msg.slice(0, maxMsgLength - 1) + "…";
				}
				
				const msgColor = isSelected ? "text" : "muted";
				boxLines.push(boxLine(`${prefix}${date} ${th.fg(msgColor, msg)}${cwdDisplay}`));
			} else if (i === 0 && this.filteredThreads.length === 0) {
				boxLines.push(boxLine(th.fg("dim", "  No threads found")));
			} else {
				boxLines.push(boxLine("")); // Empty line to maintain height
			}
		}
		
		// Status line (scroll indicator or empty)
		if (this.filteredThreads.length > this.maxVisible) {
			const shown = `${this.scrollOffset + 1}-${Math.min(this.scrollOffset + this.maxVisible, this.filteredThreads.length)}`;
			const total = this.filteredThreads.length;
			boxLines.push(boxLine(th.fg("dim", `(${shown} of ${total})`), "center"));
		} else {
			boxLines.push(boxLine(""));
		}
		
		// Footer
		boxLines.push(boxLine(th.fg("dim", "[Tab] scope  [Enter] select  [Esc] cancel"), "center"));
		
		// Bottom border
		boxLines.push(truncateToWidth(
			pad + th.fg("borderMuted", "╰" + "─".repeat(PANEL_WIDTH - 2) + "╯"),
			width
		));
		
		return boxLines;
	}

	invalidate(): void {
		// No caching - always re-render
	}
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
function resolveThreadReferences(
	prompt: string,
	currentCwd: string
): { resolvedPrompt: string; contexts: string[] } {
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

export default function (pi: ExtensionAPI) {
	// Register Ctrl+R shortcut for thread picker
	pi.registerShortcut(Key.ctrl("r"), {
		description: "Insert thread reference",
		handler: async (ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("Thread picker requires interactive mode", "error");
				return;
			}

			const result = await ctx.ui.custom<ThreadInfo | null>((tui, theme, done) => {
				return new ThreadPicker(tui, theme, ctx.cwd, done);
			});

			if (result) {
				const currentText = ctx.ui.getEditorText();
				ctx.ui.setEditorText(currentText + `@thread:${result.id} `);
				ctx.ui.notify(`Inserted reference to: ${result.firstMessage.slice(0, 40)}...`, "info");
			}
		},
	});

	// Inject context when prompt contains thread references
	pi.on("before_agent_start", async (event, ctx) => {
		const { resolvedPrompt, contexts } = resolveThreadReferences(
			event.prompt,
			ctx.cwd
		);

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
