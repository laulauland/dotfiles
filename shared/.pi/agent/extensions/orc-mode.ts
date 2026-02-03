/**
 * Orchestrator Mode Extension
 *
 * A simple mode that transforms the main agent into an orchestrator.
 * When enabled, only the subagent tool is available and the system prompt
 * is updated to focus on coordination and delegation.
 *
 * Features:
 * - /orc command to toggle orchestrator mode
 * - In orc mode: only subagent tool available
 * - System prompt modified to focus on orchestration
 * - Orange status indicator when active
 *
 * Usage:
 * 1. Use /orc to toggle orchestrator mode on/off
 * 2. Or start with --orc flag
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

// Tools available in orchestrator mode - subagent for delegation, subagent_status for async monitoring
const ORC_MODE_TOOLS = ["subagent", "subagent_status"];

// Store the original tools to restore them when disabling orc mode
let savedTools: string[] | null = null;

export default function orcModeExtension(pi: ExtensionAPI) {
	let orcModeEnabled = false;

	// Register --orc CLI flag
	pi.registerFlag("orc", {
		description: "Start in orchestrator mode (coordinator-only)",
		type: "boolean",
		default: false,
	});

	// Helper to update status displays
	function updateStatus(ctx: ExtensionContext) {
		if (orcModeEnabled) {
			ctx.ui.setStatus("orc-mode", ctx.ui.theme.fg("warning", "🎭 ORC"));
			ctx.ui.setWidget("orc-mode", [
				ctx.ui.theme.fg("warning", "🎭 Orchestrator mode active"),
				ctx.ui.theme.fg("muted", "Only subagent tool available"),
				ctx.ui.theme.fg("dim", "Use /orc to disable"),
			]);
		} else {
			ctx.ui.setStatus("orc-mode", undefined);
			ctx.ui.setWidget("orc-mode", undefined);
		}
	}

	function enableOrcMode(ctx: ExtensionContext) {
		if (orcModeEnabled) return;

		// Save current tools before switching
		savedTools = pi.getActiveTools();
		orcModeEnabled = true;
		pi.setActiveTools(ORC_MODE_TOOLS);
		ctx.ui.notify("🎭 Orchestrator mode enabled. Only subagent tool available.");
		updateStatus(ctx);
		persistState();
	}

	function disableOrcMode(ctx: ExtensionContext) {
		if (!orcModeEnabled) return;

		orcModeEnabled = false;
		// Restore original tools or use defaults
		if (savedTools && savedTools.length > 0) {
			pi.setActiveTools(savedTools);
		} else {
			// Fallback to standard tools
			pi.setActiveTools(["read", "bash", "edit", "write", "subagent"]);
		}
		savedTools = null;
		ctx.ui.notify("Orchestrator mode disabled. Full tool access restored.");
		updateStatus(ctx);
		persistState();
	}

	function toggleOrcMode(ctx: ExtensionContext) {
		if (orcModeEnabled) {
			disableOrcMode(ctx);
		} else {
			enableOrcMode(ctx);
		}
	}

	function persistState() {
		pi.appendEntry("orc-mode-state", {
			enabled: orcModeEnabled,
			savedTools,
		});
	}

	// Register /orc command
	pi.registerCommand("orc", {
		description: "Toggle orchestrator mode (only subagent tool available)",
		handler: async (_args, ctx) => {
			toggleOrcMode(ctx);
		},
	});

	// Modify system prompt when orc mode is active
	pi.on("before_agent_start", async (event) => {
		if (!orcModeEnabled) return;

		const orcSystemPrompt = `${event.systemPrompt}

## ORCHESTRATOR MODE

You are operating as an **orchestrator**. Your primary role is to coordinate, plan, and delegate work—not to implement directly.

### Your Tools
You only have access to the **subagent** tool. Use it to delegate all work:
- **explorer**: Find files, understand codebase structure
- **librarian**: Research APIs, documentation, complex integrations  
- **operator**: Implement code changes (after planning is complete)
- **oracle**: Deep analysis, code review, debugging, architecture decisions
- **simplifier**: Clean up and simplify code

### Subagent Modes

**Single agent:**
\`\`\`typescript
{ agent: "explorer", task: "Find all auth-related files" }
\`\`\`

**Parallel tasks** (independent work):
\`\`\`typescript
{ tasks: [
  { agent: "explorer", task: "Find frontend modules" },
  { agent: "explorer", task: "Find backend modules" }
]}
\`\`\`

**Chain** (sequential pipeline with \`{previous}\` carrying output forward):
\`\`\`typescript
{ chain: [
  { agent: "explorer", task: "Gather context for auth refactor" },
  { agent: "oracle", task: "Analyze and plan based on {previous}" },
  { agent: "operator" },  // defaults to {previous}
  { agent: "oracle", task: "Review changes from {previous}" }
]}
\`\`\`

**Chain with parallel fan-out/fan-in:**
\`\`\`typescript
{ chain: [
  { agent: "explorer", task: "Find all service modules" },
  { parallel: [
    { agent: "operator", task: "Refactor auth service from {previous}" },
    { agent: "operator", task: "Refactor user service from {previous}" }
  ]},
  { agent: "oracle", task: "Review all changes from {previous}" }
]}
\`\`\`

### Chain Variables
- \`{task}\` - Original task from first step
- \`{previous}\` - Output from prior step (or aggregated parallel outputs)
- \`{chain_dir}\` - Shared artifacts directory for inter-step files

### Workflow
1. **Analyze** the user's request
2. **Plan** the approach (break into steps if complex)
3. **Delegate** each task to the appropriate subagent
4. **Synthesize** results and report back

### Guidelines
- Always use subagent to delegate work
- For complex multi-step tasks, use chain mode
- For independent tasks, use parallel mode
- Use parallel-in-chain for fan-out/fan-in patterns
- Provide clear, specific task descriptions to subagents
- After subagents complete, summarize findings or confirm changes`;

		return { systemPrompt: orcSystemPrompt };
	});

	// Initialize state on session start
	pi.on("session_start", async (_event, ctx) => {
		// Check CLI flag
		if (pi.getFlag("orc") === true) {
			// Defer enabling to let other extensions initialize first
			setTimeout(() => {
				if (!orcModeEnabled) {
					enableOrcMode(ctx);
				}
			}, 0);
			return;
		}

		// Restore state from session
		const entries = ctx.sessionManager.getEntries();
		const stateEntry = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "orc-mode-state")
			.pop() as { data?: { enabled: boolean; savedTools?: string[] | null } } | undefined;

		if (stateEntry?.data) {
			if (stateEntry.data.enabled) {
				savedTools = stateEntry.data.savedTools ?? null;
				orcModeEnabled = true;
				pi.setActiveTools(ORC_MODE_TOOLS);
			}
		}

		updateStatus(ctx);
	});
}
