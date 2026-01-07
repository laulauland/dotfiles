/**
 * Mcpc Service - Effect wrapper for mcpc CLI
 *
 * Supports multiple MCP config sources:
 * - pi: ~/.pi/agent/mcp.json (highest priority)
 * - Cursor: ~/.cursor/mcp.json
 * - Claude Desktop (macOS): ~/Library/Application Support/Claude/claude_desktop_config.json
 * - Claude Desktop (Linux): ~/.config/Claude/claude_desktop_config.json
 * - Claude Code: ~/.claude.json (per-project MCP servers)
 */

import { Context, Effect, Layer, pipe, Scope, Stream } from "effect";
import { FileSystem, Path, Command, CommandExecutor } from "@effect/platform";
import { NodeFileSystem, NodePath, NodeCommandExecutor } from "@effect/platform-node";
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
	source: ConfigSource;
	status: ServerStatus;
}

export interface McpcService {
	isMcpcAvailable(): Effect.Effect<boolean, never>;
	listServersWithStatus(): Effect.Effect<ServerWithStatus[], McpError>;
	listTools(server: string): Effect.Effect<McpTool[], McpError>;
	callTool(server: string, tool: string, args: Record<string, unknown>): Effect.Effect<unknown, McpError>;
	auth(server: string): Effect.Effect<void, McpError>;
}

export const McpcService = Context.GenericTag<McpcService>("McpcService");

// ============================================================================
// Config Sources
// ============================================================================

interface ConfigSource {
	name: string;
	label: string; // Human-readable label with scope
	path: string;
	projectPath?: string;
	generatedConfigPath?: string;
}

const getConfigSources = (
	home: string,
	cwd: string | undefined,
	pathService: Path.Path
): ConfigSource[] => {
	const sources: ConfigSource[] = [];

	// Our own global config (highest priority)
	sources.push({
		name: "pi",
		label: "~/.pi/agent/mcp.json",
		path: pathService.join(home, ".pi", "agent", "mcp.json"),
	});

	// Cursor
	sources.push({
		name: "cursor",
		label: "~/.cursor/mcp.json",
		path: pathService.join(home, ".cursor", "mcp.json"),
	});

	// Claude Desktop - platform specific
	if (process.platform === "darwin") {
		sources.push({
			name: "claude-desktop",
			label: "Claude Desktop",
			path: pathService.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
		});
	} else {
		sources.push({
			name: "claude-desktop",
			label: "Claude Desktop",
			path: pathService.join(home, ".config", "Claude", "claude_desktop_config.json"),
		});
	}

	// Claude Code - per-project
	if (cwd) {
		sources.push({
			name: "claude-code",
			label: "Claude Code (project)",
			path: pathService.join(home, ".claude.json"),
			projectPath: cwd,
		});
	}

	return sources;
};

// Track which config source each server came from
const serverSourceMap = new Map<string, ConfigSource>();

// Track server URLs for auth (mcpc login needs URL, not name)
const serverUrlMap = new Map<string, string>();

// Cache mcpc availability
let mcpcAvailable: boolean | null = null;

// ============================================================================
// CLI Helpers
// ============================================================================

interface CommandResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

const DEFAULT_TIMEOUT_MS = 60000; // 60 seconds

const makeCheckMcpcAvailable = (executor: CommandExecutor.CommandExecutor) =>
	Effect.gen(function* () {
		if (mcpcAvailable !== null) {
			return mcpcAvailable;
		}

		const result = yield* pipe(
			executor.exitCode(Command.make("which", "mcpc")),
			Effect.map((code) => code === 0),
			Effect.catchAll(() => Effect.succeed(false))
		);

		mcpcAvailable = result;
		return result;
	});

const collectStream = (stream: Stream.Stream<Uint8Array, unknown>): Effect.Effect<string, unknown> =>
	pipe(
		stream,
		Stream.runFold("", (acc, chunk) => acc + new TextDecoder().decode(chunk))
	);

