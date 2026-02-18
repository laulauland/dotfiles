import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { Message } from "@mariozechner/pi-ai";
import { FactoryError } from "./errors.js";
import type { ObservabilityStore } from "./observability.js";
import type { ExecutionResult } from "./types.js";

// ── Branded spawn promise ──────────────────────────────────────────────

export const SPAWN_BRAND = Symbol.for("pi-factory:spawn");

export interface SpawnPromise extends Promise<ExecutionResult> {
	taskId: string;
	[SPAWN_BRAND]: true;
}

// ── Console patching — route program logs to observability ──────────────

export function patchConsole(obs: ObservabilityStore, runId: string): () => void {
	const originalLog = console.log;
	const originalWarn = console.warn;
	const originalError = console.error;

	const format = (...args: unknown[]) => args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ");

	console.log = (...args: unknown[]) => obs.push(runId, "info", `console: ${format(...args)}`);
	console.warn = (...args: unknown[]) => obs.push(runId, "warning", `console: ${format(...args)}`);
	console.error = (...args: unknown[]) => obs.push(runId, "error", `console: ${format(...args)}`);

	return () => {
		console.log = originalLog;
		console.warn = originalWarn;
		console.error = originalError;
	};
}

// ── Promise.all / Promise.allSettled patching for observability ─────────

export function patchPromiseAll(obs: ObservabilityStore, runId: string): () => void {
	const originalAll = Promise.all.bind(Promise);
	const originalAllSettled = Promise.allSettled.bind(Promise);
	let groupCounter = 0;

	Promise.all = function <T>(iterable: Iterable<T>): Promise<Awaited<T>[]> {
		const items = Array.from(iterable);
		const spawns = items.filter((item): item is any => item != null && typeof item === "object" && (item as any)[SPAWN_BRAND] === true);
		if (spawns.length > 0) {
			groupCounter++;
			const groupId = `group-${groupCounter}`;
			obs.push(runId, "info", "group:start", {
				groupId,
				count: spawns.length,
				tasks: spawns.map((s: any) => s.taskId),
			});
			const result = originalAll(items);
			result.then(
				() => obs.push(runId, "info", "group:done", { groupId, count: spawns.length }),
				() => obs.push(runId, "info", "group:failed", { groupId, count: spawns.length }),
			);
			return result;
		}
		return originalAll(items);
	} as typeof Promise.all;

	Promise.allSettled = function <T>(iterable: Iterable<T>): Promise<PromiseSettledResult<Awaited<T>>[]> {
		const items = Array.from(iterable);
		const spawns = items.filter((item): item is any => item != null && typeof item === "object" && (item as any)[SPAWN_BRAND] === true);
		if (spawns.length > 0) {
			groupCounter++;
			const groupId = `group-settled-${groupCounter}`;
			obs.push(runId, "info", "group:start", {
				groupId,
				count: spawns.length,
				tasks: spawns.map((s: any) => s.taskId),
				settled: true,
			});
			const result = originalAllSettled(items);
			result.then(
				() => obs.push(runId, "info", "group:done", { groupId, count: spawns.length }),
			);
			return result;
		}
		return originalAllSettled(items);
	} as typeof Promise.allSettled;

	return () => {
		Promise.all = originalAll;
		Promise.allSettled = originalAllSettled;
	};
}

// ── Single subagent spawn ──────────────────────────────────────────────

interface SpawnInput {
	runId: string;
	taskId: string;
	agent: string;
	prompt: string;
	task: string;
	cwd: string;
	modelId: string;
	tools: string[];
	step?: number;
	signal?: AbortSignal;
	obs: ObservabilityStore;
	onProgress?: (result: ExecutionResult) => void;
	/** Parent session path — subagent can search_thread to explore parent context. */
	parentSessionPath?: string;
	/** Directory to write the subagent's session file into. */
	sessionDir?: string;
}

function newUsage() {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 };
}

function writePromptToTempFile(name: string, prompt: string): { dir: string; filePath: string } {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-factory-prompt-"));
	const safeName = name.replace(/[^\w.-]+/g, "_");
	const filePath = path.join(tmpDir, `${safeName}.md`);
	fs.writeFileSync(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
	return { dir: tmpDir, filePath };
}

export function extractFinalText(messages: Message[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role !== "assistant") continue;
		const parts: string[] = [];
		for (const part of msg.content) {
			if (part.type === "text" && part.text.trim().length > 0) parts.push(part.text);
		}
		if (parts.length > 0) return parts.join("\n").trim();
	}
	return "";
}

