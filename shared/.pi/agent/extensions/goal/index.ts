import { complete, type UserMessage } from "@mariozechner/pi-ai";
import type { AgentEndEvent, ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const CUSTOM_TYPE = "goal-extension-state";
const DEFAULT_MAX_TURNS = 20;
const MAX_CONTEXT_CHARS = 24_000;

type GoalStatus = "active" | "paused";

type GoalState = {
	goal: string;
	status: GoalStatus;
	turns: number;
	maxTurns: number;
	startedAt: string;
	updatedAt: string;
	lastJudgeReason?: string;
};

type DoneRecord = {
	goal: string;
	turns: number;
	completedAt: string;
	reason: string;
};

type PersistedEvent =
	| { action: "set"; state: GoalState }
	| { action: "pause"; state: GoalState }
	| { action: "resume"; state: GoalState }
	| { action: "progress"; state: GoalState }
	| { action: "done"; done: DoneRecord }
	| { action: "clear"; clearedAt: string; goal?: string };

type ContentBlock = {
	type?: string;
	text?: string;
	name?: string;
	arguments?: Record<string, unknown>;
};

type SessionEntry = {
	type: string;
	customType?: string;
	data?: PersistedEvent;
	message?: {
		role?: string;
		content?: unknown;
		stopReason?: string;
	};
};

type JudgeResult = {
	done: boolean;
	reason: string;
};

const now = () => new Date().toISOString();

const truncate = (text: string, maxChars: number) => {
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars)}\n\n[... truncated ${text.length - maxChars} chars ...]`;
};

const extractTextParts = (content: unknown): string[] => {
	if (typeof content === "string") return [content];
	if (!Array.isArray(content)) return [];

	const parts: string[] = [];
	for (const part of content) {
		if (!part || typeof part !== "object") continue;
		const block = part as ContentBlock;
		if (block.type === "text" && typeof block.text === "string") {
			parts.push(block.text);
		}
	}
	return parts;
};

const extractToolCalls = (content: unknown): string[] => {
	if (!Array.isArray(content)) return [];

	const calls: string[] = [];
	for (const part of content) {
		if (!part || typeof part !== "object") continue;
		const block = part as ContentBlock;
		if (block.type === "toolCall" && typeof block.name === "string") {
			calls.push(`Tool call: ${block.name}(${JSON.stringify(block.arguments ?? {})})`);
		}
	}
	return calls;
};

const buildConversationText = (entries: SessionEntry[]) => {
	const sections: string[] = [];

	for (const entry of entries) {
		if (entry.type !== "message" || !entry.message?.role) continue;

		const role = entry.message.role;
		if (role !== "user" && role !== "assistant" && role !== "toolResult") continue;

		const label = role === "toolResult" ? "Tool result" : role === "user" ? "User" : "Assistant";
		const lines = extractTextParts(entry.message.content).join("\n").trim();
		const toolCalls = role === "assistant" ? extractToolCalls(entry.message.content) : [];
		const body = [lines, ...toolCalls].filter(Boolean).join("\n").trim();
		if (body) sections.push(`${label}: ${body}`);
	}

	return truncate(sections.join("\n\n"), MAX_CONTEXT_CHARS);
};

const getLastAssistantText = (entries: SessionEntry[]) => {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.type !== "message" || entry.message?.role !== "assistant") continue;
		const text = extractTextParts(entry.message.content).join("\n").trim();
		if (text) return text;
	}
	return "";
};

const parseJudgeResponse = (text: string): JudgeResult => {
	const trimmed = text.trim();
	const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
	if (jsonMatch) {
		try {
			const parsed = JSON.parse(jsonMatch[0]) as { done?: unknown; reason?: unknown };
			if (typeof parsed.done === "boolean") {
				return {
					done: parsed.done,
					reason: typeof parsed.reason === "string" ? parsed.reason : trimmed,
				};
			}
		} catch {
			// Fall through to text parsing.
		}
	}

	const firstWord = trimmed.toLowerCase().split(/\s+/)[0];
	if (["done", "yes", "satisfied", "complete", "completed"].includes(firstWord)) {
		return { done: true, reason: trimmed };
	}
	return { done: false, reason: trimmed || "Judge returned an empty response." };
};

const buildJudgePrompt = (state: GoalState, conversationText: string, lastAssistantText: string) => `You are judging whether a persistent coding-agent goal has been satisfied.

Goal:
${state.goal}

Conversation so far:
<conversation>
${conversationText}
</conversation>

Most recent assistant response:
<last_assistant_response>
${lastAssistantText || "(no assistant text found)"}
</last_assistant_response>

