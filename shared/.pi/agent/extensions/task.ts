import { randomUUID } from "node:crypto";
import { AgentSession, BorderedLoader } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";

const TASK_SESSION_PATCH_KEY = Symbol.for("laulauland.task-extension.session-patch");
const TASK_CURRENT_SESSION_KEY = Symbol.for("laulauland.task-extension.current-session");
const TASK_ENTRY_TYPE = "task-state";
const TASK_STATUS_KEY = "task";
const MAX_STATUS_LABEL_LENGTH = 56;
const MAX_TREE_LABEL_LENGTH = 72;
const START_ALIASES = ["start", "run", "create"] as const;
const COMPLETE_ALIASES = ["complete", "done", "end"] as const;
const CANCEL_ALIASES = ["cancel", "stop"] as const;
const USAGE = "Usage: /task start|run|create <prompt> | /task complete|done|end | /task cancel|stop";
const NO_SUBAGENT_MESSAGE = "No subagent was started. Continue working in this conversation.";
let pendingToolCompletionTaskId: string | undefined;
let pendingToolCompletionInFlight = false;

interface TaskStartData {
	version: 1;
	kind: "start";
	taskId: string;
	prompt: string;
	createdAt: string;
	startedBy?: "command" | "tool";
}

interface TaskCompleteData {
	version: 1;
	kind: "complete";
	taskId: string;
	completedAt: string;
}

interface TaskCancelData {
	version: 1;
	kind: "cancel";
	taskId: string;
	cancelledAt: string;
}

type TaskEntryData = TaskStartData | TaskCompleteData | TaskCancelData;

interface TaskRecord {
	entryId: string;
	taskId: string;
	prompt: string;
	createdAt: string | undefined;
	startedBy: "command" | "tool";
}

interface ActiveTask extends TaskRecord {
	depth: number;
	label: string;
}

interface TaskCompletionOutcome {
	kind: "completed" | "cancelled" | "aborted" | "error";
	message?: string;
}

type TaskCompletionContext = ExtensionCommandContext | ExtensionContext;

function getTaskSessionStore(): typeof globalThis & {
	[TASK_SESSION_PATCH_KEY]?: boolean;
	[TASK_CURRENT_SESSION_KEY]?: AgentSession;
} {
	return globalThis as typeof globalThis & {
		[TASK_SESSION_PATCH_KEY]?: boolean;
		[TASK_CURRENT_SESSION_KEY]?: AgentSession;
	};
}

function installTaskSessionCapture(): void {
	const store = getTaskSessionStore();
	if (store[TASK_SESSION_PATCH_KEY]) return;

	const originalBindExtensions = AgentSession.prototype.bindExtensions;
	AgentSession.prototype.bindExtensions = async function (...args: Parameters<typeof originalBindExtensions>) {
		store[TASK_CURRENT_SESSION_KEY] = this;
		return originalBindExtensions.apply(this, args);
	};

	store[TASK_SESSION_PATCH_KEY] = true;
}

function getCurrentTaskSession(): AgentSession | undefined {
	return getTaskSessionStore()[TASK_CURRENT_SESSION_KEY];
}

installTaskSessionCapture();

function normalizePrompt(prompt: string): string {
	return prompt.trim().replace(/\r\n/g, "\n");
}

