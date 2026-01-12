/**
 * Orchestrator Mode Extension
 *
 * Transforms the main agent into a coordinator that routes work to subagents
 * and spawns background agent sessions in detached tmux windows.
 *
 * Features:
 * - /orc-mode command to toggle orchestrator mode
 * - In orc mode: blocks Edit/Write, agent becomes coordinator
 * - Prompts LLM to decide routing (implement, research, explore, orchestrate)
 * - orc_spawn tool spawns agents in background tmux windows
 * - Returns immediately so orchestrator can continue work
 * - Shows orange status + widget when active
 * - Subagent-like observability for spawned sessions (window name, status tracking)
 *
 * Usage:
 * 1. Use /orc-mode to toggle orchestrator mode on/off
 * 2. Or start with --orc flag
 * 3. Use orc_spawn tool to spawn background agents
 */

import { spawn } from "node:child_process";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@mariozechner/pi-tui";


// Read-only tools for orchestrator mode (planning, coordination, VCS)
const ORC_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "orc_spawn"];

// Full set of tools for normal mode
const NORMAL_MODE_TOOLS = ["read", "bash", "edit", "write", "subagent"];

// Tmux window name for all orc agents
const ORC_WINDOW_NAME = "orc-agents";

// Track spawned agent sessions
interface SpawnedAgent {
    id: string;
    agent: string;
    topic: string;
    task: string;
    windowName: string;
    startedAt: number;
    status: "running" | "done" | "unknown";
}

