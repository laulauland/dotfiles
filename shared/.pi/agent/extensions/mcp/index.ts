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

async function getServersFromCache(): Promise<CachedServer[]> {
	const result = await runEffect(
		Effect.gen(function* () {
			const mcpFs = yield* McpFs;
			const serverNames = yield* mcpFs.listServers();

			const servers: CachedServer[] = [];
			for (const name of serverNames) {
				const status = yield* mcpFs.readStatus(name);
				if (status) {
					servers.push({ name, status });
				}
			}
			return servers;
		})
	);

	return Either.isRight(result) ? result.right : [];
}

// ============================================================================
// Sync Logic
// ============================================================================

interface SyncResult {
	server: string;
	status: ServerStatus;
	toolsWritten: number;
}

async function syncServer(server: string): Promise<Either.Either<SyncResult, Error>> {
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
			};
			yield* mcpFs.writeStatus(server, status);
			yield* mcpFs.writeInvokeScript(server);

			return { server, status, toolsWritten: tools.length };
		})
	);

	return result as Either.Either<SyncResult, Error>;
}

async function syncAllServers(): Promise<SyncResult[]> {
	const result = await runEffect(
		Effect.gen(function* () {
			const mcpc = yield* McpcService;
			const servers = yield* mcpc.listServersWithStatus();
			return servers.map((s) => s.name);
		})
	);

	if (Either.isLeft(result)) return [];

	const results: SyncResult[] = [];
	for (const name of result.right) {
		const syncResult = await syncServer(name);
		if (Either.isRight(syncResult)) {
			results.push(syncResult.right);
		}
	}
	return results;
}

// ============================================================================
// Extension
// ============================================================================

export default function (pi: ExtensionAPI) {
	// -------------------------------------------------------------------------
	// Background sync on session start
	// -------------------------------------------------------------------------
	pi.on("session_start", async () => {
		// Sync in background, don't block startup, fail silently
		syncAllServers().catch(() => {});
	});

	// -------------------------------------------------------------------------
	// /mcp - Interactive server management
	// -------------------------------------------------------------------------
	pi.registerCommand("mcp", {
		description: "Manage MCP servers",
		handler: async (_args, ctx) => {
			const servers = await getServersFromCache();

			if (servers.length === 0) {
				ctx.ui.notify("No MCP servers cached. Add servers to ~/.cursor/mcp.json", "info");
				return;
			}

			// Build server list items
			const items: SelectItem[] = servers.map((s) => {
				const icon = statusIcon(s.status.state);
				const tools = s.status.tool_count > 0 ? ` (${s.status.tool_count} tools)` : "";
				return {
					value: s.name,
					label: `${icon} ${s.name}${tools}`,
					description: s.status.state === "auth_required" ? "needs authentication" : s.status.message || undefined,
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

			// Build action items based on server state
			const actionItems: SelectItem[] = [
				{ value: "sync", label: "~ Sync tools", description: "Fetch latest tool schemas" },
			];

			if (server.status.state === "auth_required") {
				actionItems.push({ value: "auth", label: "* Authenticate", description: "Start OAuth flow" });
			} else if (server.status.state === "ready") {
				actionItems.push({ value: "reauth", label: "* Re-authenticate", description: "Reset and re-authenticate" });
			}

			actionItems.push({ value: "remove", label: "x Remove cache", description: "Remove cached tools" });

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
				case "sync": {
					ctx.ui.notify(`Syncing ${selectedServer}...`, "info");
					const result = await syncServer(selectedServer);
					if (Either.isLeft(result)) {
						ctx.ui.notify(`Error: ${result.left.message}`, "error");
					} else {
						const r = result.right;
						const icon = statusIcon(r.status.state);
						const tools = r.toolsWritten > 0 ? `, ${r.toolsWritten} tools` : "";
						ctx.ui.notify(`${icon} ${r.server} (${r.status.state}${tools})`, "info");
					}
					break;
				}

				case "auth":
				case "reauth": {
					// OAuth requires browser interaction - show instructions
					const cmd = `mcpc -c ~/.cursor/mcp.json ${selectedServer} login`;
					ctx.ui.notify(`Run in terminal:\n  ${cmd}\n\nThen use Sync to fetch tools.`, "info");
					// Copy to clipboard if possible
					try {
						const { exec } = await import("child_process");
						exec(`echo "${cmd}" | xclip -selection clipboard 2>/dev/null || echo "${cmd}" | pbcopy 2>/dev/null`);
					} catch {}
					break;
				}

				case "remove": {
					const confirm = await ctx.ui.confirm("Remove cache?", `Remove cached tools for ${selectedServer}?`);
					if (!confirm) return;

					const removeResult = await runEffect(
						Effect.gen(function* () {
							const mcpFs = yield* McpFs;
							yield* mcpFs.removeServer(selectedServer);
						})
					);
					if (Either.isLeft(removeResult)) {
						ctx.ui.notify(`Error: ${removeResult.left.message}`, "error");
					} else {
						ctx.ui.notify(`Removed cache for ${selectedServer}`, "success");
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