// Factory that creates runMcpc with CommandExecutor already captured
const makeRunMcpc = (executor: CommandExecutor.CommandExecutor) => {
	const runMcpcScoped = (
		configPath: string,
		args: string[],
		timeoutMs = DEFAULT_TIMEOUT_MS
	): Effect.Effect<CommandResult, McpError, Scope.Scope> =>
		Effect.gen(function* () {
			// Only add -c flag if configPath is provided
			const fullArgs = configPath ? ["-c", configPath, ...args] : args;

			const cmd = Command.make("mcpc", ...fullArgs);
			const process = yield* pipe(
				executor.start(cmd),
				Effect.mapError((err) => {
					if (err.message?.includes("ENOENT")) {
						return TransportError("mcpc", "mcpc CLI not found. Install with: npm i -g @apify/mcpc");
					}
					return TransportError("mcpc", `Failed to spawn mcpc: ${err.message}`);
				})
			);

			// Collect stdout and stderr in parallel, with timeout
			const [stdout, stderr, exitCode] = yield* pipe(
				Effect.all([
					collectStream(process.stdout),
					collectStream(process.stderr),
					process.exitCode,
				]),
				Effect.timeout(`${timeoutMs} millis`),
				Effect.catchTag("TimeoutException", () =>
					Effect.gen(function* () {
						yield* process.kill("SIGTERM");
						return yield* Effect.fail(TransportError("mcpc", `Timeout after ${timeoutMs / 1000}s`));
					})
				),
				Effect.mapError((err) =>
					err instanceof McpError ? err : TransportError("mcpc", `Command failed: ${err}`)
				)
			);

			return { stdout, stderr, exitCode };
		});

	// Return the scoped wrapper
	return (configPath: string, args: string[], timeoutMs = DEFAULT_TIMEOUT_MS): Effect.Effect<CommandResult, McpError> =>
		Effect.scoped(runMcpcScoped(configPath, args, timeoutMs));
};

const getConfigPathForServer = (server: string, defaultPath: string): string => {
	const source = serverSourceMap.get(server);
	return source?.generatedConfigPath ?? source?.path ?? defaultPath;
};

const mapError = (result: CommandResult, server: string, configPath: string): McpError => {
	const combined = `${result.stderr} ${result.stdout}`.toLowerCase();

	if (combined.includes("authentication required") || combined.includes("401") || combined.includes("invalid_token")) {
		// Use URL for login command (mcpc bug: name resolves to https://name)
		const url = serverUrlMap.get(server);
		const authCmd = url ? `mcpc "${url}" login` : `mcpc -c ${configPath} ${server} login`;
		return AuthRequired(server, authCmd);
	}

	if (combined.includes("not found") || combined.includes("no such")) {
		return NotFound(server);
	}

	if (combined.includes("connection") || combined.includes("network") || combined.includes("timeout")) {
		return TransportError(server, result.stderr || result.stdout);
	}

	const lines = (result.stderr || result.stdout).split("\n").filter((l) => l.trim() && !l.includes("    at "));
	const msg = lines.slice(0, 2).join(" ").trim() || `Command failed with exit code ${result.exitCode}`;
	return ServerError(server, msg);
};

// ============================================================================
// Config Reading
// ============================================================================

interface McpConfig {
	mcpServers: Record<string, { url: string }>;
}

interface ClaudeCodeConfig {
	projects: Record<
		string,
		{
			mcpServers?: Record<
				string,
				| { type: "http" | "sse"; url: string }
				| { type: "stdio"; command: string; args?: string[]; env?: Record<string, string> }
			>;
		}
	>;
}

interface ServerEntry {
	name: string;
	url: string;
	source: ConfigSource;
}

