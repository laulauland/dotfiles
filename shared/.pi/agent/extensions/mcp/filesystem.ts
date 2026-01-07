/**
 * McpFs Service - file operations for MCP server data
 * Uses @effect/platform FileSystem for proper Effect integration
 */

import { Context, Effect, Layer, pipe } from "effect";
import { FileSystem, Path } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { type McpTool, type ServerStatus, type ServerInfo, McpError, ServerError } from "./types.js";

// ============================================================================
// Service Interface
// ============================================================================

export interface McpFs {
	getBasePath(): Effect.Effect<string, never, Path.Path>;
	listServers(): Effect.Effect<string[], McpError>;
	readStatus(server: string): Effect.Effect<ServerStatus | null, McpError>;
	writeStatus(server: string, status: ServerStatus): Effect.Effect<void, McpError>;
	writeToolMd(server: string, tool: McpTool): Effect.Effect<void, McpError>;
	clearTools(server: string): Effect.Effect<void, McpError>;
	writeReadme(server: string, serverInfo: ServerInfo): Effect.Effect<void, McpError>;
	writeInvokeScript(server: string): Effect.Effect<void, McpError>;
	removeServerCache(server: string): Effect.Effect<void, McpError>;
	ensureServerDir(server: string): Effect.Effect<void, McpError>;
	// Disable list management
	getDisabledServers(): Effect.Effect<string[], McpError>;
	disableServer(server: string): Effect.Effect<void, McpError>;
	enableServer(server: string): Effect.Effect<void, McpError>;
	isDisabled(server: string): Effect.Effect<boolean, McpError>;
	// Remove from pi config (only works for ~/.pi/agent/mcp.json)
	removeFromPiConfig(server: string): Effect.Effect<void, McpError>;
}

export const McpFs = Context.GenericTag<McpFs>("McpFs");

// ============================================================================
// Helpers
// ============================================================================

const getBasePath = Effect.gen(function* () {
	const path = yield* Path.Path;
	const home = yield* Effect.sync(() => process.env.HOME || process.env.USERPROFILE || "~");
	return path.join(home, ".pi", "agent", "mcp", "servers");
});

const serverPath = (base: string, server: string, path: Path.Path) => path.join(base, server);
const statusPath = (base: string, server: string, path: Path.Path) => path.join(base, server, "_status.json");
const toolsPath = (base: string, server: string, path: Path.Path) => path.join(base, server, "tools");
const toolPath = (base: string, server: string, tool: string, path: Path.Path) =>
	path.join(base, server, "tools", `${tool}.md`);
const readmePath = (base: string, server: string, path: Path.Path) => path.join(base, server, "README.md");
const invokePath = (base: string, server: string, path: Path.Path) => path.join(base, server, "_invoke");
const disabledPath = (base: string, path: Path.Path) => path.join(base, "..", "disabled.json"); // ~/.pi/agent/mcp/disabled.json

const formatToolMd = (tool: McpTool): string => {
	let md = `# ${tool.name}\n\n`;
	md += `${tool.description}\n\n`;

	const schema = tool.inputSchema as {
		properties?: Record<string, { type?: string; description?: string }>;
		required?: string[];
	};

	if (schema.properties && Object.keys(schema.properties).length > 0) {
		md += `## Parameters\n\n`;
		md += `| Name | Type | Required | Description |\n`;
		md += `|------|------|----------|-------------|\n`;

		for (const [name, prop] of Object.entries(schema.properties)) {
			const isRequired = schema.required?.includes(name) ? "yes" : "no";
			const type = prop.type || "unknown";
			const desc = prop.description || "";
			md += `| ${name} | ${type} | ${isRequired} | ${desc} |\n`;
		}
		md += `\n`;
	}

	md += `## Invocation\n\n`;
	md += "```bash\n";
	md += `mcp_call server=<server> tool=${tool.name} args='{}'\n`;
	md += "```\n";

	return md;
};

// ============================================================================
// Service Implementation
// ============================================================================

