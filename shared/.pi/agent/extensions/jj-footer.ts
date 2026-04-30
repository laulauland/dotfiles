/**
 * Custom Footer with Jujutsu Integration
 *
 * Replaces the built-in footer with:
 * - Left: jj change_id + bookmarks, cwd
 * - Right: context %, tokens, cost, model + thinking level
 */

import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { execSync } from "child_process";
import { homedir } from "os";

interface JjInfo {
	changeId: string;
	bookmarks: string;
	parentBookmark?: string;
	distance?: number;
	conflicted: boolean;
}

interface FooterSnapshot {
	cwd: string;
	modelId: string;
	thinkingLevel?: string;
	totalInput: number;
	totalOutput: number;
	totalCost: number;
	contextTokens: number;
	contextWindow: number;
}

// Cache footer inputs so render never touches ExtensionContext. Footer render can
// race with session replacement/reload; accessing a stale ctx there crashes pi.
let cachedJjInfo: JjInfo | null = null;
let jjInfoCached = false;
let snapshot: FooterSnapshot = {
	cwd: process.cwd(),
	modelId: "no model",
	totalInput: 0,
	totalOutput: 0,
	totalCost: 0,
	contextTokens: 0,
	contextWindow: 200000,
};

function refreshJjInfo(cwd = snapshot.cwd): void {
	try {
		const execOptions = { cwd, encoding: "utf8" as const, stdio: ["pipe", "pipe", "pipe"] as const };
		// Check if we're in a jj repo
		execSync("jj root", execOptions);

		// Get current change info
		const result = execSync(
			`jj log -r @ -T 'change_id.short() ++ "|" ++ bookmarks ++ "|" ++ conflict' --no-graph`,
			execOptions
		).trim();

		const [changeId, bookmarks, conflict] = result.split("|");

		const info: JjInfo = {
			changeId,
			bookmarks: bookmarks.trim(),
			conflicted: conflict === "true",
		};

		// If no bookmark on current, find closest ancestor with a bookmark
		if (!info.bookmarks) {
			try {
				const closestBookmark = execSync(
					`jj log -r '::@- & bookmarks()' -T 'bookmarks' --no-graph --limit 1`,
					execOptions
				).trim();

				if (closestBookmark) {
					const bookmarkName = closestBookmark.split(" ")[0];
					try {
						const distanceOutput = execSync(
							`jj log -r '(${bookmarkName}::@) ~ ${bookmarkName}' --no-graph -T '"x"'`,
							execOptions
						).trim();
						info.parentBookmark = closestBookmark;
						info.distance = distanceOutput.length;
					} catch {
						info.parentBookmark = closestBookmark;
					}
				}
			} catch {
				// No ancestor with bookmark
			}
		}

		cachedJjInfo = info;
	} catch {
		cachedJjInfo = null;
	}
	jjInfoCached = true;
}

function getJjInfo(): JjInfo | null {
	if (!jjInfoCached) {
		refreshJjInfo();
	}
	return cachedJjInfo;
}

function formatPath(path: string): string {
	const home = homedir();
	if (path.startsWith(home)) {
		return "~" + path.slice(home.length);
	}
	return path;
}

function formatTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 1000000) return `${(n / 1000).toFixed(1)}k`;
	return `${(n / 1000000).toFixed(2)}M`;
}

function updateSnapshot(ctx: ExtensionContext): void {
	let totalInput = 0;
	let totalOutput = 0;
	let totalCost = 0;
	let lastAssistant: AssistantMessage | undefined;

	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "message" && entry.message.role === "assistant") {
			const msg = entry.message as AssistantMessage;
			totalInput += msg.usage.input;
			totalOutput += msg.usage.output;
			totalCost += msg.usage.cost.total;
			lastAssistant = msg;
		}
	}

	snapshot = {
		cwd: ctx.cwd,
		modelId: ctx.model?.id || "no model",
		thinkingLevel: ctx.thinkingLevel,
		totalInput,
		totalOutput,
		totalCost,
		contextTokens: lastAssistant
			? lastAssistant.usage.input +
			  lastAssistant.usage.output +
			  lastAssistant.usage.cacheRead +
			  lastAssistant.usage.cacheWrite
			: 0,
		contextWindow: ctx.model?.contextWindow || 200000,
	};
}