export function spawnSubagent(input: SpawnInput): Promise<ExecutionResult> {
	return runSubagentProcess(input);
}

async function runSubagentProcess(input: SpawnInput): Promise<ExecutionResult> {
	input.obs.push(input.runId, "info", `spawn:${input.taskId}`, {
		agent: input.agent,
		model: input.modelId,
		tools: input.tools,
	});

	// Session file: write to sessionDir if provided, otherwise no session
	let sessionPath: string | undefined;
	// pi CLI requires --provider and --model as separate flags; "provider/model" as one --model value silently falls back to default
	const modelArgs: string[] = input.modelId.includes("/")
		? ["--provider", input.modelId.split("/")[0], "--model", input.modelId.split("/").slice(1).join("/")]
		: ["--model", input.modelId];
	const args: string[] = ["--mode", "json", "-p", ...modelArgs];
	if (input.sessionDir) {
		fs.mkdirSync(input.sessionDir, { recursive: true });
		sessionPath = path.join(input.sessionDir, `${input.taskId}.jsonl`);
		args.push("--session", sessionPath);
	} else {
		args.push("--no-session");
	}
	if (input.tools.length > 0) args.push("--tools", input.tools.join(","));

	let tmpDir: string | null = null;
	let tmpPromptPath: string | null = null;

	// Determine the directory for stdout and pid files
	const outputDir = input.sessionDir ?? path.join(os.tmpdir(), "pi-factory-output");
	fs.mkdirSync(outputDir, { recursive: true });
	const stdoutPath = path.join(outputDir, `${input.taskId}.stdout.jsonl`);
	const pidPath = path.join(outputDir, `${input.taskId}.pid`);

	const result: ExecutionResult = {
		taskId: input.taskId,
		agent: input.agent,
		task: input.task,
		exitCode: -1,
		messages: [],
		stderr: "",
		usage: newUsage(),
		model: input.modelId,
		step: input.step,
		text: "",
		sessionPath: undefined, // populated after process exits and file confirmed
	};

	interface PiJsonLine {
		type?: string;
		message?: Message & { usage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; totalTokens?: number; cost?: { total?: number } } };
	}

	const processLine = (line: string) => {
		if (!line.trim()) return;
		let parsed: PiJsonLine;
		try {
			parsed = JSON.parse(line);
		} catch {
			return;
		}
		if (parsed.type === "message_end" && parsed.message) {
			const msg = parsed.message;
			result.messages.push(msg);
			if (msg.role === "assistant") {
				result.usage.turns += 1;
				const usage = msg.usage;
				if (usage) {
					result.usage.input += usage.input || 0;
					result.usage.output += usage.output || 0;
					result.usage.cacheRead += usage.cacheRead || 0;
					result.usage.cacheWrite += usage.cacheWrite || 0;
					result.usage.cost += usage.cost?.total || 0;
					result.usage.contextTokens = usage.totalTokens || 0;
				}
				if (msg.stopReason) result.stopReason = msg.stopReason;
				if (msg.errorMessage) result.errorMessage = msg.errorMessage;
				// Update text on every assistant message so progress shows output
				result.text = extractFinalText(result.messages);
			}
			input.onProgress?.({ ...result, messages: [...result.messages] });
		}
		if (parsed.type === "tool_result_end" && parsed.message) {
			result.messages.push(parsed.message);
			input.onProgress?.({ ...result, messages: [...result.messages] });
		}
	};

	try {
		let prompt = input.prompt.trim();
		if (input.parentSessionPath && fs.existsSync(input.parentSessionPath)) {
			prompt += `\n\nParent conversation session: ${input.parentSessionPath}\nUse search_thread to explore parent context if you need background on what led to this task.`;
		}
		if (prompt) {
			const temp = writePromptToTempFile(input.agent, prompt);
			tmpDir = temp.dir;
			tmpPromptPath = temp.filePath;
			args.push("--append-system-prompt", tmpPromptPath);
		}
		args.push(input.task);

		let aborted = false;
		const childDepth = parseInt(process.env.PI_FACTORY_DEPTH || "0", 10) + 1;
		const code = await new Promise<number>((resolve) => {
			// Open file descriptor for stdout — child writes directly to file
			const stdoutFd = fs.openSync(stdoutPath, "w");
			const proc = spawn("pi", args, {
				cwd: input.cwd,
				detached: true,
				stdio: ["ignore", stdoutFd, stdoutFd],  // both stdout+stderr to file
				shell: false,
				env: { ...process.env, PI_FACTORY_DEPTH: String(childDepth) },
			});
			proc.unref();  // allow parent to exit without waiting for child
			fs.closeSync(stdoutFd);  // parent doesn't need the fd anymore

			// Write PID file for external cancel support
			if (proc.pid != null) {
				fs.writeFileSync(pidPath, String(proc.pid), "utf-8");
			}

			// Poll the stdout file for new content instead of reading from pipes
			let fileOffset = 0;
			let lineBuffer = "";
			const pollInterval = setInterval(() => {
				try {
					const fd = fs.openSync(stdoutPath, "r");
					const stat = fs.fstatSync(fd);
					if (stat.size > fileOffset) {
						const buf = Buffer.alloc(stat.size - fileOffset);
						fs.readSync(fd, buf, 0, buf.length, fileOffset);
						fileOffset = stat.size;
						lineBuffer += buf.toString("utf-8");
						const lines = lineBuffer.split("\n");
						lineBuffer = lines.pop() || "";
						for (const line of lines) processLine(line);
					}
					fs.closeSync(fd);
				} catch {
					// File may not exist yet or be temporarily locked — skip
				}
			}, 250);

			proc.on("close", (exitCode) => {
				clearInterval(pollInterval);
				if (killTimer) clearTimeout(killTimer);
				// Final read to catch any remaining content
				try {
					const content = fs.readFileSync(stdoutPath, "utf-8");
					const remaining = content.slice(fileOffset > content.length ? 0 : fileOffset);
					if (remaining) {
						lineBuffer += remaining;
					}
					if (lineBuffer.trim()) processLine(lineBuffer);
				} catch {}
				// Clean up PID file
				try { fs.unlinkSync(pidPath); } catch {}
				resolve(exitCode ?? 0);
			});
			proc.on("error", () => {
				clearInterval(pollInterval);
				// Clean up PID file
				try { fs.unlinkSync(pidPath); } catch {}
				resolve(1);
			});

			let killTimer: ReturnType<typeof setTimeout> | undefined;
			const kill = () => {
				aborted = true;
				proc.kill("SIGTERM");
				killTimer = setTimeout(() => {
					if (!proc.killed) proc.kill("SIGKILL");
				}, 3000);
			};
			if (input.signal?.aborted) kill();
			input.signal?.addEventListener("abort", kill, { once: true });
		});

		result.exitCode = code;
		result.text = extractFinalText(result.messages);
		if (sessionPath && fs.existsSync(sessionPath)) {
			result.sessionPath = sessionPath;
		}
		if (aborted) {
			throw new FactoryError({ code: "CANCELLED", message: "Subagent aborted.", recoverable: true });
		}
		return result;
	} finally {
		if (tmpPromptPath) try { fs.unlinkSync(tmpPromptPath); } catch {}
		if (tmpDir) try { fs.rmdirSync(tmpDir); } catch {}
	}
}

