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

// Cache jj info to avoid running commands on every render
let cachedJjInfo: JjInfo | null = null;
let jjInfoCached = false;

function refreshJjInfo(): void {
	try {
		// Check if we're in a jj repo
		execSync("jj root", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });

		// Get current change info
		const result = execSync(
			`jj log -r @ -T 'change_id.short() ++ "|" ++ bookmarks ++ "|" ++ conflict' --no-graph`,
			{ encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
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
					{ encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
				).trim();

				if (closestBookmark) {
					const bookmarkName = closestBookmark.split(" ")[0];
					try {
						const distanceOutput = execSync(
							`jj log -r '(${bookmarkName}::@) ~ ${bookmarkName}' --no-graph -T '"x"'`,
							{ encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
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

export default function (pi: ExtensionAPI) {
	// Set custom footer on session start
	const setupFooter = (ctx: ExtensionContext) => {
		ctx.ui.setFooter((_tui, theme) => {
			return {
				render(width: number): string[] {
					// === LEFT SIDE: jj info + path ===
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
					const shortPath = formatPath(ctx.cwd);
					leftParts.push(theme.fg("dim", shortPath));

					const left = leftParts.join(theme.fg("borderMuted", " │ "));

					// === RIGHT SIDE: context, tokens, cost, model ===
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

					// Context percentage
					const contextTokens = lastAssistant
						? lastAssistant.usage.input +
						  lastAssistant.usage.output +
						  lastAssistant.usage.cacheRead +
						  lastAssistant.usage.cacheWrite
						: 0;
					const contextWindow = ctx.model?.contextWindow || 200000;
					const contextPercent = contextWindow > 0 ? (contextTokens / contextWindow) * 100 : 0;

					let contextStr = `${contextPercent.toFixed(0)}%`;
					if (contextPercent > 90) {
						contextStr = theme.fg("error", contextStr);
					} else if (contextPercent > 70) {
						contextStr = theme.fg("warning", contextStr);
					} else {
						contextStr = theme.fg("success", contextStr);
					}

					// Token counts
					const tokens = theme.fg("dim", `↑${formatTokens(totalInput)} ↓${formatTokens(totalOutput)}`);

					// Cost
					const cost = theme.fg("dim", `$${totalCost.toFixed(2)}`);

					// Model + thinking level
					let modelStr = ctx.model?.id || "no model";
					// Shorten common model names
					// modelStr = modelStr
					// 	.replace("anthropic/", "")
					// 	.replace("claude-", "")
					// 	.replace("-latest", "");
					
					const thinkingLevel = ctx.thinkingLevel;
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
		refreshJjInfo();
		setupFooter(ctx);
	});

	pi.on("session_switch", async (_event, ctx) => {
		refreshJjInfo();
		setupFooter(ctx);
	});

	// Refresh when prompt is sent
	pi.on("turn_start", async () => {
		refreshJjInfo();
	});

	// Refresh after each tool execution
	pi.on("tool_end", async () => {
		refreshJjInfo();
	});

	// Refresh after turn completes
	pi.on("turn_end", async () => {
		refreshJjInfo();
	});
}
