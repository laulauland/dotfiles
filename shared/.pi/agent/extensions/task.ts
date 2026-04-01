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

interface TaskStartData {
	version: 1;
	kind: "start";
	taskId: string;
	prompt: string;
	createdAt: string;
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
}

interface ActiveTask extends TaskRecord {
	depth: number;
	label: string;
}

interface TaskCompletionOutcome {
	kind: "completed" | "cancelled" | "aborted" | "error";
	message?: string;
}

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
			stack.length > 1 ? `🧵 ${stack.length} focused task branches active` : "🧵 Focused task branch active",
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
	return `${prompt}\n\nWhen you believe this focused task is complete, explicitly tell the user to run /task complete so the work can be summarized back to the task checkpoint.`;
}

function buildCompletionSummaryInstructions(task: ActiveTask, parentTask: ActiveTask | undefined): string {
	const parentContext = parentTask
		? `This task was nested inside a parent task with this prompt:\n\n${parentTask.prompt}\n\n`
		: "";

	return `${parentContext}This branch was a focused task branch started with this prompt:\n\n${task.prompt}\n\nWhen summarizing back to the checkpoint, focus on:\n- whether the task was completed\n- the most important decisions and why they were made\n- the files that changed\n- validation, tests, or checks that were run\n- any remaining caveats, risks, or follow-up work\n\nKeep the summary concise and action-oriented.`;
}

function buildCompletionLoaderMessage(task: ActiveTask): string {
	return `Returning to ${buildTreeLabel("start", task)} and summarizing this task branch...`;
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
		stack.length === 1 ? `Active task: ${stack[0]!.label}` : `Active tasks (${stack.length})`,
		"info",
	);
	for (const task of stack) {
		const indent = "  ".repeat(Math.max(0, task.depth - 1));
		ctx.ui.notify(`${indent}${task.depth}. ${task.label}`, "info");
	}
	ctx.ui.notify("Run /task complete to summarize the current task back to its checkpoint.", "info");
	ctx.ui.notify("Run /task cancel or /task stop to drop the current task in place without summarizing.", "info");
}

async function ensureTaskModelReady(ctx: ExtensionContext, action: "starting" | "completing"): Promise<boolean> {
	if (!ctx.model) {
		ctx.ui.notify(`Select a model before ${action} a task.`, "error");
		return false;
	}

	if (!ctx.modelRegistry.hasConfiguredAuth(ctx.model)) {
		ctx.ui.notify(`Current model is not authenticated. Fix auth before ${action} a task.`, "error");
		return false;
	}

	return true;
}

async function startTask(pi: ExtensionAPI, ctx: ExtensionContext, prompt: string): Promise<void> {
	const normalizedPrompt = normalizePrompt(prompt);
	if (!normalizedPrompt) {
		ctx.ui.notify(USAGE, "warning");
		return;
	}

	if (!(await ensureTaskModelReady(ctx, "starting"))) {
		return;
	}

	const existingStack = getTaskStack(ctx);
	const taskId = randomUUID();
	const previousLeafId = ctx.sessionManager.getLeafId();

	pi.appendEntry<TaskStartData>(TASK_ENTRY_TYPE, {
		version: 1,
		kind: "start",
		taskId,
		prompt: normalizedPrompt,
		createdAt: new Date().toISOString(),
	});

	const checkpointId = ctx.sessionManager.getLeafId();
	if (!checkpointId || checkpointId === previousLeafId) {
		throw new Error("Failed to create a task checkpoint.");
	}

	const startedTask: ActiveTask = {
		entryId: checkpointId,
		taskId,
		prompt: normalizedPrompt,
		createdAt: new Date().toISOString(),
		depth: existingStack.length + 1,
		label: formatTaskLabel(normalizedPrompt),
	};
	pi.setLabel(checkpointId, buildTreeLabel("start", startedTask));

	updateTaskStatus(ctx);
	ctx.ui.notify(
		startedTask.depth > 1
			? `Started nested task ${startedTask.depth}: ${startedTask.label}`
			: `Started task: ${startedTask.label}`,
		"info",
	);
	pi.sendUserMessage(buildTaskUserMessage(normalizedPrompt));
}

async function completeTask(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	const stack = getTaskStack(ctx);
	const activeTask = stack[stack.length - 1];
	const parentTask = stack.length > 1 ? stack[stack.length - 2] : undefined;

	if (!activeTask) {
		ctx.ui.notify("No active task on the current branch.", "warning");
		ctx.ui.notify("Start one with /task start|run|create <prompt>.", "info");
		return;
	}

	if (!(await ensureTaskModelReady(ctx, "completing"))) {
		return;
	}

	const completeNavigation = async (): Promise<TaskCompletionOutcome> => {
		try {
			const result = await ctx.navigateTree(activeTask.entryId, {
				summarize: true,
				customInstructions: buildCompletionSummaryInstructions(activeTask, parentTask),
				label: buildTreeLabel("done", activeTask),
			});

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
			? `Completed nested task ${activeTask.depth}: ${activeTask.label}`
			: `Completed task: ${activeTask.label}`,
		"info",
	);
}

async function cancelTask(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	const stack = getTaskStack(ctx);
	const activeTask = stack[stack.length - 1];

	if (!activeTask) {
		ctx.ui.notify("No active task on the current branch.", "warning");
		ctx.ui.notify("Start one with /task start|run|create <prompt>.", "info");
		return;
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
			? `Cancelled nested task ${activeTask.depth} in place: ${activeTask.label}`
			: `Cancelled task in place: ${activeTask.label}`,
		"info",
	);
}

export default function taskExtension(pi: ExtensionAPI): void {
	pi.registerCommand("task", {
		description: "Start, complete, or cancel a focused task branch",
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
		description:
			"Start a focused task branch. This only begins a task; the human must later run /task complete or /task cancel manually.",
		promptSnippet: "Start a focused task branch for a substantial subtask via /task start <prompt>",
		promptGuidelines: [
			"Use this tool when you want to spin off a focused task branch and keep the main thread cleaner.",
			"Prefer this for substantial multi-step work such as larger implementations, refactors, debugging passes, migrations, or any subtask likely to take multiple tool calls and responses.",
			"Examples of good use: implementing a feature across several files, refactoring a subsystem, debugging a failing test suite, migrating code to a new API, or doing a focused investigation-and-fix pass.",
			"Do not use this for tiny one-shot actions or simple answers that can be handled directly in the current branch.",
			"Examples of bad use: reading one file to answer a question, making one very small edit, explaining an error message, or running one quick command and reporting the result.",
			"This tool only starts tasks. A human must later run /task complete or /task cancel manually.",
			"When you believe this focused task is complete, explicitly tell the user to run /task complete so the work can be summarized back to the task checkpoint.",
		],
		parameters: Type.Object({
			prompt: Type.String({ description: "Focused task prompt to start in a task branch" }),
		}),
		async execute(_toolCallId, params) {
			const prompt = normalizePrompt(params.prompt);
			if (!prompt) {
				throw new Error("Task prompt must not be empty.");
			}

			pi.sendUserMessage(`/task start ${prompt}`, { deliverAs: "followUp" });
			return {
				content: [{ type: "text", text: `Queued /task start ${formatTaskLabel(prompt)}` }],
				details: { prompt },
			};
		},
	});

	pi.on("session_start", async (_event, ctx) => updateTaskStatus(ctx));
	pi.on("session_switch", async (_event, ctx) => updateTaskStatus(ctx));
	pi.on("session_tree", async (_event, ctx) => updateTaskStatus(ctx));
	pi.on("session_fork", async (_event, ctx) => updateTaskStatus(ctx));
}