export default function orcModeExtension(pi: ExtensionAPI) {
	let orcModeEnabled = false;
	let orcWindowCreated = false;
	let spawnedAgents: SpawnedAgent[] = [];

	// Register --orc CLI flag
	pi.registerFlag("orc", {
		description: "Start in orchestrator mode (coordinator-only)",
		type: "boolean",
		default: false,
	});

	// Helper to update status displays
	function updateStatus(ctx: ExtensionContext) {
		if (orcModeEnabled) {
			// Orange/warning color for orchestrator mode - prominent indicator
			ctx.ui.setStatus("orc-mode", ctx.ui.theme.fg("warning", "🎭 ORCHESTRATOR"));

			// Show widget with mode info
			const theme = ctx.ui.theme;
			const lines: string[] = [];
			lines.push(theme.fg("warning", "🎭 orc-mode active"));

			if (spawnedAgents.length > 0) {
				lines.push(theme.fg("muted", `spawned agents (${ORC_WINDOW_NAME}):`));
				for (const agent of spawnedAgents) {
					const elapsed = Math.round((Date.now() - agent.startedAt) / 1000);
					const statusIcon = agent.status === "running" ? "⏳" : agent.status === "done" ? "✓" : "?";
					lines.push(theme.fg("accent", `  ${statusIcon} ${agent.agent}:${agent.topic} (${elapsed}s)`));
				}
			}

			ctx.ui.setWidget("orc-mode", lines);
		} else {
			ctx.ui.setStatus("orc-mode", undefined);
			ctx.ui.setWidget("orc-mode", undefined);
		}
	}

	function toggleOrcMode(ctx: ExtensionContext) {
		orcModeEnabled = !orcModeEnabled;

		if (orcModeEnabled) {
			pi.setActiveTools(ORC_MODE_TOOLS);
			ctx.ui.notify(
				`Orchestrator mode enabled. You are now a coordinator.\nBlocked: edit, write\nAllowed: planning, jj, orc_spawn`,
			);
			// Inject context for next turn
			pi.sendMessage({
				customType: "orc-mode-toggle",
				content: "[ORCHESTRATOR MODE ENABLED] You are now a coordinator. Use orc_spawn to delegate work.",
				display: false,
			}, { triggerTurn: false, deliverAs: "nextTurn" });
		} else {
			pi.setActiveTools(NORMAL_MODE_TOOLS);
			ctx.ui.notify("Orchestrator mode disabled. Full access restored.");
			// Inject context for next turn
			pi.sendMessage({
				customType: "orc-mode-toggle",
				content: "[ORCHESTRATOR MODE DISABLED] You now have full access to all tools (edit, write, subagent). Work directly.",
				display: false,
			}, { triggerTurn: false, deliverAs: "nextTurn" });
		}
		updateStatus(ctx);
	}

	// Register /orc-mode command
	pi.registerCommand("orc-mode", {
		description: "Toggle orchestrator mode (coordinator-only, routes work to subagents)",
		handler: async (_args, ctx) => {
			toggleOrcMode(ctx);
		},
	});

	// Register command for managing spawned agents
	pi.registerCommand("orcs", {
		description: "Manage spawned agents",
		handler: async (_args, ctx) => {
			if (spawnedAgents.length === 0) {
				ctx.ui.notify("No spawned agents", "warning");
				return;
			}

			// Build select items from spawned agents
			const items: SelectItem[] = spawnedAgents.map((agent) => {
				const elapsed = Math.round((Date.now() - agent.startedAt) / 1000);
				const statusIcon = agent.status === "running" ? "⏳" : agent.status === "done" ? "✓" : "?";
				const truncatedTask =
					agent.task.length > 50 ? `${agent.task.slice(0, 47)}...` : agent.task;

				return {
					value: agent.id,
					label: `${statusIcon} ${agent.agent}:${agent.topic}`,
					description: `${truncatedTask} (${elapsed}s)`,
				};
			});

			// Show selector UI
			const result = await ctx.ui.custom<{ action: string; id: string } | null>(
				(tui, theme, _kb, done) => {
					const container = new Container();

					// Top border in warning color
					container.addChild(new DynamicBorder((s: string) => theme.fg("warning", s)));

					// Title
					container.addChild(new Text(theme.fg("warning", theme.bold("Manage Spawned Agents")), 1, 0));

					// SelectList with theme
					const selectList = new SelectList(items, Math.min(items.length, 10), {
						selectedPrefix: (t) => theme.fg("warning", t),
						selectedText: (t) => theme.fg("warning", t),
						description: (t) => theme.fg("muted", t),
						scrollInfo: (t) => theme.fg("dim", t),
						noMatch: (t) => theme.fg("warning", t),
					});

					selectList.onSelect = (item) => done({ action: "enter", id: item.value });
					selectList.onCancel = () => done(null);

					container.addChild(selectList);

					// Help text
					container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter: go to pane • k: kill • esc: cancel"), 1, 0));

					// Bottom border in warning color
					container.addChild(new DynamicBorder((s: string) => theme.fg("warning", s)));

					return {
						render: (w) => container.render(w),
						invalidate: () => container.invalidate(),
						handleInput: (data) => {
							// Intercept 'k' key for kill action
							if (data === "k") {
								const selectedItem = selectList.getSelectedItem();
								if (selectedItem) {
									done({ action: "kill", id: selectedItem.value });
								}
								return;
							}
							selectList.handleInput(data);
							tui.requestRender();
						},
					};
				},
			);

			if (!result) {
				return; // User cancelled with escape
			}

			const agentIndex = spawnedAgents.findIndex((a) => a.id === result.id);
			if (agentIndex === -1) {
				return; // Agent no longer exists
			}

			if (result.action === "enter") {
				// Switch to the orc-agents window
				spawn("tmux", ["select-window", "-t", ORC_WINDOW_NAME], {
					stdio: "ignore",
					detached: true,
				}).unref();
				ctx.ui.notify("Switched to orc-agents window", "info");
			} else if (result.action === "kill") {
				// Send Ctrl+C to stop the agent
				spawn("tmux", ["send-keys", "-t", ORC_WINDOW_NAME, "C-c"], {
					stdio: "ignore",
					detached: true,
				}).unref();
				// Remove from spawned agents
				spawnedAgents.splice(agentIndex, 1);
				updateStatus(ctx);
				ctx.ui.notify("Agent killed", "info");
			}
		},
	});

	// Register orc_spawn tool
	pi.registerTool({
        name: "orc_spawn",
        label: "Spawn Agent",
        description: "Spawn a subagent in a background tmux window. Returns immediately - check window for progress. Use for: implementation, research, exploration, investigation tasks.",
        parameters: Type.Object({
            agent: Type.String({ description: "Agent name: implementer, librarian, explorer, or custom" }),
            task: Type.String({ description: "Task description for the agent" }),
            topic: Type.Optional(Type.String({ description: "Short topic name for the tmux window (default: agent name)" })),
        }),

        async execute(toolCallId, params, onUpdate, ctx, signal) {
            const topic = params.topic || params.agent;
            const paneId = `${params.agent}-${topic}-${Date.now() % 10000}`;

            // Build the prompt for the subagent - pass directly to pi without bash -c
            // Interactive mode (no -p) keeps window open
            const prompt = `Use subagent with agent=${params.agent}: ${params.task}`;

            if (!orcWindowCreated) {
                // First agent: create the window
                spawn("tmux", [
                    "new-window", "-d",
                    "-n", ORC_WINDOW_NAME,
                    "-c", ctx.cwd,
                    "pi", "--no-session", prompt
                ], { stdio: "ignore", detached: true }).unref();
                orcWindowCreated = true;
            } else {
                // Subsequent agents: split the existing window into a new pane
                spawn("tmux", [
                    "split-window", "-d",
                    "-t", ORC_WINDOW_NAME,
                    "-c", ctx.cwd,
                    "pi", "--no-session", prompt
                ], { stdio: "ignore", detached: true }).unref();

                // Rebalance panes evenly
                spawn("tmux", [
                    "select-layout", "-t", ORC_WINDOW_NAME, "tiled"
                ], { stdio: "ignore", detached: true }).unref();
            }

            // Track the spawned agent
            const session: SpawnedAgent = {
                id: paneId,
                agent: params.agent,
                topic,
                task: params.task,
                windowName: ORC_WINDOW_NAME,
                startedAt: Date.now(),
                status: "running"
            };
            spawnedAgents.push(session);
            updateStatus(ctx);

            return {
                content: [{
                    type: "text",
                    text: `Spawned ${params.agent} in tmux pane (window: ${ORC_WINDOW_NAME})\nTask: ${params.task}\n\nSwitch to agents window: Ctrl+B w → select "${ORC_WINDOW_NAME}"`
                }],
                details: { session }
            };
        }
    });

	// Block destructive tools in orc mode
	pi.on("tool_call", async (event) => {
		if (!orcModeEnabled) return;

		const blocked = ["edit", "write"];
		if (blocked.includes(event.toolName.toLowerCase())) {
			return {
				block: true,
				reason: `Orchestrator mode: "${event.toolName}" blocked.\n\nTo implement changes:\n1. Delegate to subagent: use the subagent tool with agent="implementer"\n2. Or disable orc-mode: /orc-mode\n\nYou should coordinate and delegate, not implement directly.`,
			};
		}

		// Also block destructive bash commands
		if (event.toolName === "bash") {
			const command = (event.input.command as string) || "";
			const destructivePatterns = [
				/\brm\b/i,
				/\brmdir\b/i,
				/\bmv\b/i,
				/\bcp\b/i,
				/\bmkdir\b/i,
				/[^<]>(?!>)/,
				/>>/,
			];

			// Allow jj/git commands
			const isVcs = /^\s*(jj|git)\b/.test(command);
			if (!isVcs && destructivePatterns.some((p) => p.test(command))) {
				return {
					block: true,
					reason: `Orchestrator mode: destructive bash command blocked.\nCommand: ${command}\n\nDelegate file operations to subagent, or disable orc-mode.`,
				};
			}
		}
	});

	// Inject orchestrator context before each prompt
	pi.on("before_agent_start", async () => {
		if (!orcModeEnabled) return;

		const spawnedAgentsList =
			spawnedAgents.length > 0
				? `\nActive spawned agents: ${spawnedAgents.map((a) => `${a.agent}:${a.topic}`).join(", ")}`
				: "";

		return {
			message: {
				customType: "orc-mode-context",
				content: `[ORCHESTRATOR MODE ACTIVE]
You are operating as an orchestrator/coordinator. Your role is to plan, delegate, and synthesize - NOT to implement directly.

ROUTING DECISIONS - For each user request, decide:

1. **IMPLEMENT** → Delegate to subagent
   - Code changes, file modifications, implementations
   - Use: subagent tool with agent="implementer" (or appropriate agent)

2. **RESEARCH** → Delegate to subagent
   - Need context, documentation, API research
   - Use: subagent tool with agent="librarian"

3. **EXPLORE** → Delegate to subagent
   - Find files, understand codebase structure
   - Use: subagent tool with agent="explorer"

4. **INVESTIGATE/IMPLEMENT/RESEARCH** → Use orc_spawn tool
   - Spawns agent in background tmux window
   - Returns immediately so you can continue orchestrating
   - Use: orc_spawn tool with agent="implementer|librarian|explorer" and task="..."

5. **ORCHESTRATE** → Handle in main flow
   - Planning, architecture decisions
   - jj/git operations (commits, workspaces, bookmarks)
   - Coordinating multiple subagents
   - Synthesizing results
   - Quick questions

BLOCKED: edit, write tools (delegate these to implementer subagent)
ALLOWED: read, bash (read-only + jj/git), grep, find, ls, orc_spawn
${spawnedAgentsList}

When responding, first state your routing decision, then execute it.`,
				display: false,
			},
		};
	});

	// Initialize state on session start
	pi.on("session_start", async (_event, ctx) => {
		// Reset for new session
		orcWindowCreated = false;

		// Check CLI flag
		if (pi.getFlag("orc") === true) {
			orcModeEnabled = true;
		}

		// Restore state from session
		const entries = ctx.sessionManager.getEntries();
		const stateEntry = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "orc-mode-state")
			.pop() as { data?: { enabled: boolean; spawnedAgents?: SpawnedAgent[] } } | undefined;

		if (stateEntry?.data) {
			if (stateEntry.data.enabled !== undefined) {
				orcModeEnabled = stateEntry.data.enabled;
			}
			if (stateEntry.data.spawnedAgents) {
				spawnedAgents = stateEntry.data.spawnedAgents;
			}
		}

		if (orcModeEnabled) {
			pi.setActiveTools(ORC_MODE_TOOLS);
		}
		updateStatus(ctx);
	});

	// Persist state
	pi.on("turn_start", async () => {
		pi.appendEntry("orc-mode-state", {
			enabled: orcModeEnabled,
			spawnedAgents,
		});
	});

}
