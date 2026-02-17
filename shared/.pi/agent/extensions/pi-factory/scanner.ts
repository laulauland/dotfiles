import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { RunRecord, RunStatus } from "./registry.js";
import type { RunSummary, ExecutionResult, UsageStats } from "./types.js";

/**
 * Filesystem scanner for standalone --factory mode.
 * Reads run.json files from ~/.pi/agent/sessions/&lt;session-dir&gt;/.factory/&lt;run-id&gt;/run.json
 */

/** Convert a cwd path to the session directory name pi uses. */
export function cwdToSessionDir(cwd: string): string {
	// /Users/foo/Code/project → --Users-foo-Code-project--
	return "--" + cwd.slice(1).replace(/\//g, "-") + "--";
}

/** Shape of run.json on disk (written by writeRunJson in index.ts). */
interface RunJsonData {
	runId: string;
	status?: RunStatus;
	task?: string;
	startedAt?: number;
	completedAt?: number;
	results?: Array<{
		agent: string;
		task: string;
		model?: string;
		exitCode: number;
		text: string;
		sessionPath?: string;
		usage?: UsageStats;
		stopReason?: string;
		errorMessage?: string;
	}>;
	error?: { code: string; message: string; recoverable: boolean };
}

/** Parse a single run.json into a RunRecord (without promise/abort). */
function parseRunJson(data: RunJsonData): Omit<RunRecord, "promise" | "abort"> {
	const status: RunStatus = data.status ?? "done";
	const results: ExecutionResult[] = (data.results ?? []).map((r) => ({
		taskId: "",
		agent: r.agent ?? "unknown",
		task: r.task ?? "",
		exitCode: r.exitCode ?? -1,
		messages: [],
		stderr: "",
		usage: r.usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
		model: r.model,
		stopReason: r.stopReason,
		errorMessage: r.errorMessage,
		text: r.text ?? "",
		sessionPath: r.sessionPath,
	}));

	const summary: RunSummary = {
		runId: data.runId,
		status,
		results,
		error: data.error as RunSummary["error"],
		metadata: { task: data.task },
	};

	return {
		runId: data.runId,
		status,
		summary,
		startedAt: data.startedAt ?? Date.now(),
		completedAt: data.completedAt,
		acknowledged: true,
		task: data.task,
	};
}

/** Get the sessions base directory. */
export function getSessionsBase(): string {
	return path.join(os.homedir(), ".pi", "agent", "sessions");
}

/**
 * Scan all run.json files under a session's .factory directory.
 * If sessionDirName is provided, scans only that session.
 * If not provided, scans all sessions.
 */
export function scanRuns(sessionsBase: string, sessionDirName?: string): Omit<RunRecord, "promise" | "abort">[] {
	const records: Omit<RunRecord, "promise" | "abort">[] = [];

	const sessionDirs = sessionDirName
		? [sessionDirName]
		: listSessionDirs(sessionsBase);

	for (const dir of sessionDirs) {
		const factoryDir = path.join(sessionsBase, dir, ".factory");
		if (!fs.existsSync(factoryDir)) continue;

		try {
			for (const entry of fs.readdirSync(factoryDir)) {
				const runJsonPath = path.join(factoryDir, entry, "run.json");
				if (!fs.existsSync(runJsonPath)) continue;
				try {
					const raw = fs.readFileSync(runJsonPath, "utf-8");
					const data: RunJsonData = JSON.parse(raw);
					records.push(parseRunJson(data));
				} catch {
					// Skip malformed run.json files
				}
			}
		} catch {
			// Skip inaccessible directories
		}
	}

	return records;
}

/**
 * Cancel a subagent by reading its PID file and sending SIGTERM (then SIGKILL after 3s).
 * Returns true if the signal was sent, false if the PID file was missing or the process was already gone.
 */
export function cancelByPidFile(outputDir: string, taskId: string): boolean {
	const pidPath = path.join(outputDir, `${taskId}.pid`);
	try {
		const pid = parseInt(fs.readFileSync(pidPath, "utf-8").trim(), 10);
		if (isNaN(pid)) return false;
		process.kill(pid, "SIGTERM");
		setTimeout(() => {
			try { process.kill(pid, "SIGKILL"); } catch {}
		}, 3000);
		return true;
	} catch {
		return false;
	}
}

/**
 * Cancel all running subagents for a run by scanning for PID files in the run's sessions directory.
 * Returns the number of processes signalled.
 */
export function cancelRunByPidFiles(artifactsDir: string): number {
	const sessionsDir = path.join(artifactsDir, "sessions");
	let cancelled = 0;
	try {
		if (!fs.existsSync(sessionsDir)) return 0;
		for (const entry of fs.readdirSync(sessionsDir)) {
			if (!entry.endsWith(".pid")) continue;
			const taskId = entry.replace(/\.pid$/, "");
			if (cancelByPidFile(sessionsDir, taskId)) cancelled++;
		}
	} catch {}
	return cancelled;
}

/** List all session directory names under the sessions base. */
function listSessionDirs(sessionsBase: string): string[] {
	try {
		if (!fs.existsSync(sessionsBase)) return [];
		return fs.readdirSync(sessionsBase).filter((d) => {
			try {
				return fs.statSync(path.join(sessionsBase, d)).isDirectory();
			} catch {
				return false;
			}
		});
	} catch {
		return [];
	}
}