const readClaudeCodeServers = (
	fs: FileSystem.FileSystem,
	pathService: Path.Path,
	source: ConfigSource,
	tmpDir: string
): Effect.Effect<{ servers: ServerEntry[]; generatedConfigPath: string | undefined }, never> =>
	Effect.gen(function* () {
		if (!source.projectPath) {
			return { servers: [], generatedConfigPath: undefined };
		}

		const content = yield* pipe(
			fs.readFileString(source.path),
			Effect.catchAll(() => Effect.succeed(""))
		);

		if (!content) {
			return { servers: [], generatedConfigPath: undefined };
		}

		const config = yield* pipe(
			Effect.try(() => JSON.parse(content) as ClaudeCodeConfig),
			Effect.catchAll(() => Effect.succeed({ projects: {} } as ClaudeCodeConfig))
		);

		if (!config.projects) {
			return { servers: [], generatedConfigPath: undefined };
		}

		// Find project config
		let projectConfig: ClaudeCodeConfig["projects"][string] | undefined;
		let projectPath = source.projectPath;

		while (projectPath && projectPath.length > 1) {
			if (config.projects[projectPath]) {
				projectConfig = config.projects[projectPath];
				break;
			}
			const parent = pathService.dirname(projectPath);
			if (parent === projectPath) break;
			projectPath = parent;
		}

		if (!projectConfig?.mcpServers) {
			return { servers: [], generatedConfigPath: undefined };
		}

		const servers: ServerEntry[] = [];
		const mcpServers: Record<string, { url: string }> = {};

		for (const [name, serverConfig] of Object.entries(projectConfig.mcpServers)) {
			if (serverConfig.type === "http" || serverConfig.type === "sse") {
				mcpServers[name] = { url: serverConfig.url };
				servers.push({ name, url: serverConfig.url, source });
			}
		}

		let generatedConfigPath: string | undefined;
		if (Object.keys(mcpServers).length > 0) {
			generatedConfigPath = pathService.join(tmpDir, "pi-mcp-claude-code.json");
			yield* pipe(
				fs.writeFileString(generatedConfigPath, JSON.stringify({ mcpServers }, null, 2)),
				Effect.catchAll(() => Effect.void)
			);
		}

		return { servers, generatedConfigPath };
	});

const readAllServers = (cwd: string | undefined): Effect.Effect<ServerEntry[], McpError, FileSystem.FileSystem | Path.Path> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const pathService = yield* Path.Path;
		const home = process.env.HOME || process.env.USERPROFILE || "~";
		const tmpDir = process.env.TMPDIR || "/tmp";
		const sources = getConfigSources(home, cwd, pathService);

		const servers: ServerEntry[] = [];
		const seenNames = new Set<string>();

		serverSourceMap.clear();

		for (const source of sources) {
			let sourceServers: ServerEntry[] = [];

			if (source.name === "claude-code") {
				const result = yield* readClaudeCodeServers(fs, pathService, source, tmpDir);
				sourceServers = result.servers;
				if (result.generatedConfigPath) {
					source.generatedConfigPath = result.generatedConfigPath;
				}
			} else {
				const content = yield* pipe(
					fs.readFileString(source.path),
					Effect.catchAll(() => Effect.succeed(""))
				);

				if (content) {
					const config = yield* pipe(
						Effect.try(() => JSON.parse(content) as McpConfig),
						Effect.catchAll(() => Effect.succeed({ mcpServers: {} } as McpConfig))
					);

					if (config.mcpServers) {
						for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
							sourceServers.push({ name, url: serverConfig.url, source });
						}
					}
				}
			}

			// First source wins
			for (const entry of sourceServers) {
				if (seenNames.has(entry.name)) {
					continue;
				}
				seenNames.add(entry.name);
				servers.push(entry);
				serverSourceMap.set(entry.name, entry.source);
				serverUrlMap.set(entry.name, entry.url);
			}
		}

		return servers;
	});

// ============================================================================
// Service Implementation
// ============================================================================

