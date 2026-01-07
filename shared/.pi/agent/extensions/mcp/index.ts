/**
 * pi-mcp: MCP integration extension for pi
 *
 * Zero MCP schemas in system prompt - agent discovers tools via filesystem.
 * Uses mcpc CLI for transport, OAuth, token refresh.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Effect, Layer, ManagedRuntime, Either } from "effect";
import { Container, type SelectItem, SelectList, Text } from "@mariozechner/pi-tui";
import { McpcService, McpcServiceLive, type ServerWithStatus } from "./mcpc.js";
import { McpFs, McpFsLive } from "./filesystem.js";
import type { ServerStatus } from "./types.js";

// ============================================================================
// Effect Runtime
// ============================================================================

const MainLive = Layer.mergeAll(McpcServiceLive, McpFsLive);
const runtime = ManagedRuntime.make(MainLive);

const runEffect = <A, E>(effect: Effect.Effect<A, E, McpcService | McpFs>): Promise<Either.Either<A, E>> =>
	runtime.runPromise(Effect.either(effect));

// ============================================================================
// Helpers
// ============================================================================

const statusIcon = (state: ServerStatus["state"]): string => {
	switch (state) {
		case "ready":
			return "\x1b[32m+\x1b[0m"; // green +
		case "auth_required":
			return "\x1b[33m!\x1b[0m"; // yellow !
		case "error":
			return "\x1b[31mx\x1b[0m"; // red x
		case "offline":
			return "\x1b[90m-\x1b[0m"; // dim -
	}
};

// ============================================================================
// Cached Server List (fast, from filesystem)
// ============================================================================

interface CachedServer {
	name: string;
	status: ServerStatus;
}

interface CacheResult {
	servers: CachedServer[];
	error: string | null;
}

async function getServersFromCache(): Promise<CacheResult> {
	const result = await runEffect(
		Effect.gen(function* () {
			const mcpFs = yield* McpFs;
			const serverNames = yield* mcpFs.listServers();
			const disabledList = yield* mcpFs.getDisabledServers();

			const servers: CachedServer[] = [];
			for (const name of serverNames) {
				const status = yield* mcpFs.readStatus(name);
				if (status) {
					// Mark as disabled if in disabled list
					servers.push({
						name,
						status: { ...status, disabled: disabledList.includes(name) },
					});
				}
			}
			return servers;
		})
	);

	if (Either.isLeft(result)) {
		return { servers: [], error: result.left.message };
	}

	return { servers: result.right, error: null };
}

// ============================================================================
// Sync Logic
// ============================================================================

interface SyncResult {
	server: string;
	status: ServerStatus;
	toolsWritten: number;
}

async function syncServer(server: string, source?: string): Promise<Either.Either<SyncResult, Error>> {
	const result = await runEffect(
		Effect.gen(function* () {
			const mcpc = yield* McpcService;
			const mcpFs = yield* McpFs;

			// Try to list tools
			const toolsResult = yield* Effect.either(mcpc.listTools(server));

			if (Either.isLeft(toolsResult)) {
				const error = toolsResult.left;
				const status: ServerStatus = {
					state: error.code === "auth_required" ? "auth_required" : "error",
					checked_at: new Date().toISOString(),
					message: error.message,
					auth_command: error.auth_command || "",
					tool_count: 0,
					server_info: null,
					source,
				};
				yield* mcpFs.writeStatus(server, status);
				return { server, status, toolsWritten: 0 };
			}

			const tools = toolsResult.right;

			// Ensure directory and clear old tools
			yield* mcpFs.ensureServerDir(server);
			yield* mcpFs.clearTools(server);

			// Write each tool
			for (const tool of tools) {
				yield* mcpFs.writeToolMd(server, tool);
			}

			// Write status
			const status: ServerStatus = {
				state: "ready",
				checked_at: new Date().toISOString(),
				message: null,
				auth_command: "",
				tool_count: tools.length,
				server_info: null,
				source,
			};
			yield* mcpFs.writeStatus(server, status);
			yield* mcpFs.writeInvokeScript(server);

			return { server, status, toolsWritten: tools.length };
		})
	);

	return result as Either.Either<SyncResult, Error>;
}

interface SyncAllResult {
	results: SyncResult[];
	errors: string[];
	mcpcMissing: boolean;
}

async function syncAllServers(): Promise<SyncAllResult> {
	// First check if mcpc is available
	const mcpcCheck = await runEffect(
		Effect.gen(function* () {
			const mcpc = yield* McpcService;
			return yield* mcpc.isMcpcAvailable();
		})
	);

	if (Either.isRight(mcpcCheck) && !mcpcCheck.right) {
		return { results: [], errors: [], mcpcMissing: true };
	}

	const serversResult = await runEffect(
		Effect.gen(function* () {
			const mcpc = yield* McpcService;
			return yield* mcpc.listServersWithStatus();
		})
	);

	if (Either.isLeft(serversResult)) {
		return { results: [], errors: [serversResult.left.message], mcpcMissing: false };
	}

	const results: SyncResult[] = [];
	const errors: string[] = [];

	for (const server of serversResult.right) {
		const syncResult = await syncServer(server.name, server.source.label);
		if (Either.isRight(syncResult)) {
			results.push(syncResult.right);
		} else {
			errors.push(`${server.name}: ${syncResult.left.message}`);
		}
	}

	return { results, errors, mcpcMissing: false };
}

// ============================================================================
// Extension
// ============================================================================

export default function (pi: ExtensionAPI) {
	// Track available servers for system prompt
	let availableServers: CachedServer[] = [];

	// -------------------------------------------------------------------------
	// Background sync on session start
	// -------------------------------------------------------------------------
	pi.on("session_start", async (_event, ctx) => {
		// Sync in background, don't block startup
		syncAllServers()
			.then(async (result) => {
				if (result.mcpcMissing) {
					ctx.ui.notify("MCP: mcpc CLI not found. Install with: npm i -g @anthropic-ai/mcpc", "error");
				} else if (result.errors.length > 0) {
					ctx.ui.notify(`MCP sync errors:\n${result.errors.join("\n")}`, "error");
				}
				// Update cached servers after sync
				const cacheResult = await getServersFromCache();
				if (!cacheResult.error) {
					availableServers = cacheResult.servers.filter(s => !s.status.disabled && s.status.state === "ready");
				}
			})
			.catch((err) => {
				ctx.ui.notify(`MCP sync failed: ${err.message}`, "error");
			});

		// Also load from cache immediately (may have stale but usable data)
		const cacheResult = await getServersFromCache();
		if (!cacheResult.error) {
			availableServers = cacheResult.servers.filter(s => !s.status.disabled && s.status.state === "ready");
		}
	});

	// -------------------------------------------------------------------------
	// Append MCP instructions to system prompt
	// -------------------------------------------------------------------------
	pi.on("before_agent_start", async () => {
		if (availableServers.length === 0) {
			return;
		}

		const serverList = availableServers
			.map(s => `- ${s.name} (${s.status.tool_count} tools)`)
			.join("\n");

		return {
			systemPromptAppend: `
## MCP Servers

The following MCP servers are available via the mcp_call tool:

${serverList}

To discover available tools, use: ls ~/.pi/agent/mcp/servers/
Each server directory contains .md files describing its tools.
`,
		};
	});

	// -------------------------------------------------------------------------
	// /mcp - Interactive server management
	// -------------------------------------------------------------------------
	pi.registerCommand("mcp", {
		description: "Manage MCP servers",
		handler: async (_args, ctx) => {
			// Check if mcpc CLI is available
			const mcpcCheck = await runEffect(
				Effect.gen(function* () {
					const mcpc = yield* McpcService;
					return yield* mcpc.isMcpcAvailable();
				})
			);

			if (Either.isRight(mcpcCheck) && !mcpcCheck.right) {
				ctx.ui.notify(
					"mcpc CLI not found. Install it with:\n" +
						"  npm install -g @anthropic-ai/mcpc\n" +
						"or check https://github.com/anthropics/anthropic-quickstarts for alternatives",
					"error"
				);
				return;
			}

			const cacheResult = await getServersFromCache();

			if (cacheResult.error) {
				ctx.ui.notify(`MCP cache error: ${cacheResult.error}`, "error");
				return;
			}

			if (cacheResult.servers.length === 0) {
				ctx.ui.notify(
					"No MCP servers cached. Add servers to:\n" +
						"  • ~/.pi/agent/mcp.json (pi - recommended)\n" +
						"  • ~/.cursor/mcp.json (Cursor)\n" +
						"  • Claude Desktop config\n" +
						"  • ~/.claude.json (Claude Code - current project)",
					"info"
				);
				return;
			}

			const servers = cacheResult.servers;

			// Build server list items
			const items: SelectItem[] = servers.map((s) => {
				const isDisabled = s.status.disabled;
				const icon = isDisabled ? "\x1b[90m-\x1b[0m" : statusIcon(s.status.state); // dim - for disabled
				const tools = s.status.tool_count > 0 ? ` (${s.status.tool_count} tools)` : "";
				const stateMsg = isDisabled
					? "disabled"
					: s.status.state === "auth_required"
						? "needs auth"
						: s.status.state === "error"
							? "error"
							: "";
				const desc = [stateMsg, s.status.source].filter(Boolean).join(" • ");
				return {
					value: s.name,
					label: isDisabled ? `\x1b[90m${icon} ${s.name}${tools}\x1b[0m` : `${icon} ${s.name}${tools}`,
					description: desc || undefined,
				};
			});

			// Show server selector
			const selectedServer = await ctx.ui.custom<string | null>((tui, theme, done) => {
				const container = new Container();

				container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
				container.addChild(new Text(theme.fg("accent", theme.bold("MCP Servers")), 1, 0));

				const selectList = new SelectList(items, Math.min(items.length, 10), {
					selectedPrefix: (t) => theme.fg("accent", t),
					selectedText: (t) => theme.fg("accent", t),
					description: (t) => theme.fg("muted", t),
					scrollInfo: (t) => theme.fg("dim", t),
					noMatch: (t) => theme.fg("warning", t),
				});
				selectList.onSelect = (item) => done(item.value);
				selectList.onCancel = () => done(null);
				container.addChild(selectList);

				container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1, 0));
				container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

				return {
					render: (w) => container.render(w),
					invalidate: () => container.invalidate(),
					handleInput: (data) => {
						selectList.handleInput(data);
						tui.requestRender();
					},
				};
			});

			if (!selectedServer) return;

			// Find selected server's status
			const server = servers.find((s) => s.name === selectedServer);
			if (!server) return;

			// Check if server is disabled
			const disabledCheck = await runEffect(
				Effect.gen(function* () {
					const mcpFs = yield* McpFs;
					return yield* mcpFs.isDisabled(selectedServer);
				})
			);
			const isDisabled = Either.isRight(disabledCheck) && disabledCheck.right;

			// Build action items based on server state
			const actionItems: SelectItem[] = [];

			if (isDisabled) {
				actionItems.push({ value: "enable", label: "Enable", description: "Re-enable this server" });
			} else {
				if (server.status.state === "auth_required") {
					actionItems.push({ value: "auth", label: "Authenticate", description: "Opens browser for OAuth" });
				} else if (server.status.state === "ready") {
					actionItems.push({ value: "reauth", label: "Re-authenticate", description: "Reset credentials and re-authenticate" });
				} else if (server.status.state === "error") {
					actionItems.push({ value: "auth", label: "Authenticate", description: "Try authentication" });
				}
				actionItems.push({ value: "disable", label: "Disable", description: "Hide from agent (keeps config)" });
			}

			// Remove only available for pi config
			const isPiSource = server.status.source === "~/.pi/agent/mcp.json";
			if (isPiSource) {
				actionItems.push({ value: "remove", label: "Remove", description: "Delete from pi config" });
			}

			// Show action selector
			const action = await ctx.ui.custom<string | null>((tui, theme, done) => {
				const container = new Container();

				container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
				container.addChild(new Text(theme.fg("accent", theme.bold(`Actions for ${selectedServer}`)), 1, 0));

				const selectList = new SelectList(actionItems, Math.min(actionItems.length, 10), {
					selectedPrefix: (t) => theme.fg("accent", t),
					selectedText: (t) => theme.fg("accent", t),
					description: (t) => theme.fg("muted", t),
					scrollInfo: (t) => theme.fg("dim", t),
					noMatch: (t) => theme.fg("warning", t),
				});
				selectList.onSelect = (item) => done(item.value);
				selectList.onCancel = () => done(null);
				container.addChild(selectList);

				container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1, 0));
				container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

				return {
					render: (w) => container.render(w),
					invalidate: () => container.invalidate(),
					handleInput: (data) => {
						selectList.handleInput(data);
						tui.requestRender();
					},
				};
			});

			if (!action) return;

			// Execute action
			switch (action) {
				case "auth":
				case "reauth": {
					// Spawn mcpc login directly - it will open browser for OAuth
					ctx.ui.notify(`Authenticating ${selectedServer}...`, "info");

					const authResult = await runEffect(
						Effect.gen(function* () {
							const mcpc = yield* McpcService;
							yield* mcpc.auth(selectedServer);
						})
					);

					if (Either.isLeft(authResult)) {
						ctx.ui.notify(`Auth failed: ${authResult.left.message}`, "error");
						break;
					}

					// Auto-sync after successful auth
					ctx.ui.notify(`Auth successful, syncing tools...`, "info");
					const syncResult = await syncServer(selectedServer);
					if (Either.isLeft(syncResult)) {
						ctx.ui.notify(`Sync error: ${syncResult.left.message}`, "error");
					} else {
						const r = syncResult.right;
						const icon = statusIcon(r.status.state);
						const tools = r.toolsWritten > 0 ? ` (${r.toolsWritten} tools)` : "";
						ctx.ui.notify(`${icon} ${r.server}${tools}`, "success");
					}
					break;
				}

				case "disable": {
					const disableResult = await runEffect(
						Effect.gen(function* () {
							const mcpFs = yield* McpFs;
							yield* mcpFs.disableServer(selectedServer);
						})
					);
					if (Either.isLeft(disableResult)) {
						ctx.ui.notify(`Failed to disable: ${disableResult.left.message}`, "error");
					} else {
						ctx.ui.notify(`Disabled ${selectedServer}`, "success");
					}
					break;
				}

				case "enable": {
					const enableResult = await runEffect(
						Effect.gen(function* () {
							const mcpFs = yield* McpFs;
							yield* mcpFs.enableServer(selectedServer);
						})
					);
					if (Either.isLeft(enableResult)) {
						ctx.ui.notify(`Failed to enable: ${enableResult.left.message}`, "error");
					} else {
						ctx.ui.notify(`Enabled ${selectedServer}`, "success");
						// Re-sync after enabling
						await syncServer(selectedServer);
					}
					break;
				}

				case "remove": {
					const confirm = await ctx.ui.confirm(
						"Remove server?",
						`Remove ${selectedServer} from ~/.pi/agent/mcp.json?`
					);
					if (!confirm) break;

					const removeResult = await runEffect(
						Effect.gen(function* () {
							const mcpFs = yield* McpFs;
							yield* mcpFs.removeFromPiConfig(selectedServer);
						})
					);
					if (Either.isLeft(removeResult)) {
						ctx.ui.notify(`Failed to remove: ${removeResult.left.message}`, "error");
					} else {
						ctx.ui.notify(`Removed ${selectedServer}`, "success");
					}
					break;
				}
			}
		},
	});

	// -------------------------------------------------------------------------
	// mcp_call tool
	// -------------------------------------------------------------------------
	pi.registerTool({
		name: "mcp_call",
		label: "MCP Call",
		description:
			"Call an MCP server tool. First ls ~/.pi/agent/mcp/servers/ to discover available servers and tools.",
		parameters: Type.Object({
			server: Type.String({ description: "MCP server name" }),
			tool: Type.String({ description: "Tool name to invoke" }),
			args: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Tool arguments" })),
		}),

		async execute(toolCallId, params, onUpdate, ctx, signal) {
			const { server, tool, args = {} } = params;

			const result = await runEffect(
				Effect.gen(function* () {
					const mcpc = yield* McpcService;
					return yield* mcpc.callTool(server, tool, args);
				})
			);

			if (Either.isLeft(result)) {
				const error = result.left;
				if (error.code === "auth_required") {
					return {
						content: [
							{
								type: "text",
								text: `Authentication required for ${server}. User should run /mcp and authenticate.`,
							},
						],
						details: { error: true, code: error.code },
						isError: true,
					};
				}
				return {
					content: [{ type: "text", text: `Error: ${error.message}` }],
					details: { error: true, code: error.code },
					isError: true,
				};
			}

			// Format result
			const output = typeof result.right === "string" ? result.right : JSON.stringify(result.right, null, 2);

			return {
				content: [{ type: "text", text: output }],
				details: { server, tool, result: result.right },
			};
		},
	});
}