// ── Factory (program runtime) ──────────────────────────────────────────

export interface RuntimeSpawnInput {
	agent: string;
	prompt: string;
	task: string;
	cwd?: string;
	model: string;
	tools?: string[];
	step?: number;
	signal?: AbortSignal;
}

export interface Factory {
	runId: string;
	spawn(input: RuntimeSpawnInput): SpawnPromise;
	shutdown(cancelRunning?: boolean): Promise<void>;
	observe: {
		log(type: "info" | "warning" | "error", message: string, data?: Record<string, unknown>): void;
		artifact(relativePath: string, content: string): string | null;
	};
}

function validateModelSelector(model: string, agent: string): string {
	if (!model?.trim()) {
		throw new FactoryError({
			code: "INVALID_INPUT",
			message: `Spawn for '${agent}' requires a non-empty 'model'.`,
			recoverable: true,
		});
	}
	return model;
}

export function createFactory(
	ctx: ExtensionContext,
	runId: string,
	obs: ObservabilityStore,
	options?: {
		onTaskUpdate?: (result: ExecutionResult) => void;
		defaultSignal?: AbortSignal;
		parentSessionPath?: string;
		sessionDir?: string;
	},
): Factory {
	let spawnCounter = 0;
	const runtimeAbort = new AbortController();
	const activeTasks = new Map<string, { controller: AbortController; promise: Promise<ExecutionResult> }>();

	const factory: Factory = {
		runId,

		spawn({ agent, prompt, task, cwd, model, tools, step, signal }) {
			if (!prompt?.trim()) {
				throw new FactoryError({
					code: "INVALID_INPUT",
					message: `Spawn for '${agent}' requires non-empty prompt.`,
					recoverable: true,
				});
			}

			const modelId = validateModelSelector(model, agent);

			spawnCounter += 1;
			const taskId = `task-${spawnCounter}`;
			const taskAbort = new AbortController();

			const relayAbort = () => taskAbort.abort();
			const boundSignals = [signal, options?.defaultSignal, runtimeAbort.signal].filter(
				(s): s is AbortSignal => Boolean(s),
			);
			for (const bound of boundSignals) {
				if (bound.aborted) taskAbort.abort();
				else bound.addEventListener("abort", relayAbort, { once: true });
			}

			const taskPromise = spawnSubagent({
				runId,
				taskId,
				agent,
				prompt,
				task,
				cwd: cwd ?? process.cwd(),
				modelId,
				tools: tools ?? [],
				step,
				signal: taskAbort.signal,
				obs,
				onProgress: (partial) => options?.onTaskUpdate?.(partial),
				parentSessionPath: options?.parentSessionPath,
				sessionDir: options?.sessionDir,
			}).then((finalResult) => {
				options?.onTaskUpdate?.(finalResult);
				return finalResult;
			}).finally(() => {
				for (const bound of boundSignals) bound.removeEventListener("abort", relayAbort);
				activeTasks.delete(taskId);
			});
			activeTasks.set(taskId, { controller: taskAbort, promise: taskPromise });

			// Brand the promise
			const branded = taskPromise as any;
			branded[SPAWN_BRAND] = true;
			branded.taskId = taskId;
			return branded as SpawnPromise;
		},

		async shutdown(cancelRunning = true) {
			if (cancelRunning) {
				runtimeAbort.abort();
				for (const { controller } of activeTasks.values()) controller.abort();
			}
			const pending = Array.from(activeTasks.values()).map(({ promise }) => promise);
			if (pending.length > 0) await Promise.allSettled(pending);
			obs.push(runId, "info", "runtime:shutdown", { cancelRunning, pending: pending.length });
		},

		observe: {
			log(type, message, data) { obs.push(runId, type, message, data); },
			artifact(relativePath, content) { return obs.writeArtifact(runId, relativePath, content); },
		},
	};

	return factory;
}