function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function toSingleLine(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function formatTaskLabel(prompt: string): string {
	return truncate(toSingleLine(prompt), MAX_STATUS_LABEL_LENGTH) || "task";
}

function buildTreeLabel(kind: "start" | "done", task: ActiveTask): string {
	const marker = kind === "done" ? "done" : "start";
	return truncate(`task:${task.depth} ${marker} ${task.label}`, MAX_TREE_LABEL_LENGTH);
}

function isTaskCustomEntry(entry: { type: string; customType?: string }): boolean {
	return entry.type === "custom" && entry.customType === TASK_ENTRY_TYPE;
}

function removeTaskFromStack(stack: TaskRecord[], taskId: string): void {
	for (let i = stack.length - 1; i >= 0; i--) {
		if (stack[i]?.taskId === taskId) {
			stack.splice(i, 1);
			return;
		}
	}
}

function getTaskStack(ctx: ExtensionContext): ActiveTask[] {
	const stack: TaskRecord[] = [];

	for (const entry of ctx.sessionManager.getBranch()) {
		if (!isTaskCustomEntry(entry)) continue;

		const data = entry.data as TaskEntryData | undefined;
		if (!data || typeof data !== "object") continue;

		if (data.kind === "start") {
			const prompt = typeof data.prompt === "string" ? normalizePrompt(data.prompt) : "";
			const taskId = typeof data.taskId === "string" ? data.taskId : "";
			if (!prompt || !taskId) continue;

			stack.push({
				entryId: entry.id,
				taskId,
				prompt,
				createdAt: typeof data.createdAt === "string" ? data.createdAt : undefined,
				startedBy: data.startedBy === "tool" ? "tool" : "command",
			});
			continue;
		}

		if ((data.kind === "complete" || data.kind === "cancel") && typeof data.taskId === "string") {
			removeTaskFromStack(stack, data.taskId);
		}
	}

	return stack.map((task, index) => ({
		...task,
		depth: index + 1,
		label: formatTaskLabel(task.prompt),
	}));
}

function getActiveTask(ctx: ExtensionContext): ActiveTask | undefined {
	const stack = getTaskStack(ctx);
	return stack[stack.length - 1];
}

function updateTaskStatus(ctx: ExtensionContext): void {
	const stack = getTaskStack(ctx);
	const activeTask = stack[stack.length - 1];

	if (!activeTask) {
		ctx.ui.setStatus(TASK_STATUS_KEY, undefined);
		ctx.ui.setWidget(TASK_STATUS_KEY, undefined);
		return;
	}

	const statusPrefix = stack.length > 1 ? `🧵 ${stack.length}` : "🧵";
	ctx.ui.setStatus(TASK_STATUS_KEY, ctx.ui.theme.fg("accent", `${statusPrefix} ${activeTask.label}`));

	const widgetLines = [
		ctx.ui.theme.fg(
			"accent",
			stack.length > 1 ? `🧵 ${stack.length} focused checkpoints active` : "🧵 Focused checkpoint active",
		),
		...stack.map((task) => {
			const indent = "  ".repeat(Math.max(0, task.depth - 1));
			const bullet = task.depth === activeTask.depth ? "↳" : "•";
			return ctx.ui.theme.fg(task.depth === activeTask.depth ? "muted" : "dim", `${indent}${bullet} ${task.label}`);
		}),
		ctx.ui.theme.fg("dim", "Run /task complete to summarize it back, or /task cancel to drop it in place"),
	];

	ctx.ui.setWidget(TASK_STATUS_KEY, widgetLines);
}

function buildTaskUserMessage(prompt: string): string {
	return `${prompt}\n\nYou are still the active agent in this conversation. No subagent was started. Do not call the task tool or start another task for this prompt. Work directly on the task above. When you believe this checkpoint is complete, explicitly tell the user to run /task complete so the work can be summarized back to the checkpoint.`;
}

function buildCompletionSummaryInstructions(task: ActiveTask, parentTask: ActiveTask | undefined): string {
	const parentContext = parentTask
		? `This checkpoint was nested inside a parent checkpoint with this prompt:\n\n${parentTask.prompt}\n\n`
		: "";

	return `${parentContext}This work checkpoint was started with this prompt:\n\n${task.prompt}\n\nWhen summarizing back to the checkpoint, focus on:\n- whether the checkpointed work was completed\n- the most important decisions and why they were made\n- the files that changed\n- validation, tests, or checks that were run\n- any remaining caveats, risks, or follow-up work\n\nKeep the summary concise and action-oriented.`;
}

function buildCompletionLoaderMessage(task: ActiveTask): string {
	return `Returning to ${buildTreeLabel("start", task)} and summarizing this checkpoint...`;
}

function parseTaskCommand(input: string):
	| { action: "status" }
	| { action: "start"; prompt: string }
	| { action: "complete" }
	| { action: "cancel" }
	| { action: "invalid" } {
	const trimmed = input.trim();
	if (!trimmed) return { action: "status" };

	const [rawCommand, ..._rest] = trimmed.split(/\s+/);
	const command = rawCommand?.toLowerCase();
	const remainder = trimmed.slice(rawCommand.length).trim();

	if (command && COMPLETE_ALIASES.includes(command as (typeof COMPLETE_ALIASES)[number])) {
		return remainder ? { action: "invalid" } : { action: "complete" };
	}

	if (command && CANCEL_ALIASES.includes(command as (typeof CANCEL_ALIASES)[number])) {
		return remainder ? { action: "invalid" } : { action: "cancel" };
	}

	if (command && START_ALIASES.includes(command as (typeof START_ALIASES)[number])) {
		return remainder ? { action: "start", prompt: remainder } : { action: "invalid" };
	}

	return { action: "invalid" };
}

function notifyTaskStack(ctx: ExtensionContext): void {
	const stack = getTaskStack(ctx);
	if (stack.length === 0) {
		ctx.ui.notify(USAGE, "info");
		return;
	}

	ctx.ui.notify(
		stack.length === 1 ? `Active checkpoint: ${stack[0]!.label}` : `Active checkpoints (${stack.length})`,
		"info",
	);
	for (const task of stack) {
		const indent = "  ".repeat(Math.max(0, task.depth - 1));
		ctx.ui.notify(`${indent}${task.depth}. ${task.label}`, "info");
	}
	ctx.ui.notify("Run /task complete to summarize the current checkpoint.", "info");
	ctx.ui.notify("Run /task cancel or /task stop to drop the current checkpoint in place without summarizing.", "info");
}

async function ensureTaskModelReady(ctx: ExtensionContext, action: "starting" | "completing"): Promise<boolean> {
	if (!ctx.model) {
		ctx.ui.notify(`Select a model before ${action} a checkpoint.`, "error");
		return false;
	}

	if (!ctx.modelRegistry.hasConfiguredAuth(ctx.model)) {
		ctx.ui.notify(`Current model is not authenticated. Fix auth before ${action} a checkpoint.`, "error");
		return false;
	}

	return true;
}

interface StartTaskOptions {
	sendKickoffMessage?: boolean;
	startedBy?: "command" | "tool";
}

async function startTask(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	prompt: string,
	options?: StartTaskOptions,
): Promise<ActiveTask | undefined> {
	const normalizedPrompt = normalizePrompt(prompt);
	if (!normalizedPrompt) {
		ctx.ui.notify(USAGE, "warning");
		return undefined;
	}

	if (!(await ensureTaskModelReady(ctx, "starting"))) {
		return undefined;
	}

	const existingStack = getTaskStack(ctx);
	const taskId = randomUUID();
	const previousLeafId = ctx.sessionManager.getLeafId();

	const startedBy = options?.startedBy ?? "command";
	pi.appendEntry<TaskStartData>(TASK_ENTRY_TYPE, {
		version: 1,
		kind: "start",
		taskId,
		prompt: normalizedPrompt,
		createdAt: new Date().toISOString(),
		startedBy,
	});

	const checkpointId = ctx.sessionManager.getLeafId();
	if (!checkpointId || checkpointId === previousLeafId) {
		throw new Error("Failed to create a checkpoint.");
	}

	const startedTask: ActiveTask = {
		entryId: checkpointId,
		taskId,
		prompt: normalizedPrompt,
		createdAt: new Date().toISOString(),
		startedBy,
		depth: existingStack.length + 1,
		label: formatTaskLabel(normalizedPrompt),
	};
	pi.setLabel(checkpointId, buildTreeLabel("start", startedTask));

	updateTaskStatus(ctx);
	ctx.ui.notify(
		startedTask.depth > 1
			? `Started nested checkpoint ${startedTask.depth}: ${startedTask.label}`
			: `Started checkpoint: ${startedTask.label}`,
		"info",
	);

	const shouldSendKickoffMessage = options?.sendKickoffMessage ?? true;
	if (shouldSendKickoffMessage) {
		pi.sendUserMessage(buildTaskUserMessage(normalizedPrompt));
	}

	return startedTask;
}

async function completeTask(
	pi: ExtensionAPI,
	ctx: TaskCompletionContext,
	options?: { requestedBy?: "command" | "tool" },
): Promise<void> {
	const stack = getTaskStack(ctx);
	const activeTask = stack[stack.length - 1];
	const parentTask = stack.length > 1 ? stack[stack.length - 2] : undefined;

	if (!activeTask) {
		ctx.ui.notify("No active checkpoint on the current branch.", "warning");
		ctx.ui.notify("Start one with /task start|run|create <prompt>.", "info");
		return;
	}

	if (options?.requestedBy === "tool" && activeTask.startedBy !== "tool") {
		throw new Error(
			"The active checkpoint was started manually with /task. Only the user may complete it with /task complete.",
		);
	}

	if (!(await ensureTaskModelReady(ctx, "completing"))) {
		return;
	}

	const completeNavigation = async (): Promise<TaskCompletionOutcome> => {
		try {
			const session = getCurrentTaskSession();
			const result = "navigateTree" in ctx && typeof ctx.navigateTree === "function"
				? await ctx.navigateTree(activeTask.entryId, {
						summarize: true,
						customInstructions: buildCompletionSummaryInstructions(activeTask, parentTask),
						label: buildTreeLabel("done", activeTask),
					})
				: await session?.navigateTree(activeTask.entryId, {
						summarize: true,
						customInstructions: buildCompletionSummaryInstructions(activeTask, parentTask),
						label: buildTreeLabel("done", activeTask),
					});

			if (!result) {
				return { kind: "error", message: "No task navigation context is available." };
			}

			if (result.cancelled) {
				return { kind: "cancelled" };
			}

			pi.appendEntry<TaskCompleteData>(TASK_ENTRY_TYPE, {
				version: 1,
				kind: "complete",
				taskId: activeTask.taskId,
				completedAt: new Date().toISOString(),
			});

			updateTaskStatus(ctx);
			return { kind: "completed" };
		} catch (error) {
			return {
				kind: "error",
				message: error instanceof Error ? error.message : String(error),
			};
		}
	};

	let outcome: TaskCompletionOutcome;
	if (ctx.hasUI) {
		const session = getCurrentTaskSession();
		let abortRequested = false;
		outcome = await ctx.ui.custom<TaskCompletionOutcome>((tui, theme, _kb, done) => {
			const loader = new BorderedLoader(tui, theme, buildCompletionLoaderMessage(activeTask), {
				cancellable: session !== undefined,
			});
			loader.onAbort = () => {
				abortRequested = true;
				session?.abortBranchSummary();
			};

			completeNavigation()
				.then((result) => {
					if (abortRequested && result.kind === "cancelled") {
						done({ kind: "aborted" });
						return;
					}
					done(result);
				})
				.catch((error) => {
					done({
						kind: "error",
						message: error instanceof Error ? error.message : String(error),
					});
				});

			return loader;
		});
	} else {
		outcome = await completeNavigation();
	}

	if (outcome.kind === "aborted") {
		ctx.ui.notify("Task summarization cancelled.", "info");
		return;
	}

	if (outcome.kind === "cancelled") {
		ctx.ui.notify("Task completion cancelled.", "info");
		return;
	}

	if (outcome.kind === "error") {
		throw new Error(outcome.message ?? "Task completion failed.");
	}

	ctx.ui.notify(
		activeTask.depth > 1
			? `Completed nested checkpoint ${activeTask.depth}: ${activeTask.label}`
			: `Completed checkpoint: ${activeTask.label}`,
		"info",
	);
}

async function cancelTask(
	pi: ExtensionAPI,
	ctx: TaskCompletionContext,
	options?: { requestedBy?: "command" | "tool" },
): Promise<void> {
	const stack = getTaskStack(ctx);
	const activeTask = stack[stack.length - 1];

	if (!activeTask) {
		ctx.ui.notify("No active checkpoint on the current branch.", "warning");
		ctx.ui.notify("Start one with /task start|run|create <prompt>.", "info");
		return;
	}

	if (options?.requestedBy === "tool" && activeTask.startedBy !== "tool") {
		throw new Error(
			"The active checkpoint was started manually with /task. Only the user may cancel it with /task cancel.",
		);
	}

	pi.setLabel(activeTask.entryId, undefined);
	pi.appendEntry<TaskCancelData>(TASK_ENTRY_TYPE, {
		version: 1,
		kind: "cancel",
		taskId: activeTask.taskId,
		cancelledAt: new Date().toISOString(),
	});

	updateTaskStatus(ctx);
	ctx.ui.notify(
		activeTask.depth > 1
			? `Cancelled nested checkpoint ${activeTask.depth} in place: ${activeTask.label}`
			: `Cancelled checkpoint in place: ${activeTask.label}`,
		"info",
	);
}

async function completePendingToolTask(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
	if (!pendingToolCompletionTaskId || pendingToolCompletionInFlight) return;

	const stack = getTaskStack(ctx);
	const activeTask = stack[stack.length - 1];
	if (!activeTask || activeTask.taskId !== pendingToolCompletionTaskId) return;

	pendingToolCompletionInFlight = true;
	try {
		await completeTask(pi, ctx, { requestedBy: "tool" });
		pendingToolCompletionTaskId = undefined;
	} catch (error) {
		ctx.ui.notify(
			`Failed to complete checkpoint after turn: ${error instanceof Error ? error.message : String(error)}`,
			"error",
		);
	} finally {
		pendingToolCompletionInFlight = false;
	}
}

export default function taskExtension(pi: ExtensionAPI): void {
	pi.registerCommand("task", {
		description: "Start, complete, or cancel a focused work checkpoint",
		handler: async (args, ctx) => {
			const parsed = parseTaskCommand(args);

			if (parsed.action === "status") {
				notifyTaskStack(ctx);
				return;
			}

			await ctx.waitForIdle();

			if (parsed.action === "complete") {
				await completeTask(pi, ctx);
				return;
			}

			if (parsed.action === "cancel") {
				await cancelTask(pi, ctx);
				return;
			}

			if (parsed.action === "start") {
				await startTask(pi, ctx, parsed.prompt);
				return;
			}

			ctx.ui.notify(USAGE, "warning");
		},
	});

	pi.registerTool({
		name: "task",
		label: "Task",
		description: "Start, complete, cancel, or inspect an agent-owned checkpoint in the current conversation. This does not start a subagent.",
		promptSnippet: "Manage an agent-owned checkpoint in the current conversation",
		promptGuidelines: [
			"Use action=start to mark the beginning of a substantial work section in the current conversation.",
			"This tool is checkpointing, not delegation: no subagent is started and you must continue doing the work yourself.",
			"After action=start, immediately continue implementing or investigating the checkpointed work unless the user explicitly asked only to create a checkpoint.",
			"Prefer start for substantial multi-step work such as larger implementations, refactors, debugging passes, migrations, or work likely to take multiple tool calls and responses.",
			"Do not use start for tiny one-shot actions or simple answers that can be handled directly without a checkpoint.",
			"This tool creates a checkpoint only at the current message and never sends a kickoff message.",
			"For user-requested sequences, start one checkpoint, do the work yourself, complete it, then start the next checkpoint.",
			"Use action=complete only for a checkpoint that was started by this tool. Manually-started /task checkpoints must be completed by the user with /task complete.",
			"Do not create nested checkpoints unless the user explicitly asks for nesting.",
		],
		parameters: Type.Object({
			action: Type.Optional(
				Type.Union([
					Type.Literal("start"),
					Type.Literal("complete"),
					Type.Literal("cancel"),
					Type.Literal("status"),
				]),
			),
			prompt: Type.Optional(Type.String({ description: "Checkpoint prompt. Required when action is start." })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const action = params.action ?? "start";

			if (action === "status") {
				const activeTask = getActiveTask(ctx);
				return {
					content: [{ type: "text", text: activeTask ? `Active checkpoint: ${activeTask.label}` : "No active checkpoint." }],
					details: activeTask ?? null,
				};
			}

			if (action === "complete") {
				const activeTask = getActiveTask(ctx);
				if (!activeTask) {
					throw new Error("No active checkpoint on the current branch.");
				}
				if (activeTask.startedBy !== "tool") {
					throw new Error(
						"The active checkpoint was started manually with /task. Only the user may complete it with /task complete.",
					);
				}
				pendingToolCompletionTaskId = activeTask.taskId;
				return {
					content: [
						{
							type: "text",
							text: "Checkpoint marked complete. It will be summarized back after this assistant turn ends.",
						},
					],
					details: { taskId: activeTask.taskId, checkpointId: activeTask.entryId },
				};
			}

			if (action === "cancel") {
				await cancelTask(pi, ctx, { requestedBy: "tool" });
				return {
					content: [{ type: "text", text: "Cancelled active tool-started checkpoint." }],
					details: {},
				};
			}

			const prompt = normalizePrompt(params.prompt ?? "");
			if (!prompt) {
				throw new Error("Checkpoint prompt must not be empty when action is start.");
			}

			const startedTask = await startTask(pi, ctx, prompt, { sendKickoffMessage: false, startedBy: "tool" });
			if (!startedTask) {
				throw new Error("Failed to start checkpoint.");
			}

			return {
				content: [{ type: "text", text: `Checkpoint started: ${startedTask.label}\n${NO_SUBAGENT_MESSAGE}` }],
				details: {
					prompt,
					taskId: startedTask.taskId,
					depth: startedTask.depth,
					checkpointId: startedTask.entryId,
				},
			};
		},
	});

	pi.on("session_start", async (_event, ctx) => updateTaskStatus(ctx));
	pi.on("agent_end", async (_event, ctx) => {
		await completePendingToolTask(pi, ctx);
	});
	pi.on("session_switch", async (_event, ctx) => updateTaskStatus(ctx));
	pi.on("session_tree", async (_event, ctx) => updateTaskStatus(ctx));
	pi.on("session_fork", async (_event, ctx) => updateTaskStatus(ctx));
}
