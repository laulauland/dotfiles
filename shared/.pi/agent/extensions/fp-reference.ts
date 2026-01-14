/**
 * FP Issue Reference Extension - Reference FP issue context in your prompts
 *
 * Features:
 * - /fp command to open fp issue picker
 * - Shows all issues in the current fp project
 * - Displays issue details including title, status, and description
 * - Inserts @fp:SHORTID reference at cursor (e.g., @fp:sfsb)
 * - Automatically injects issue context on prompt submit
 *
 * Usage:
 * 1. Type /fp while editing a prompt
 * 2. Select an issue from the list
 * 3. Press Enter to insert the reference
 * 4. Submit your prompt - issue context will be injected automatically
 */

import { type ExtensionAPI, type ExtensionContext, type Theme } from "@mariozechner/pi-coding-agent";
import { matchesKey, visibleWidth } from "@mariozechner/pi-tui";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, unlinkSync } from "node:fs";

// FP reference pattern: @fp:SHORTID (e.g., @fp:sfsb)
const FP_REF_PATTERN = /@fp:([A-Za-z0-9]{4})/g;

interface FPIssue {
	id: string;
	shortId: string;
	title: string;
	status: string;
	description?: string;
	assignee?: string;
	priority: string | null;
	parent: string | null;
	dependencies: string[];
	branch: string;
	createdAt: string;
	updatedAt: string;
}

interface FPContext {
	issues: FPIssue[];
	ready: boolean;
	error?: string;
}

// Module-level cache for issues (used by getIssueContext)
let fpContext: FPContext = { issues: [], ready: false };