// ── Preflight typecheck ────────────────────────────────────────────────

const PROGRAM_ENV_PATH = path.join(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), "program-env.d.ts");

/**
 * Run a preflight typecheck on program code using tsgo (native TypeScript compiler).
 * Returns null if clean, or an error message string if there are type errors.
 * Falls back silently (returns null) if tsgo is not available.
 */
export async function preflightTypecheck(code: string): Promise<string | null> {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-factory-typecheck-"));
	const programPath = path.join(tmpDir, "program.ts");
	try {
		fs.writeFileSync(programPath, `/// <reference path="env.d.ts" />\n${code}`, "utf-8");
		fs.copyFileSync(PROGRAM_ENV_PATH, path.join(tmpDir, "env.d.ts"));
		fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), JSON.stringify({
			compilerOptions: {
				target: "ES2022",
				module: "ES2022",
				moduleResolution: "bundler",
				moduleDetection: "force",
				strict: true,
				noEmit: true,
				skipLibCheck: true,
				types: [],
			},
			include: ["program.ts", "env.d.ts"],
		}));

		const result = await new Promise<{ code: number; stderr: string }>((resolve) => {
			let stderr = "";
			const proc = spawn("tsgo", ["--noEmit", "-p", path.join(tmpDir, "tsconfig.json")], { stdio: ["ignore", "pipe", "pipe"] });
			proc.stdout.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
			proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
			proc.on("close", (exitCode) => resolve({ code: exitCode ?? 1, stderr }));
			proc.on("error", () => resolve({ code: -1, stderr: "" })); // tsgo not found — skip
		});

		if (result.code === -1) return null; // tsgo not available, skip
		if (result.code === 0) return null; // clean

		const errors = result.stderr
			.split("\n")
			.filter((l) => l.includes("error TS"))
			.join("\n")
			.trim();

		const details = errors || result.stderr.trim();
		if (!details) return null;
		return `Program source preserved at: ${programPath}\n${details}`;
	} catch {
		return null; // don't block on typecheck failures
	}
}

// ── Program module preparation ─────────────────────────────────────────

export function prepareProgramModule(code: string): { modulePath: string } {
	if (!code.trim()) {
		throw new FactoryError({ code: "INVALID_INPUT", message: "Program code is empty.", recoverable: true });
	}
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-factory-program-"));
	const modulePath = path.join(tmpDir, "program.ts");
	fs.writeFileSync(modulePath, code, "utf-8");
	return { modulePath };
}
