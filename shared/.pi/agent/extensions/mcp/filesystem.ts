/**
 * McpFs Service - file operations for MCP server data
 */

import { Context, Effect, Layer } from "effect";
import { homedir } from "os";
import { join } from "path";
import { mkdir, readdir, readFile, writeFile, rm, rename } from "fs/promises";
import { type McpTool, type ServerStatus, type ServerInfo, McpError, ServerError } from "./types.js";

// ============================================================================
// Service Interface
// ============================================================================

export interface McpFs {
	getBasePath(): string;
	listServers(): Effect.Effect<string[], McpError>;
	readStatus(server: string): Effect.Effect<ServerStatus | null, McpError>;
	writeStatus(server: string, status: ServerStatus): Effect.Effect<void, McpError>;
	writeToolMd(server: string, tool: McpTool): Effect.Effect<void, McpError>;
	clearTools(server: string): Effect.Effect<void, McpError>;
	writeReadme(server: string, serverInfo: ServerInfo): Effect.Effect<void, McpError>;
	writeInvokeScript(server: string): Effect.Effect<void, McpError>;
	removeServer(server: string): Effect.Effect<void, McpError>;
	ensureServerDir(server: string): Effect.Effect<void, McpError>;
}

export const McpFs = Context.GenericTag<McpFs>("McpFs");

// ============================================================================
// Helpers
// ============================================================================

const BASE_PATH = join(homedir(), ".pi", "agent", "mcp", "servers");

const serverPath = (server: string) => join(BASE_PATH, server);
const statusPath = (server: string) => join(serverPath(server), "_status.json");
const toolsPath = (server: string) => join(serverPath(server), "tools");
const toolPath = (server: string, tool: string) => join(toolsPath(server), `${tool}.md`);
const readmePath = (server: string) => join(serverPath(server), "README.md");
const invokePath = (server: string) => join(serverPath(server), "_invoke");

const formatToolMd = (tool: McpTool): string => {
	let md = `# ${tool.name}\n\n`;
	md += `${tool.description}\n\n`;

	// Parse input schema for parameters table
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

export const McpFsLive = Layer.succeed(
	McpFs,
	McpFs.of({
		getBasePath: () => BASE_PATH,

		listServers: () =>
			Effect.tryPromise({
				try: async () => {
					try {
						const entries = await readdir(BASE_PATH, { withFileTypes: true });
						return entries.filter((e) => e.isDirectory()).map((e) => e.name);
					} catch (err: unknown) {
						if ((err as NodeJS.ErrnoException).code === "ENOENT") {
							return [];
						}
						throw err;
					}
				},
				catch: (err) => ServerError("filesystem", `Failed to list servers: ${err}`),
			}),

		readStatus: (server: string) =>
			Effect.tryPromise({
				try: async () => {
					try {
						const content = await readFile(statusPath(server), "utf8");
						return JSON.parse(content) as ServerStatus;
					} catch (err: unknown) {
						if ((err as NodeJS.ErrnoException).code === "ENOENT") {
							return null;
						}
						throw err;
					}
				},
				catch: (err) => ServerError(server, `Failed to read status: ${err}`),
			}),

		writeStatus: (server: string, status: ServerStatus) =>
			Effect.tryPromise({
				try: async () => {
					const path = statusPath(server);
					const tempPath = `${path}.tmp`;

					// Ensure directory exists
					await mkdir(serverPath(server), { recursive: true });

					// Atomic write
					await writeFile(tempPath, JSON.stringify(status, null, 2));
					await rename(tempPath, path);
				},
				catch: (err) => ServerError(server, `Failed to write status: ${err}`),
			}),

		writeToolMd: (server: string, tool: McpTool) =>
			Effect.tryPromise({
				try: async () => {
					const dir = toolsPath(server);
					await mkdir(dir, { recursive: true });
					await writeFile(toolPath(server, tool.name), formatToolMd(tool));
				},
				catch: (err) => ServerError(server, `Failed to write tool ${tool.name}: ${err}`),
			}),

		clearTools: (server: string) =>
			Effect.tryPromise({
				try: async () => {
					try {
						await rm(toolsPath(server), { recursive: true, force: true });
					} catch (err: unknown) {
						if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
							throw err;
						}
					}
				},
				catch: (err) => ServerError(server, `Failed to clear tools: ${err}`),
			}),

		writeReadme: (server: string, serverInfo: ServerInfo) =>
			Effect.tryPromise({
				try: async () => {
					await mkdir(serverPath(server), { recursive: true });

					const content = `# ${serverInfo.name}\n\nVersion: ${serverInfo.version}\n\n` +
						`This server is managed by pi-mcp. Use \`/mcp sync ${server}\` to refresh tools.\n\n` +
						`## Tools\n\nSee the \`tools/\` directory for available tools.\n`;

					await writeFile(readmePath(server), content);
				},
				catch: (err) => ServerError(server, `Failed to write README: ${err}`),
			}),

		writeInvokeScript: (server: string) =>
			Effect.tryPromise({
				try: async () => {
					await mkdir(serverPath(server), { recursive: true });

					const content = `#!/bin/bash\nexec mcporter call ${server}."$@"\n`;
					const path = invokePath(server);
					await writeFile(path, content, { mode: 0o755 });
				},
				catch: (err) => ServerError(server, `Failed to write invoke script: ${err}`),
			}),

		removeServer: (server: string) =>
			Effect.tryPromise({
				try: async () => {
					await rm(serverPath(server), { recursive: true, force: true });
				},
				catch: (err) => ServerError(server, `Failed to remove server: ${err}`),
			}),

		ensureServerDir: (server: string) =>
			Effect.tryPromise({
				try: async () => {
					await mkdir(serverPath(server), { recursive: true });
					await mkdir(toolsPath(server), { recursive: true });
				},
				catch: (err) => ServerError(server, `Failed to create server directory: ${err}`),
			}),
	})
);