const McpcServiceImpl = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const pathService = yield* Path.Path;
	const executor = yield* CommandExecutor.CommandExecutor;
	const runMcpc = makeRunMcpc(executor);
	const checkMcpcAvailable = makeCheckMcpcAvailable(executor);
	const home = process.env.HOME || process.env.USERPROFILE || "~";
	const defaultConfigPath = pathService.join(home, ".pi", "agent", "mcp.json");

	return McpcService.of({
		isMcpcAvailable: () => checkMcpcAvailable,

		listServersWithStatus: () =>
			Effect.gen(function* () {
				const cwd = process.cwd();
				const serverEntries = yield* pipe(
					readAllServers(cwd),
					Effect.provide(NodeFileSystem.layer),
					Effect.provide(NodePath.layer)
				);

				const servers: ServerWithStatus[] = [];

				for (const entry of serverEntries) {
					const { name, url, source } = entry;
					const configPath = source.generatedConfigPath ?? source.path;
					const result = yield* runMcpc(configPath, [name, "tools-list", "--json"]);

					let status: ServerStatus;
					// mcpc login needs the URL directly (bug: using name resolves to https://name)
					const authCommand = `mcpc "${url}" login`;

					if (result.exitCode === 0) {
						const tools = JSON.parse(result.stdout) as unknown[];
						status = {
							state: "ready",
							checked_at: new Date().toISOString(),
							message: null,
							auth_command: authCommand,
							tool_count: tools.length,
							server_info: null,
						};
					} else if (result.stderr.includes("Authentication required") || result.stdout.includes("401")) {
						status = {
							state: "auth_required",
							checked_at: new Date().toISOString(),
							message: "needs authentication",
							auth_command: authCommand,
							tool_count: 0,
							server_info: null,
						};
					} else {
						status = {
							state: "error",
							checked_at: new Date().toISOString(),
							message: result.stderr.split("\n")[0] || "connection error",
							auth_command: authCommand,
							tool_count: 0,
							server_info: null,
						};
					}

					servers.push({ name, url, source, status });
				}

				return servers;
			}),

		listTools: (server: string) =>
			Effect.gen(function* () {
				const configPath = getConfigPathForServer(server, defaultConfigPath);
				const result = yield* runMcpc(configPath, [server, "tools-list", "--json"]);

				if (result.exitCode !== 0) {
					return yield* Effect.fail(mapError(result, server, configPath));
				}

				interface McpcTool {
					name: string;
					description?: string;
					inputSchema?: Record<string, unknown>;
				}

				const tools = yield* pipe(
					Effect.try(() => JSON.parse(result.stdout) as McpcTool[]),
					Effect.mapError(() => ServerError(server, `Failed to parse mcpc output: ${result.stdout.slice(0, 200)}`))
				);

				return tools.map((t) => ({
					name: t.name,
					description: t.description || "",
					inputSchema: t.inputSchema || {},
				}));
			}),

		callTool: (server: string, tool: string, args: Record<string, unknown>) =>
			Effect.gen(function* () {
				const configPath = getConfigPathForServer(server, defaultConfigPath);
				const argPairs = Object.entries(args).map(([k, v]) => `${k}:=${JSON.stringify(v)}`);
				const result = yield* runMcpc(configPath, [server, "tools-call", tool, ...argPairs, "--json"]);

				if (result.exitCode !== 0) {
					return yield* Effect.fail(mapError(result, server, configPath));
				}

				interface McpcResult {
					content?: Array<{ type: string; text?: string }>;
				}

				const parsed = yield* pipe(
					Effect.try(() => JSON.parse(result.stdout) as McpcResult),
					Effect.mapError(() => ServerError(server, `Failed to parse mcpc output: ${result.stdout.slice(0, 200)}`))
				);

				if (parsed.content) {
					const texts = parsed.content.filter((c) => c.type === "text").map((c) => c.text);
					return texts.join("\n");
				}

				return parsed;
			}),

		auth: (server: string) =>
			Effect.gen(function* () {
				// mcpc login needs the URL directly (bug: using server name resolves to https://name)
				const url = serverUrlMap.get(server);
				if (!url) {
					return yield* Effect.fail(ServerError(server, "Server URL not found. Try running /mcp to sync first."));
				}
				const result = yield* runMcpc("", [url, "login"]); // No config needed when using URL directly

				if (result.exitCode !== 0) {
					const msg = (result.stderr || result.stdout)
						.split("\n")
						.filter((l) => l.trim() && !l.includes("    at "))
						.slice(0, 2)
						.join(" ")
						.trim();
					return yield* Effect.fail(ServerError(server, msg || "Authentication failed"));
				}
			}),
	});
});

// NodeCommandExecutor depends on FileSystem, so we need to compose them properly
const CommandExecutorLive = NodeCommandExecutor.layer.pipe(Layer.provide(NodeFileSystem.layer));

export const McpcServiceLive = Layer.effect(McpcService, McpcServiceImpl).pipe(
	Layer.provide(NodeFileSystem.layer),
	Layer.provide(NodePath.layer),
	Layer.provide(CommandExecutorLive)
);
