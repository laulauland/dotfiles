/**
 * A one-line footer with Jujutsu state and Pi's session telemetry.
 */

import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { execSync } from "child_process";
import { homedir } from "os";

const FAST_MODE_EVENT = "fast-mode:changed";

type FastModeChange = {
	readonly enabled: boolean;
};

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
	provider?: string;
	reasoning: boolean;
	thinkingLevel: string;
	usingSubscription: boolean;
	totalInput: number;
	totalOutput: number;
	totalCacheRead: number;
	totalCacheWrite: number;
	totalCost: number;
	latestCacheHitRate?: number;
	contextWindow: number;
	contextPercent: number | null;
}

let cachedJjInfo: JjInfo | null = null;
let jjInfoCached = false;
let snapshot: FooterSnapshot = {
	cwd: process.cwd(),
	modelId: "no model",
	reasoning: false,
	thinkingLevel: "off",
	usingSubscription: false,
	totalInput: 0,
	totalOutput: 0,
	totalCacheRead: 0,
	totalCacheWrite: 0,
	totalCost: 0,
	contextWindow: 200000,
	contextPercent: null,
};

function refreshJjInfo(cwd = snapshot.cwd): void {
	try {
		const execOptions = { cwd, encoding: "utf8" as const, stdio: ["pipe", "pipe", "pipe"] as const };
		execSync("jj root", execOptions);

		const result = execSync(
			`jj log -r @ -T 'change_id.shortest() ++ "|" ++ bookmarks ++ "|" ++ conflict' --no-graph`,
			execOptions,
		).trim();
		const [changeId, bookmarks, conflict] = result.split("|");
		const info: JjInfo = {
			changeId,
			bookmarks: bookmarks.trim(),
			conflicted: conflict === "true",
		};

		if (!info.bookmarks) {
			try {
				const closestBookmark = execSync(
					`jj log -r '::@- & bookmarks()' -T 'bookmarks' --no-graph --limit 1`,
					execOptions,
				).trim();
				if (closestBookmark) {
					const bookmarkName = closestBookmark.split(" ")[0];
					try {
						const distanceOutput = execSync(
							`jj log -r '(${bookmarkName}::@) ~ ${bookmarkName}' --no-graph -T '"x"'`,
							execOptions,
						).trim();
						info.parentBookmark = closestBookmark;
						info.distance = distanceOutput.length;
					} catch {
						info.parentBookmark = closestBookmark;
					}
				}
			} catch {
				// No ancestor has a bookmark.
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

function isFastModeChange(value: unknown): value is FastModeChange {
	return typeof value === "object" && value !== null && "enabled" in value && typeof value.enabled === "boolean";
}

function formatPath(path: string): string {
	const home = homedir();
	return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

function formatTokens(count: number): string {
	if (count < 1000) return `${count}`;
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

function updateSnapshot(ctx: ExtensionContext, thinkingLevel: string): void {
	let totalInput = 0;
	let totalOutput = 0;
	let totalCacheRead = 0;
	let totalCacheWrite = 0;
	let totalCost = 0;
	let latestCacheHitRate: number | undefined;

	for (const entry of ctx.sessionManager.getEntries()) {
		if (entry.type !== "message" || entry.message.role !== "assistant") continue;

		const message = entry.message as AssistantMessage;
		totalInput += message.usage.input;
		totalOutput += message.usage.output;
		totalCacheRead += message.usage.cacheRead;
		totalCacheWrite += message.usage.cacheWrite;
		totalCost += message.usage.cost.total;

		const latestPromptTokens = message.usage.input + message.usage.cacheRead + message.usage.cacheWrite;
		latestCacheHitRate = latestPromptTokens > 0 ? (message.usage.cacheRead / latestPromptTokens) * 100 : undefined;
	}

	const contextUsage = ctx.getContextUsage();
	const model = ctx.model;
	snapshot = {
		cwd: ctx.cwd,
		modelId: model?.id ?? "no model",
		provider: model?.provider,
		reasoning: model?.reasoning ?? false,
		thinkingLevel,
		usingSubscription: model ? ctx.modelRegistry.isUsingOAuth(model) : false,
		totalInput,
		totalOutput,
		totalCacheRead,
		totalCacheWrite,
		totalCost,
		latestCacheHitRate,
		contextWindow: contextUsage?.contextWindow ?? model?.contextWindow ?? 0,
		contextPercent: contextUsage?.percent ?? null,
	};
}

function formatJjInfo(theme: { fg(color: string, text: string): string }, jj: JjInfo): string {
	let text = theme.fg("accent", jj.changeId);
	if (jj.bookmarks) {
		text += ` ${theme.fg("success", jj.bookmarks)}`;
	} else if (jj.parentBookmark && jj.distance) {
		text += ` ${theme.fg("dim", `→ ${jj.parentBookmark}~${jj.distance}`)}`;
	}
	if (jj.conflicted) {
		text += ` ${theme.fg("error", "⚠ conflict")}`;
	}
	return text;
}

function formatUsage(): string[] {
	const parts: string[] = [];
	if (snapshot.totalInput) parts.push(`↑${formatTokens(snapshot.totalInput)}`);
	if (snapshot.totalOutput) parts.push(`↓${formatTokens(snapshot.totalOutput)}`);
	if (snapshot.totalCacheRead) parts.push(`R${formatTokens(snapshot.totalCacheRead)}`);
	if (snapshot.totalCacheWrite) parts.push(`W${formatTokens(snapshot.totalCacheWrite)}`);
	if (snapshot.latestCacheHitRate !== undefined) parts.push(`CH${snapshot.latestCacheHitRate.toFixed(1)}%`);
	if (snapshot.totalCost || snapshot.usingSubscription) {
		parts.push(`$${snapshot.totalCost.toFixed(3)}${snapshot.usingSubscription ? " (sub)" : ""}`);
	}

	const contextPercent = snapshot.contextPercent === null ? "?" : `${snapshot.contextPercent.toFixed(1)}%`;
	parts.push(`${contextPercent}/${formatTokens(snapshot.contextWindow)} (auto)`);
	return parts;
}

/** Renders Jujutsu and session telemetry in Pi's single-line footer. */
export default function footer(pi: ExtensionAPI) {
	let fastModeEnabled = false;
	let requestFooterRender: (() => void) | undefined;

	pi.events.on(FAST_MODE_EVENT, (event: unknown) => {
		if (!isFastModeChange(event)) return;
		fastModeEnabled = event.enabled;
		requestFooterRender?.();
	});

	const setupFooter = (ctx: ExtensionContext) => {
		let disposed = false;
		ctx.ui.setFooter((tui, theme, footerData) => {
			const requestRender = () => tui.requestRender();
			const unsubscribe = footerData.onBranchChange(requestRender);
			requestFooterRender = requestRender;

			return {
				dispose() {
					disposed = true;
					unsubscribe();
					if (requestFooterRender === requestRender) requestFooterRender = undefined;
				},
				invalidate() {
					requestRender();
				},
				render(width: number): string[] {
					if (disposed) return [""];

					const jj = getJjInfo();
					const leftParts = [
						...(fastModeEnabled ? [theme.fg("accent", theme.bold("[fast]"))] : []),
						...(jj ? [formatJjInfo(theme, jj)] : []),
						theme.fg("dim", formatPath(snapshot.cwd)),
						theme.fg("dim", formatUsage().join(" ")),
					];
					let left = leftParts.join(theme.fg("borderMuted", " │ "));

					const model = snapshot.reasoning
						? `${snapshot.modelId} • ${snapshot.thinkingLevel === "off" ? "thinking off" : snapshot.thinkingLevel}`
						: snapshot.modelId;
					let right = snapshot.provider && footerData.getAvailableProviderCount() > 1
						? `(${snapshot.provider}) ${model}`
						: model;

					const minimumPadding = 2;
					if (visibleWidth(left) > width) {
						return [truncateToWidth(left, width, "...")];
					}
					if (visibleWidth(left) + minimumPadding + visibleWidth(right) > width) {
						right = truncateToWidth(right, Math.max(0, width - visibleWidth(left) - minimumPadding), "");
					}

					const padding = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
					return [truncateToWidth(left + padding + theme.fg("muted", right), width)];
				},
			};
		});
	};

	const refreshFooter = (ctx: ExtensionContext) => {
		updateSnapshot(ctx, pi.getThinkingLevel());
		refreshJjInfo(ctx.cwd);
		requestFooterRender?.();
	};

	pi.on("session_start", async (_event, ctx) => {
		refreshFooter(ctx);
		setupFooter(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		requestFooterRender = undefined;
		ctx.ui.setFooter(undefined);
	});

	pi.on("turn_start", async (_event, ctx) => refreshFooter(ctx));
	pi.on("tool_execution_end", async (_event, ctx) => refreshFooter(ctx));
	pi.on("turn_end", async (_event, ctx) => refreshFooter(ctx));
	pi.on("model_select", async (_event, ctx) => refreshFooter(ctx));

	pi.on("thinking_level_select", async (event) => {
		snapshot = { ...snapshot, thinkingLevel: event.level };
		requestFooterRender?.();
	});
}
