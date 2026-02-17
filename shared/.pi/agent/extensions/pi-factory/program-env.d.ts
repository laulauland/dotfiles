/**
 * Ambient type declarations for pi-factory programs.
 * Injected automatically during preflight typecheck — not imported by user code.
 */

interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

interface ExecutionResult {
	taskId: string;
	agent: string;
	task: string;
	exitCode: number;
	messages: unknown[];
	stderr: string;
	usage: UsageStats;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	step?: number;
	text: string;
	sessionPath?: string;
}

interface SpawnHandle {
	taskId: string;
	join: () => Promise<ExecutionResult>;
	then: <TResult1 = ExecutionResult, TResult2 = never>(
		onfulfilled?: ((value: ExecutionResult) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
	) => Promise<TResult1 | TResult2>;
}

interface RuntimeSpawnInput {
	agent: string;
	systemPrompt: string;
	task: string;
	cwd: string;
	model: string;
	tools?: string[];
	step?: number;
	signal?: AbortSignal;
}

interface ProgramRuntime {
	runId: string;
	spawn(input: RuntimeSpawnInput): SpawnHandle;
	join(handle: SpawnHandle): Promise<ExecutionResult>;
	join(handles: SpawnHandle[]): Promise<ExecutionResult[]>;
	parallel(label: string, inputs: RuntimeSpawnInput[]): Promise<ExecutionResult[]>;
	sequence(label: string, inputs: RuntimeSpawnInput[]): Promise<ExecutionResult[]>;
	shutdown(cancelRunning?: boolean): Promise<void>;
	workspace: { create(name?: string): string; cleanup(path: string): void };
	observe: {
		log(type: "info" | "warning" | "error", message: string, data?: Record<string, unknown>): void;
		artifact(relativePath: string, content: string): string | null;
	};
}

declare const process: { cwd(): string; env: Record<string, string | undefined>; [key: string]: unknown };
declare const console: { log(...args: unknown[]): void; error(...args: unknown[]): void; warn(...args: unknown[]): void };
