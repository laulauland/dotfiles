/**
 * Ambient type declarations for pi-factory programs.
 * Available as globals — do not import.
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

interface SpawnInput {
	agent: string;
	prompt: string;
	task: string;
	model: string;
	cwd?: string;
	tools?: string[];
	step?: number;
	signal?: AbortSignal;
}

interface Factory {
	runId: string;
	spawn(input: SpawnInput): Promise<ExecutionResult>;
	shutdown(cancelRunning?: boolean): Promise<void>;
	observe: {
		log(type: "info" | "warning" | "error", message: string, data?: Record<string, unknown>): void;
		artifact(relativePath: string, content: string): string | null;
	};
}

declare const factory: Factory;
declare const process: { cwd(): string; env: Record<string, string | undefined>; [key: string]: unknown };
declare const console: { log(...args: unknown[]): void; error(...args: unknown[]): void; warn(...args: unknown[]): void };
