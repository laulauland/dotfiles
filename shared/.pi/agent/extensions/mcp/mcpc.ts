/**
 * Mcpc Service - Effect wrapper for @apify/mcpc CLI
 */

import { Context, Effect, Layer } from "effect";
import { spawn } from "child_process";
import { homedir } from "os";
import { join } from "path";
import {
	type McpTool,
	type ServerStatus,
	McpError,
	AuthRequired,
	ServerError,
	NotFound,
	TransportError,
} from "./types.js";

// ============================================================================
// Types
// ============================================================================

export interface ServerWithStatus {
	name: string;
	url: string;
	status: ServerStatus;
}

export interface McpcService {
	listServersWithStatus(): Effect.Effect<ServerWithStatus[], McpError>;
	listTools(server: string): Effect.Effect<McpTool[], McpError>;
	callTool(server: string, tool: string, args: Record<string, unknown>): Effect.Effect<unknown, McpError>;
	auth(server: string): Effect.Effect<void, McpError>;
}

export const McpcService = Context.GenericTag<McpcService>("McpcService");

// ============================================================================
// Config
// ============================================================================

const CONFIG_PATH = join(homedir(), ".cursor", "mcp.json");

// ============================================================================
// CLI Helpers
// ============================================================================

interface SpawnResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

const runMcpc = (args: string[]): Effect.Effect<SpawnResult, McpError> =>
	Effect.async<SpawnResult, McpError>((resume) => {
		const fullArgs = ["-c", CONFIG_PATH, ...args];
		const proc = spawn("mcpc", fullArgs, {
			stdio: ["pipe", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		proc.stdout.on("data", (data) => {
			stdout += data.toString();
		});

		proc.stderr.on("data", (data) => {
			stderr += data.toString();
		});

		proc.on("error", (err) => {
			resume(Effect.fail(TransportError("mcpc", `Failed to spawn mcpc: ${err.message}`)));
		});

		proc.on("close", (exitCode) => {
			resume(Effect.succeed({ stdout, stderr, exitCode: exitCode ?? 0 }));
		});
	});

const parseJsonOutput = <T>(result: SpawnResult, server: string): Effect.Effect<T, McpError> =>
	Effect.try({
		try: () => JSON.parse(result.stdout) as T,
		catch: () => ServerError(server, `Failed to parse mcpc output: ${result.stdout.slice(0, 200)}`),
	});

const mapError = (result: SpawnResult, server: string): McpError => {
	const combined = `${result.stderr} ${result.stdout}`.toLowerCase();

	if (combined.includes("authentication required") || combined.includes("401") || combined.includes("invalid_token")) {
		return AuthRequired(server, `mcpc -c ${CONFIG_PATH} ${server} login`);
	}

	if (combined.includes("not found") || combined.includes("no such")) {
		return NotFound(server);
	}

	if (combined.includes("connection") || combined.includes("network") || combined.includes("timeout")) {
		return TransportError(server, result.stderr || result.stdout);
	}

	// Extract clean error message
	const lines = (result.stderr || result.stdout).split("\n").filter((l) => l.trim() && !l.includes("    at "));
	const msg = lines.slice(0, 2).join(" ").trim() || `Command failed with exit code ${result.exitCode}`;
	return ServerError(server, msg);
};

// ============================================================================
// Config File Reading
// ============================================================================

interface McpConfig {
	mcpServers: Record<string, { url: string }>;
}

const readConfig = (): Effect.Effect<McpConfig, McpError> =>
	Effect.tryPromise({
		try: async () => {
			const fs = await import("fs/promises");
			const content = await fs.readFile(CONFIG_PATH, "utf8");
			return JSON.parse(content) as McpConfig;
		},
		catch: () => ServerError("config", `Failed to read MCP config from ${CONFIG_PATH}`),
	});

// ============================================================================
// Service Implementation
// ============================================================================

export const McpcServiceLive = Layer.succeed(
	McpcService,
	McpcService.of({
		listServersWithStatus: () =>
			Effect.gen(function* () {
				const config = yield* readConfig();
				const servers: ServerWithStatus[] = [];

				for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
					// Quick check - try to list tools to see if auth is needed
					const result = yield* runMcpc([name, "tools-list", "--json"]);

					let status: ServerStatus;
					if (result.exitCode === 0) {
						const tools = JSON.parse(result.stdout) as unknown[];
						status = {
							state: "ready",
							checked_at: new Date().toISOString(),
							message: null,
							auth_command: `mcpc -c ${CONFIG_PATH} ${name} login`,
							tool_count: tools.length,
							server_info: null,
						};
					} else if (result.stderr.includes("Authentication required") || result.stdout.includes("401")) {
						status = {
							state: "auth_required",
							checked_at: new Date().toISOString(),
							message: "needs authentication",
							auth_command: `mcpc -c ${CONFIG_PATH} ${name} login`,
							tool_count: 0,
							server_info: null,
						};
					} else {
						status = {
							state: "error",
							checked_at: new Date().toISOString(),
							message: result.stderr.split("\n")[0] || "connection error",
							auth_command: `mcpc -c ${CONFIG_PATH} ${name} login`,
							tool_count: 0,
							server_info: null,
						};
					}

					servers.push({ name, url: serverConfig.url, status });
				}

				return servers;
			}),

		listTools: (server: string) =>
			Effect.gen(function* () {
				const result = yield* runMcpc([server, "tools-list", "--json"]);

				if (result.exitCode !== 0) {
					return yield* Effect.fail(mapError(result, server));
				}

				interface McpcTool {
					name: string;
					description?: string;
					inputSchema?: Record<string, unknown>;
				}

				const tools = yield* parseJsonOutput<McpcTool[]>(result, server);

				return tools.map((t) => ({
					name: t.name,
					description: t.description || "",
					inputSchema: t.inputSchema || {},
				}));
			}),

		callTool: (server: string, tool: string, args: Record<string, unknown>) =>
			Effect.gen(function* () {
				// Convert args to mcpc format: key:=value for JSON values
				const argPairs = Object.entries(args).map(([k, v]) => `${k}:=${JSON.stringify(v)}`);
				const result = yield* runMcpc([server, "tools-call", tool, ...argPairs, "--json"]);

				if (result.exitCode !== 0) {
					return yield* Effect.fail(mapError(result, server));
				}

				interface McpcResult {
					content?: Array<{ type: string; text?: string }>;
				}

				const parsed = yield* parseJsonOutput<McpcResult>(result, server);

				// Extract text content
				if (parsed.content) {
					const texts = parsed.content.filter((c) => c.type === "text").map((c) => c.text);
					return texts.join("\n");
				}

				return parsed;
			}),

		auth: (server: string) =>
			Effect.gen(function* () {
				const result = yield* runMcpc([server, "login"]);

				if (result.exitCode !== 0) {
					const msg = (result.stderr || result.stdout).split("\n").filter((l) => l.trim() && !l.includes("    at ")).slice(0, 2).join(" ").trim();
					return yield* Effect.fail(ServerError(server, msg || "Authentication failed"));
				}
			}),
	})
);