const McpFsLiveImpl = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const basePath = yield* getBasePath;

	return McpFs.of({
		getBasePath: () => Effect.succeed(basePath),

		listServers: () =>
			pipe(
				fs.readDirectory(basePath),
				Effect.flatMap((entries) =>
					Effect.filter(entries, (entry) =>
						pipe(
							fs.stat(path.join(basePath, entry)),
							Effect.map((stat) => stat.type === "Directory"),
							Effect.catchAll(() => Effect.succeed(false))
						)
					)
				),
				Effect.catchTag("SystemError", (err) => {
					if (err.reason === "NotFound") {
						return Effect.succeed([]);
					}
					return Effect.fail(ServerError("filesystem", `Failed to list servers: ${err.message}`));
				}),
				Effect.mapError((err) =>
					err instanceof McpError ? err : ServerError("filesystem", `Failed to list servers: ${err}`)
				)
			),

		readStatus: (server: string) =>
			pipe(
				fs.readFileString(statusPath(basePath, server, path)),
				Effect.map((content) => JSON.parse(content) as ServerStatus),
				Effect.catchTag("SystemError", (err) => {
					if (err.reason === "NotFound") {
						return Effect.succeed(null);
					}
					return Effect.fail(ServerError(server, `Failed to read status: ${err.message}`));
				}),
				Effect.mapError((err) =>
					err instanceof McpError ? err : ServerError(server, `Failed to read status: ${err}`)
				)
			),

		writeStatus: (server: string, status: ServerStatus) =>
			pipe(
				Effect.gen(function* () {
					const dir = serverPath(basePath, server, path);
					const statusFile = statusPath(basePath, server, path);

					yield* fs.makeDirectory(dir, { recursive: true });
					yield* fs.writeFileString(statusFile, JSON.stringify(status, null, 2));
				}),
				Effect.mapError((err) => ServerError(server, `Failed to write status: ${err}`))
			),

		writeToolMd: (server: string, tool: McpTool) =>
			pipe(
				Effect.gen(function* () {
					const dir = toolsPath(basePath, server, path);
					const file = toolPath(basePath, server, tool.name, path);

					yield* fs.makeDirectory(dir, { recursive: true });
					yield* fs.writeFileString(file, formatToolMd(tool));
				}),
				Effect.mapError((err) => ServerError(server, `Failed to write tool ${tool.name}: ${err}`))
			),

		clearTools: (server: string) =>
			pipe(
				fs.remove(toolsPath(basePath, server, path), { recursive: true }),
				Effect.catchTag("SystemError", (err) => {
					if (err.reason === "NotFound") {
						return Effect.void;
					}
					return Effect.fail(ServerError(server, `Failed to clear tools: ${err.message}`));
				}),
				Effect.mapError((err) =>
					err instanceof McpError ? err : ServerError(server, `Failed to clear tools: ${err}`)
				)
			),

		writeReadme: (server: string, serverInfo: ServerInfo) =>
			pipe(
				Effect.gen(function* () {
					const dir = serverPath(basePath, server, path);
					const file = readmePath(basePath, server, path);

					yield* fs.makeDirectory(dir, { recursive: true });

					const content =
						`# ${serverInfo.name}\n\nVersion: ${serverInfo.version}\n\n` +
						`This server is managed by pi-mcp. Use \`/mcp sync ${server}\` to refresh tools.\n\n` +
						`## Tools\n\nSee the \`tools/\` directory for available tools.\n`;

					yield* fs.writeFileString(file, content);
				}),
				Effect.mapError((err) => ServerError(server, `Failed to write README: ${err}`))
			),

		writeInvokeScript: (server: string) =>
			pipe(
				Effect.gen(function* () {
					const dir = serverPath(basePath, server, path);
					const file = invokePath(basePath, server, path);

					yield* fs.makeDirectory(dir, { recursive: true });

					const content = `#!/bin/bash\nexec mcpc call ${server} "$@"\n`;
					yield* fs.writeFileString(file, content);
					yield* fs.chmod(file, 0o755);
				}),
				Effect.mapError((err) => ServerError(server, `Failed to write invoke script: ${err}`))
			),

		removeServerCache: (server: string) =>
			pipe(
				fs.remove(serverPath(basePath, server, path), { recursive: true }),
				Effect.catchTag("SystemError", (err) => {
					if (err.reason === "NotFound") {
						return Effect.void;
					}
					return Effect.fail(ServerError(server, `Failed to remove server: ${err.message}`));
				}),
				Effect.mapError((err) =>
					err instanceof McpError ? err : ServerError(server, `Failed to remove server: ${err}`)
				)
			),

		ensureServerDir: (server: string) =>
			pipe(
				Effect.gen(function* () {
					yield* fs.makeDirectory(serverPath(basePath, server, path), { recursive: true });
					yield* fs.makeDirectory(toolsPath(basePath, server, path), { recursive: true });
				}),
				Effect.mapError((err) => ServerError(server, `Failed to create server directory: ${err}`))
			),

		getDisabledServers: () =>
			pipe(
				fs.readFileString(disabledPath(basePath, path)),
				Effect.map((content) => JSON.parse(content) as string[]),
				Effect.catchTag("SystemError", (err) => {
					if (err.reason === "NotFound") {
						return Effect.succeed([]);
					}
					return Effect.fail(ServerError("disabled", `Failed to read disabled list: ${err.message}`));
				}),
				Effect.catchAll((err) =>
					err instanceof McpError ? Effect.fail(err) : Effect.succeed([])
				)
			),

		disableServer: (server: string) =>
			pipe(
				Effect.gen(function* () {
					const file = disabledPath(basePath, path);
					const current = yield* pipe(
						fs.readFileString(file),
						Effect.map((content) => JSON.parse(content) as string[]),
						Effect.catchAll(() => Effect.succeed([] as string[]))
					);
					if (!current.includes(server)) {
						current.push(server);
						yield* fs.writeFileString(file, JSON.stringify(current, null, 2));
					}
				}),
				Effect.mapError((err) => ServerError(server, `Failed to disable server: ${err}`))
			),

		enableServer: (server: string) =>
			pipe(
				Effect.gen(function* () {
					const file = disabledPath(basePath, path);
					const current = yield* pipe(
						fs.readFileString(file),
						Effect.map((content) => JSON.parse(content) as string[]),
						Effect.catchAll(() => Effect.succeed([] as string[]))
					);
					const updated = current.filter((s) => s !== server);
					yield* fs.writeFileString(file, JSON.stringify(updated, null, 2));
				}),
				Effect.mapError((err) => ServerError(server, `Failed to enable server: ${err}`))
			),

		isDisabled: (server: string) =>
			pipe(
				fs.readFileString(disabledPath(basePath, path)),
				Effect.map((content) => (JSON.parse(content) as string[]).includes(server)),
				Effect.catchAll(() => Effect.succeed(false))
			),

		removeFromPiConfig: (server: string) =>
			pipe(
				Effect.gen(function* () {
					const home = process.env.HOME || process.env.USERPROFILE || "~";
					const configPath = path.join(home, ".pi", "agent", "mcp.json");

					const content = yield* pipe(
						fs.readFileString(configPath),
						Effect.catchTag("SystemError", () =>
							Effect.fail(ServerError(server, "pi config file not found"))
						)
					);

					const config = JSON.parse(content) as { mcpServers: Record<string, unknown> };
					if (!config.mcpServers?.[server]) {
						return yield* Effect.fail(ServerError(server, "Server not found in pi config"));
					}

					delete config.mcpServers[server];
					yield* fs.writeFileString(configPath, JSON.stringify(config, null, "\t"));

					// Also remove the cache
					yield* pipe(
						fs.remove(serverPath(basePath, server, path), { recursive: true }),
						Effect.catchAll(() => Effect.void)
					);
				}),
				Effect.mapError((err) =>
					err instanceof McpError ? err : ServerError(server, `Failed to remove from pi config: ${err}`)
				)
			),
	});
});

// Layer that provides McpFs with Node implementations
export const McpFsLive = Layer.effect(McpFs, McpFsLiveImpl).pipe(
	Layer.provide(NodeFileSystem.layer),
	Layer.provide(NodePath.layer)
);
