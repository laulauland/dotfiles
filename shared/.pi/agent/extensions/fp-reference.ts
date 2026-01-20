/**
 * FP Issue Reference Extension - Reference FP issue context in your prompts
 *
 * Features:
 * - /fp command to open fp issue picker
 * - Shows all issues in the current fp project with hierarchical view
 * - Parent issues can be expanded/collapsed to show children
 * - Displays issue details including title, status, and description
 * - Inserts @fp:SHORTID reference at cursor (e.g., @fp:sfsb)
 * - Automatically injects issue context on prompt submit
 *
 * Usage:
 * 1. Type /fp while editing a prompt
 * 2. Select an issue from the list
 * 3. Press Enter to insert the reference (or Tab to expand/collapse)
 * 4. Submit your prompt - issue context will be injected automatically
 */

import { type ExtensionAPI, type ExtensionContext, type Theme } from "@mariozechner/pi-coding-agent";
import { matchesKey, visibleWidth } from "@mariozechner/pi-tui";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, unlinkSync } from "node:fs";

// FP reference pattern: @fp:SHORTID (e.g., @fp:sfsb)
const FP_REF_PATTERN = /@fp:([A-Za-z0-9]{4,8})/g;

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
	cwd?: string; // Track which directory this was loaded from
}

// Hierarchical view item
interface HierarchyItem {
	issue: FPIssue;
	children: HierarchyItem[];
	depth: number;
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
	const cwd = process.cwd();
	try {
		// Write output to a temp file to avoid buffer limitations
		tempFile = join(tmpdir(), `fp-issues-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
		execSync(`fp issue list --format json > "${tempFile}"`, {
			stdio: ["pipe", "pipe", "pipe"],
		});

		const output = readFileSync(tempFile, "utf8");
		const data = JSON.parse(output) as { issues: FPIssue[] };
		const issues: FPIssue[] = data.issues || [];

		return { issues, ready: true, cwd };
	} catch (error) {
		return {
			issues: [],
			ready: false,
			error: error instanceof Error ? error.message : String(error),
			cwd,
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

/**
 * Build hierarchical tree from flat issue list
 */
function buildHierarchy(issues: FPIssue[]): HierarchyItem[] {
	const issueById = new Map<string, FPIssue>();
	for (const issue of issues) {
		issueById.set(issue.id, issue);
	}

	const rootItems: HierarchyItem[] = [];
	const itemById = new Map<string, HierarchyItem>();

	// Create HierarchyItem for each issue
	for (const issue of issues) {
		const item: HierarchyItem = { issue, children: [], depth: 0 };
		itemById.set(issue.id, item);
	}

	// Build parent-child relationships
	for (const issue of issues) {
		const item = itemById.get(issue.id)!;
		if (issue.parent && issueById.has(issue.parent)) {
			const parentItem = itemById.get(issue.parent)!;
			parentItem.children.push(item);
		} else {
			rootItems.push(item);
		}
	}

	// Set depth recursively
	function setDepth(items: HierarchyItem[], depth: number): void {
		for (const item of items) {
			item.depth = depth;
			setDepth(item.children, depth + 1);
		}
	}
	setDepth(rootItems, 0);

	// Sort children by status (todo first, then in-progress, then done)
	function sortChildren(items: HierarchyItem[]): void {
		const statusOrder = (s: string) => {
			const lower = s.toLowerCase();
			if (lower === "todo") return 0;
			if (lower === "in-progress" || lower === "in_progress") return 1;
			if (lower === "done" || lower === "closed" || lower === "resolved") return 2;
			return 1;
		};
		items.sort((a, b) => statusOrder(a.issue.status) - statusOrder(b.issue.status));
		for (const item of items) {
			sortChildren(item.children);
		}
	}
	sortChildren(rootItems);

	return rootItems;
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
		const parentIssue = fpContext.issues.find((i) => i.id === issue.parent);
		if (parentIssue) {
			context += `\n**Parent:** ${parentIssue.shortId} - ${parentIssue.title}`;
		}
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
	if (s === "in-progress" || s === "in_progress" || s === "working") return "accent";
	if (s === "blocked" || s === "stuck") return "error";
	return "muted";
}

// Visible item in the list (could be at any depth)
interface VisibleItem {
	issue: FPIssue;
	depth: number;
	hasChildren: boolean;
	isExpanded: boolean;
}

/**
 * FP issue picker overlay component with hierarchical view
 */
class FpPickerOverlay {
	readonly width = 120;
	private readonly maxVisible = 10;
	private readonly previewLines = 12;

	private context: FPContext;
	private hierarchy: HierarchyItem[] = [];
	private visibleItems: VisibleItem[] = [];
	private expandedIds: Set<string> = new Set();
	private query = "";
	private selectedIndex = 0;
	private scrollOffset = 0;

	constructor(
		private theme: Theme,
		private done: (result: FPIssue | null) => void,
	) {
		this.context = loadFpIssues();
		if (this.context.ready) {
			this.hierarchy = buildHierarchy(this.context.issues);
		}
		this.rebuildVisibleItems();
	}

	private rebuildVisibleItems(): void {
		this.visibleItems = [];

		if (!this.context.ready) {
			return;
		}

		const lowerQuery = this.query.toLowerCase();

		// If searching, show flat filtered list
		if (this.query) {
			for (const issue of this.context.issues) {
				if (
					issue.id.toLowerCase().includes(lowerQuery) ||
					issue.shortId.toLowerCase().includes(lowerQuery) ||
					issue.title.toLowerCase().includes(lowerQuery) ||
					(issue.description && issue.description.toLowerCase().includes(lowerQuery))
				) {
					this.visibleItems.push({
						issue,
						depth: 0,
						hasChildren: false,
						isExpanded: false,
					});
				}
			}
		} else {
			// Build visible list from hierarchy respecting expansion state
			const addItems = (items: HierarchyItem[]): void => {
				for (const item of items) {
					const hasChildren = item.children.length > 0;
					const isExpanded = this.expandedIds.has(item.issue.id);

					this.visibleItems.push({
						issue: item.issue,
						depth: item.depth,
						hasChildren,
						isExpanded,
					});

					// Only add children if expanded
					if (isExpanded && hasChildren) {
						addItems(item.children);
					}
				}
			};
			addItems(this.hierarchy);
		}

		// Reset selection if out of bounds
		if (this.selectedIndex >= this.visibleItems.length) {
			this.selectedIndex = Math.max(0, this.visibleItems.length - 1);
		}
		if (this.scrollOffset > this.selectedIndex) {
			this.scrollOffset = this.selectedIndex;
		}
	}

	private toggleExpand(issueId: string): void {
		if (this.expandedIds.has(issueId)) {
			this.expandedIds.delete(issueId);
		} else {
			this.expandedIds.add(issueId);
		}
		this.rebuildVisibleItems();
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

		if (issue.parent) {
			const parentIssue = this.context.issues.find((i) => i.id === issue.parent);
			if (parentIssue) {
				lines.push(`Parent: ${parentIssue.shortId} - ${parentIssue.title}`);
			}
		}

		// Count children
		const childCount = this.context.issues.filter((i) => i.parent === issue.id).length;
		if (childCount > 0) {
			lines.push(`Children: ${childCount} sub-issue${childCount > 1 ? "s" : ""}`);
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
			const item = this.visibleItems[this.selectedIndex];
			this.done(item?.issue ?? null);
			return;
		}

		// Tab or Right arrow to expand, Left arrow to collapse
		if (matchesKey(data, "tab") || matchesKey(data, "right")) {
			const item = this.visibleItems[this.selectedIndex];
			if (item?.hasChildren && !item.isExpanded) {
				this.toggleExpand(item.issue.id);
			}
			return;
		}

		if (matchesKey(data, "left")) {
			const item = this.visibleItems[this.selectedIndex];
			if (item?.hasChildren && item.isExpanded) {
				this.toggleExpand(item.issue.id);
			}
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
			if (this.selectedIndex < this.visibleItems.length - 1) {
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
				this.rebuildVisibleItems();
			}
			return;
		}

		// Regular character input
		if (data.length === 1 && data.charCodeAt(0) >= 32) {
			this.query += data;
			this.rebuildVisibleItems();
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
		} else if (this.visibleItems.length === 0) {
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
		} else if (this.visibleItems.length === 0) {
			for (let i = 0; i < this.maxVisible; i++) {
				if (i === 0) lines.push(row(th.fg("dim", "   No issues found")));
				else lines.push(row(""));
			}
		} else {
			const visibleSlice = this.visibleItems.slice(
				this.scrollOffset,
				this.scrollOffset + this.maxVisible,
			);

			for (let i = 0; i < this.maxVisible; i++) {
				if (i < visibleSlice.length) {
					const item = visibleSlice[i]!;
					const actualIndex = this.scrollOffset + i;
					const isSelected = actualIndex === this.selectedIndex;

					// Build indent and expand indicator
					const indent = "  ".repeat(item.depth);
					let expandIcon = "  ";
					if (item.hasChildren) {
						expandIcon = item.isExpanded ? "▼ " : "▶ ";
					}

					const prefix = isSelected ? th.fg("accent", " ❯") : "  ";

					// ID (shortened)
					const idWidth = 10;
					const idStr = item.issue.shortId;
					const fittedId = visibleWidth(idStr) > idWidth ? truncate(idStr, idWidth) : pad(idStr, idWidth);
					const id = th.fg("muted", fittedId);
					const separator = th.fg("dim", "│ ");

					// Status badge
					const statusColor = getStatusColor(item.issue.status);
					const status = th.fg(statusColor, `[${item.issue.status}]`);
					const statusSep = " ";

					// Title
					const title = item.issue.title || "untitled";
					const indentStr = th.fg("dim", indent + expandIcon);
					// Calculate remaining width for title
					const prefixW = 3; // " ❯"
					const indentW = item.depth * 2 + 2; // indent + expand icon
					const fixedWidth = prefixW + indentW + idWidth + 2 + visibleWidth(`[${item.issue.status}]`) + 1;
					const maxTitleWidth = Math.max(10, innerW - fixedWidth - 1);
					const truncatedTitle = truncate(title, maxTitleWidth);
					const titleStyled = isSelected ? th.fg("text", truncatedTitle) : th.fg("muted", truncatedTitle);

					lines.push(row(`${prefix}${indentStr}${id}${separator}${status}${statusSep}${titleStyled}`));
				} else {
					lines.push(row(""));
				}
			}
		}

		// Scroll indicator
		if (this.context.ready && this.visibleItems.length > this.maxVisible) {
			const shown = `${this.scrollOffset + 1}-${Math.min(
				this.scrollOffset + this.maxVisible,
				this.visibleItems.length,
			)}`;
			const total = this.visibleItems.length;
			lines.push(row(th.fg("dim", ` (${shown} of ${total})`)));
		} else {
			lines.push(row(""));
		}

		// Preview section
		lines.push(th.fg("border", `├${"─".repeat(innerW)}┤`));

		const selectedItem = this.visibleItems[this.selectedIndex];
		if (selectedItem) {
			lines.push(row(` ${th.fg("accent", "Preview:")} ${th.fg("dim", selectedItem.issue.shortId)}`));

			const preview = this.getPreview(selectedItem.issue);
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
		lines.push(row(th.fg("dim", " ↑↓ navigate  ◀▶/Tab expand  [Enter] select  [Esc] cancel")));

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

	// Load/refresh issues if not already loaded, cwd changed, or if fp is available
	const cwd = process.cwd();
	if ((!fpContext.ready || fpContext.cwd !== cwd) && isFpAvailable()) {
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