export default function (pi: ExtensionAPI) {
	// Set custom footer on session start
	const setupFooter = (ctx: ExtensionContext) => {
		let disposed = false;
		ctx.ui.setFooter((_tui, theme) => {
			return {
				dispose() {
					disposed = true;
				},
				render(width: number): string[] {
					if (disposed) return [""];
					// === LEFT SIDE: jj info + path ===
					const data = snapshot;
					const jj = getJjInfo();
					let leftParts: string[] = [];

					if (jj) {
						// Change ID
						let jjStr = theme.fg("accent", jj.changeId);

						// Bookmarks or parent relation
						if (jj.bookmarks) {
							jjStr += " " + theme.fg("success", jj.bookmarks);
						} else if (jj.parentBookmark && jj.distance) {
							jjStr += " " + theme.fg("dim", `→ ${jj.parentBookmark}~${jj.distance}`);
						}

						// Conflict indicator
						if (jj.conflicted) {
							jjStr += " " + theme.fg("error", "⚠ conflict");
						}

						leftParts.push(jjStr);
					}

					// Current directory (shortened)
					const shortPath = formatPath(data.cwd);
					leftParts.push(theme.fg("dim", shortPath));

					const left = leftParts.join(theme.fg("borderMuted", " │ "));

					// === RIGHT SIDE: context, tokens, cost, model ===
					const contextPercent = data.contextWindow > 0 ? (data.contextTokens / data.contextWindow) * 100 : 0;

					let contextStr = `${contextPercent.toFixed(0)}%`;
					if (contextPercent > 90) {
						contextStr = theme.fg("error", contextStr);
					} else if (contextPercent > 70) {
						contextStr = theme.fg("warning", contextStr);
					} else {
						contextStr = theme.fg("success", contextStr);
					}

					// Token counts
					const tokens = theme.fg("dim", `↑${formatTokens(data.totalInput)} ↓${formatTokens(data.totalOutput)}`);

					// Cost
					const cost = theme.fg("dim", `$${data.totalCost.toFixed(2)}`);

					// Model + thinking level
					let modelStr = data.modelId;
					// Shorten common model names
					// modelStr = modelStr
					// 	.replace("anthropic/", "")
					// 	.replace("claude-", "")
					// 	.replace("-latest", "");
					
					const thinkingLevel = data.thinkingLevel;
					if (thinkingLevel && thinkingLevel !== "none") {
						modelStr += theme.fg("muted", `:${thinkingLevel}`);
					}
					modelStr = theme.fg("muted", modelStr);

					const rightParts = [contextStr, tokens, cost, modelStr];
					const right = rightParts.join(" ");

					// Combine with padding
					const padding = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));

					return [truncateToWidth(left + padding + right, width)];
				},
				invalidate() {},
			};
		});
	};

	pi.on("session_start", async (_event, ctx) => {
		updateSnapshot(ctx);
		refreshJjInfo(ctx.cwd);
		setupFooter(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		ctx.ui.setFooter(undefined);
	});

	// Refresh when prompt is sent
	pi.on("turn_start", async (_event, ctx) => {
		updateSnapshot(ctx);
		refreshJjInfo(ctx.cwd);
	});

	// Refresh after each tool execution
	pi.on("tool_execution_end", async (_event, ctx) => {
		updateSnapshot(ctx);
		refreshJjInfo(ctx.cwd);
	});

	// Refresh after turn completes
	pi.on("turn_end", async (_event, ctx) => {
		updateSnapshot(ctx);
		refreshJjInfo(ctx.cwd);
	});
}