function isFpAvailable(): boolean {
	try {
		// Try to run fp with any option to check if it's available
		execSync("fp --version", { stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
}

function loadFpIssues(): FPContext {
	let tempFile: string | null = null;
	try {
		// Write output to a temp file to avoid buffer limitations
		tempFile = join(tmpdir(), `fp-issues-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
		execSync(`fp issue list --format json > "${tempFile}"`, {
			stdio: ["pipe", "pipe", "pipe"],
		});

		const output = readFileSync(tempFile, "utf8");
		const data = JSON.parse(output) as { issues: FPIssue[] };
		const issues: FPIssue[] = data.issues || [];

		return { issues, ready: true };
	} catch (error) {
		return {
			issues: [],
			ready: false,
			error: error instanceof Error ? error.message : String(error),
		};
	} finally {
		// Clean up temp file
		if (tempFile) {
			try {
				unlinkSync(tempFile);
			} catch {
				// Ignore cleanup errors
			}
		}
	}
}

function getIssueContext(shortId: string): string {
	// Find issue by shortId in cached data
	const issue = fpContext.issues.find((i) => i.shortId === shortId);

	if (!issue) {
		return `[Issue ${shortId} not found]`;
	}

	// Format context from issue data
	let context = `## ${issue.title}\n\n`;
	context += `**ID:** ${issue.shortId} | **Status:** ${issue.status} | **Priority:** ${issue.priority || "N/A"}\n\n`;

	if (issue.description) {
		context += `### Description\n\n${issue.description}`;
	}

	if (issue.assignee) {
		context += `\n\n**Assignee:** ${issue.assignee}`;
	}

	if (issue.parent) {
		context += `\n**Parent:** ${issue.parent}`;
	}

	if (issue.dependencies.length > 0) {
		context += `\n**Dependencies:** ${issue.dependencies.join(", ")}`;
	}

	return context.trim();
}

function formatIssueLabel(issue: FPIssue): string {
	return `${issue.shortId} [${issue.status}] ${issue.title}`;
}

function getStatusColor(status: string): string {
	const s = status.toLowerCase();
	if (s === "done" || s === "closed" || s === "resolved") return "success";
	if (s === "in-progress" || s === "in-progress" || s === "working") return "accent";
	if (s === "blocked" || s === "stuck") return "error";
	return "muted";
}

/**
 * FP issue picker overlay component
 */
class FpPickerOverlay {
	readonly width = 120;
	private readonly maxVisible = 8;
	private readonly previewLines = 14;

	private context: FPContext;
	private filteredIssues: FPIssue[] = [];
	private query = "";
	private selectedIndex = 0;
	private scrollOffset = 0;

	constructor(
		private theme: Theme,
		private done: (result: FPIssue | null) => void,
	) {
		this.context = loadFpIssues();
		this.filterIssues();
	}

	private filterIssues(): void {
		if (!this.context.ready) {
			this.filteredIssues = [];
			return;
		}

		if (!this.query) {
			this.filteredIssues = this.context.issues;
		} else {
			const lowerQuery = this.query.toLowerCase();
			this.filteredIssues = this.context.issues.filter(
				(i) =>
					i.id.toLowerCase().includes(lowerQuery) ||
					i.title.toLowerCase().includes(lowerQuery) ||
					(i.description && i.description.toLowerCase().includes(lowerQuery)),
			);
		}
		this.selectedIndex = 0;
		this.scrollOffset = 0;
	}

	private getPreview(issue: FPIssue): string[] {
		const lines: string[] = [];

		if (issue.description) {
			lines.push("Description:");
			const descLines = issue.description.split("\n").slice(0, 6);
			lines.push(...descLines);
			if (issue.description.split("\n").length > 6) {
				lines.push("...");
			}
		} else {
			lines.push("No description");
		}

		if (issue.assignee) {
			lines.push("");
			lines.push(`Assignee: ${issue.assignee}`);
		}

		if (issue.priority) {
			lines.push(`Priority: ${issue.priority}`);
		}

		if (issue.parentId) {
			lines.push(`Parent: ${issue.parentId}`);
		}

		// Pad to ensure consistent height
		while (lines.length < this.previewLines) {
			lines.push("");
		}

		return lines;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			this.done(null);
			return;
		}

		if (matchesKey(data, "return")) {
			this.done(this.filteredIssues[this.selectedIndex] ?? null);
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
			if (this.selectedIndex < this.filteredIssues.length - 1) {
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
				this.filterIssues();
			}
			return;
		}

		// Regular character input
		if (data.length === 1 && data.charCodeAt(0) >= 32) {
			this.query += data;
			this.filterIssues();
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

		const truncate = (s: string, maxW: number) => {
			if (visibleWidth(s) <= maxW) return s;
			let result = "";
			let width = 0;
			for (const char of s) {
				const charWidth = visibleWidth(char);
				if (width + charWidth > maxW - 1) break;
				result += char;
				width += charWidth;
			}
			return result + "…";
		};

		const row = (content: string) => th.fg("border", "│") + pad(content, innerW) + th.fg("border", "│");

		// Top border
		lines.push(th.fg("border", `╭${"─".repeat(innerW)}╮`));

		// Title
		lines.push(row(` ${th.fg("accent", th.bold("FP Issues"))}`));

		// Search input
		const searchPrompt = th.fg("accent", "❯ ");
		if (!this.context.ready) {
			const errorText = this.context.error || "Not an FP project";
			lines.push(row(` ${th.fg("error", errorText)}`));
		} else if (this.filteredIssues.length === 0) {
			lines.push(row(` ${searchPrompt}${this.query || th.fg("dim", "Search issues...")}`));
		} else {
			lines.push(row(` ${searchPrompt}${this.query || th.fg("dim", "Search issues...")}`));
		}

		// Divider
		lines.push(th.fg("border", `├${"─".repeat(innerW)}┤`));

		// Issue list
		if (!this.context.ready) {
			const errorText = this.context.error || "Not in an FP project";
			const helpText = "Run 'fp init' to setup";
			for (let i = 0; i < this.maxVisible; i++) {
				if (i === 0) lines.push(row(th.fg("error", `   ${errorText}`)));
				else if (i === 1) lines.push(row(th.fg("dim", `   ${helpText}`)));
				else lines.push(row(""));
			}
		} else if (this.filteredIssues.length === 0) {
			for (let i = 0; i < this.maxVisible; i++) {
				if (i === 0) lines.push(row(th.fg("dim", "   No issues found")));
				else lines.push(row(""));
			}
		} else {
			const visibleIssues = this.filteredIssues.slice(
				this.scrollOffset,
				this.scrollOffset + this.maxVisible,
			);

			// Calculate max ID/Status width for alignment
			const idWidth = 14;

			for (let i = 0; i < this.maxVisible; i++) {
				if (i < visibleIssues.length) {
					const issue = visibleIssues[i]!;
					const actualIndex = this.scrollOffset + i;
					const isSelected = actualIndex === this.selectedIndex;

					const prefix = isSelected ? th.fg("accent", " ▶ ") : "   ";
					const idStr = issue.id;
					const fittedId = visibleWidth(idStr) > idWidth ? truncate(idStr, idWidth) : pad(idStr, idWidth);
					const id = th.fg("muted", fittedId);
					const separator = th.fg("dim", "│ ");

					// Status badge
					const statusColor = getStatusColor(issue.status);
					const status = th.fg(statusColor, `[${issue.status}]`);
					const statusSep = th.fg("dim", " ");

					const title = issue.title || "untitled";
					const fixedWidth = 3 + idWidth + 2 + status.length + 1; // prefix + id + separator + status
					const maxTitleWidth = Math.max(10, innerW - fixedWidth - 1);
					const truncatedTitle = truncate(title, maxTitleWidth);
					const titleStyled = isSelected ? th.fg("text", truncatedTitle) : th.fg("muted", truncatedTitle);

					lines.push(row(`${prefix}${id}${separator}${status}${statusSep}${titleStyled}`));
				} else {
					lines.push(row(""));
				}
			}
		}

		// Scroll indicator
		if (this.context.ready && this.filteredIssues.length > this.maxVisible) {
			const shown = `${this.scrollOffset + 1}-${Math.min(
				this.scrollOffset + this.maxVisible,
				this.filteredIssues.length,
			)}`;
			const total = this.filteredIssues.length;
			lines.push(row(th.fg("dim", ` (${shown} of ${total})`)));
		} else {
			lines.push(row(""));
		}

		// Preview section
		lines.push(th.fg("border", `├${"─".repeat(innerW)}┤`));

		const selectedIssue = this.filteredIssues[this.selectedIndex];
		if (selectedIssue) {
			lines.push(row(` ${th.fg("accent", "Preview:")} ${th.fg("dim", selectedIssue.id)}`));

			const preview = this.getPreview(selectedIssue);
			for (let i = 0; i < this.previewLines; i++) {
				const previewLine = preview[i] ?? "";
				const truncatedPreview = truncate(previewLine, innerW - 2);
				lines.push(row(` ${th.fg("dim", truncatedPreview)}`));
			}
		} else {
			lines.push(row(th.fg("dim", " No issue selected")));
			for (let i = 0; i < this.previewLines + 1; i++) {
				lines.push(row(""));
			}
		}

		// Footer
		lines.push(th.fg("border", `├${"─".repeat(innerW)}┤`));
		lines.push(row(th.fg("dim", " ↑↓ navigate  [Enter] select  [Esc] cancel")));

		// Bottom border
		lines.push(th.fg("border", `╰${"─".repeat(innerW)}╯`));

		return lines;
	}

	invalidate(): void {}
	dispose(): void {}
}

/**
 * Resolve fp references in a prompt and capture context
 */
function resolveFpReferences(prompt: string): { resolvedPrompt: string; contexts: string[] } {
	const contexts: string[] = [];

	// Load/refresh issues if not already loaded or if fp is available
	if (!fpContext.ready && isFpAvailable()) {
		fpContext = loadFpIssues();
	}

	const resolvedPrompt = prompt.replace(FP_REF_PATTERN, (match, issueId) => {
		const context = getIssueContext(issueId);
		// Preserve the reference in the prompt
		return match;
	});

	// Collect all referenced issues
	const matches = prompt.matchAll(FP_REF_PATTERN);
	for (const match of matches) {
		const issueId = match[1];
		const context = getIssueContext(issueId);
		contexts.push(context);
	}

	return { resolvedPrompt, contexts };
}

export default function (pi: ExtensionAPI) {
	// Register the /fp command
	pi.registerCommand("fp", {
		description: "Insert FP issue reference",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("FP picker requires interactive mode", "error");
				return;
			}

			if (!isFpAvailable()) {
				ctx.ui.notify("FP CLI is not installed (https://github.com/mariozechner/fp)", "error");
				return;
			}

			const result = await ctx.ui.custom<FPIssue | null>(
				(_tui, theme, _kb, done) => new FpPickerOverlay(theme, done),
				{ overlay: true },
			);

			if (result) {
				const currentText = ctx.ui.getEditorText();
				ctx.ui.setEditorText(currentText + `@fp:${result.shortId} `);
				ctx.ui.notify(`Inserted reference to: ${formatIssueLabel(result).slice(0, 40)}...`, "info");
			}
		},
	});

	// Inject context when prompt contains fp references
	pi.on("before_agent_start", async (event, _ctx) => {
		const { contexts } = resolveFpReferences(event.prompt);

		if (contexts.length === 0) {
			return;
		}

		const contextMessage = contexts.join("\n\n---\n\n");

		return {
			message: {
				customType: "fp-reference",
				content: contextMessage,
				display: true,
			},
		};
	});
}