Decide if the goal is fully satisfied by the work visible in the conversation. Be strict: if important verification, implementation, or user-requested output is missing, it is not done.

Return only JSON in this shape:
{"done": boolean, "reason": "short explanation"}`;

const buildContinuationPrompt = (state: GoalState, reason: string) => `Persistent goal continuation (${state.turns}/${state.maxTurns} turns used).

Standing goal:
${state.goal}

The judge says the goal is not complete yet:
${reason || "No specific reason provided."}

Continue working toward the standing goal now. Be explicit about what remains, take the next concrete steps, and stop only when the goal is actually satisfied or you need user input.`;

const summarizeState = (state: GoalState) => {
	const marker = state.status === "paused" ? "⏸" : "🎯";
	const lines = [
		`${marker} Goal ${state.status}: ${state.goal}`,
		`Turns: ${state.turns}/${state.maxTurns}`,
	];
	if (state.lastJudgeReason) lines.push(`Judge: ${state.lastJudgeReason}`);
	return lines;
};

export default function (pi: ExtensionAPI) {
	let state: GoalState | null = null;
	let lastDone: DoneRecord | null = null;
	let realUserInputGeneration = 0;
	let continuationInFlight = false;

	const persist = (event: PersistedEvent) => pi.appendEntry(CUSTOM_TYPE, event);

	const updateWidget = (ctx?: ExtensionContext) => {
		if (!ctx?.hasUI) return;
		if (!state) {
			ctx.ui.setWidget("goal", undefined);
			ctx.ui.setStatus("goal", undefined);
			return;
		}

		ctx.ui.setWidget("goal", summarizeState(state), { placement: "aboveEditor" });
		ctx.ui.setStatus("goal", `goal ${state.status} ${state.turns}/${state.maxTurns}`);
	};

	const restoreState = (ctx: ExtensionContext) => {
		state = null;
		lastDone = null;

		for (const entry of ctx.sessionManager.getBranch() as SessionEntry[]) {
			if (entry.type !== "custom" || entry.customType !== CUSTOM_TYPE || !entry.data) continue;
			const event = entry.data;
			if (event.action === "set" || event.action === "pause" || event.action === "resume" || event.action === "progress") {
				state = event.state;
			} else if (event.action === "done") {
				state = null;
				lastDone = event.done;
			} else if (event.action === "clear") {
				state = null;
			}
		}
	};

	const finishGoal = (ctx: ExtensionContext, reason: string) => {
		if (!state) return;
		lastDone = {
			goal: state.goal,
			turns: state.turns,
			completedAt: now(),
			reason,
		};
		persist({ action: "done", done: lastDone });
		state = null;
		updateWidget(ctx);
		if (ctx.hasUI) ctx.ui.notify(`Goal complete: ${reason}`, "info");
	};

	const judgeGoal = async (ctx: ExtensionContext, event: AgentEndEvent): Promise<JudgeResult> => {
		if (!state || !ctx.model) return { done: false, reason: "No active goal or model." };

		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
		if (!auth.ok || !auth.apiKey) {
			throw new Error(auth.ok ? `No API key for ${ctx.model.provider}` : auth.error);
		}

		const branch = ctx.sessionManager.getBranch() as SessionEntry[];
		const messages = event.messages?.length ? (event.messages as unknown as SessionEntry[]) : branch;
		const conversationText = buildConversationText(branch);
		const lastAssistantText = getLastAssistantText(messages) || getLastAssistantText(branch);
		const userMessage: UserMessage = {
			role: "user",
			content: [{ type: "text", text: buildJudgePrompt(state, conversationText, lastAssistantText) }],
			timestamp: Date.now(),
		};

		const response = await complete(
			ctx.model,
			{ messages: [userMessage] },
			{ apiKey: auth.apiKey, headers: auth.headers, signal: ctx.signal },
		);

		const text = response.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("\n");

		return parseJudgeResponse(text);
	};

	const maybeContinueAfterTurn = async (ctx: ExtensionContext, event: AgentEndEvent) => {
		if (!state || state.status !== "active" || continuationInFlight) return;
		if (!ctx.model) {
			if (ctx.hasUI) ctx.ui.notify("Goal loop paused: no model selected for judging", "warning");
			state = { ...state, status: "paused", updatedAt: now(), lastJudgeReason: "No model selected for judging." };
			persist({ action: "pause", state });
			updateWidget(ctx);
			return;
		}

		const inputGenerationAtStart = realUserInputGeneration;
		continuationInFlight = true;
		try {
			const result = await judgeGoal(ctx, event).catch((error: unknown) => ({
				done: false,
				reason: `Judge failed open; continuing. ${error instanceof Error ? error.message : String(error)}`,
			}));

			if (!state || state.status !== "active") return;
			if (realUserInputGeneration !== inputGenerationAtStart || ctx.hasPendingMessages()) {
				state = {
					...state,
					updatedAt: now(),
					lastJudgeReason: "Continuation preempted by user input.",
				};
				persist({ action: "progress", state });
				updateWidget(ctx);
				return;
			}

			if (result.done) {
				finishGoal(ctx, result.reason);
				return;
			}

			const nextTurns = state.turns + 1;
			if (nextTurns >= state.maxTurns) {
				state = {
					...state,
					turns: nextTurns,
					status: "paused",
					updatedAt: now(),
					lastJudgeReason: `Turn budget exhausted. Last judge reason: ${result.reason}`,
				};
				persist({ action: "pause", state });
				updateWidget(ctx);
				if (ctx.hasUI) ctx.ui.notify(`Goal paused: turn budget exhausted (${state.turns}/${state.maxTurns}). Use /goal resume to continue.`, "warning");
				return;
			}

			state = {
				...state,
				turns: nextTurns,
				updatedAt: now(),
				lastJudgeReason: result.reason,
			};
			persist({ action: "progress", state });
			updateWidget(ctx);

			pi.sendUserMessage(buildContinuationPrompt(state, result.reason), { deliverAs: "followUp" });
		} finally {
			continuationInFlight = false;
		}
	};

	pi.on("session_start", async (_event, ctx) => {
		restoreState(ctx);
		updateWidget(ctx);
	});

	pi.on("input", async (event) => {
		if (event.source !== "extension") realUserInputGeneration += 1;
		return { action: "continue" };
	});

	pi.on("agent_end", async (event, ctx) => {
		await maybeContinueAfterTurn(ctx, event);
	});

	pi.registerCommand("goal", {
		description: "Set, inspect, pause, resume, or clear a persistent cross-turn goal",
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			const [subcommand] = trimmed.split(/\s+/, 1);
			const normalized = subcommand?.toLowerCase() ?? "";

			if (!trimmed || normalized === "status") {
				updateWidget(ctx);
				if (state) {
					ctx.ui.notify(summarizeState(state).join("\n"), "info");
				} else if (lastDone) {
					ctx.ui.notify(`No active goal. Last completed goal (${lastDone.turns} turns): ${lastDone.goal}\nReason: ${lastDone.reason}`, "info");
				} else {
					ctx.ui.notify("No active goal.", "info");
				}
				return;
			}

			if (normalized === "pause") {
				if (!state) {
					ctx.ui.notify("No active goal to pause.", "warning");
					return;
				}
				state = { ...state, status: "paused", updatedAt: now() };
				persist({ action: "pause", state });
				updateWidget(ctx);
				ctx.ui.notify("Goal paused.", "info");
				return;
			}

			if (normalized === "resume") {
				if (!state) {
					ctx.ui.notify(lastDone ? `No active goal. Last completed: ${lastDone.goal}` : "No active goal to resume.", "warning");
					return;
				}
				if (!ctx.isIdle()) {
					ctx.ui.notify("Cannot resume a goal while an agent turn is running. Stop or wait first.", "warning");
					return;
				}
				state = { ...state, status: "active", turns: 0, updatedAt: now(), lastJudgeReason: undefined };
				persist({ action: "resume", state });
				updateWidget(ctx);
				pi.sendUserMessage(buildContinuationPrompt(state, "Goal resumed by user."));
				return;
			}

			if (normalized === "clear") {
				const clearedGoal = state?.goal;
				state = null;
				persist({ action: "clear", clearedAt: now(), goal: clearedGoal });
				updateWidget(ctx);
				ctx.ui.notify("Goal cleared.", "info");
				return;
			}

			if (!ctx.isIdle()) {
				ctx.ui.notify("Cannot set a new goal while an agent turn is running. Stop or wait first.", "warning");
				return;
			}

			state = {
				goal: trimmed,
				status: "active",
				turns: 0,
				maxTurns: DEFAULT_MAX_TURNS,
				startedAt: now(),
				updatedAt: now(),
			};
			persist({ action: "set", state });
			updateWidget(ctx);
			ctx.ui.notify("Goal set. Starting persistent goal loop.", "info");
			pi.sendUserMessage(`Standing goal:\n${state.goal}\n\nStart working toward this goal now. Continue until it is satisfied or you need user input.`);
		},
	});
}
