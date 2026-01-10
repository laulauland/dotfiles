import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const NOTIFY_MIN_MS = 15_000;
const MAX_ERROR_PREVIEW = 160;

function getTextPreview(content: Array<{ type: string; text?: string }> | undefined): string | undefined {
	if (!content) return undefined;
	for (const c of content) {
		if (c.type === "text" && typeof c.text === "string" && c.text.trim().length > 0) {
			return c.text.trim();
		}
	}
	return undefined;
}

function clampPreview(text: string): string {
	if (text.length <= MAX_ERROR_PREVIEW) return text;
	return `${text.slice(0, MAX_ERROR_PREVIEW - 1)}…`;
}

export default function (pi: ExtensionAPI) {
	let agentStartedAt = 0;
	let toolCallCount = 0;
	let firstErrorMessage: string | undefined;

	async function sendNotification(message: string, ctx: { hasUI: boolean; cwd: string }) {
		// Avoid leaking OSC sequences into print/RPC output.
		if (!ctx.hasUI) return;

		try {
			const result = await pi.exec("fish", ["-lc", "notify $argv", message], { cwd: ctx.cwd });
			if (result.stdout) process.stdout.write(result.stdout);
		} catch {
			// Best-effort.
		}
	}

	pi.on("agent_start", async () => {
		agentStartedAt = Date.now();
		toolCallCount = 0;
		firstErrorMessage = undefined;
	});

	pi.on("tool_call", async () => {
		toolCallCount++;
	});

	// Track failures, but only notify at agent_end.
	pi.on("tool_result", async (event) => {
		if (!event.isError || firstErrorMessage) return;

		const preview = getTextPreview(event.content as any);
		const base = `pi: ${event.toolName} failed`;
		firstErrorMessage = preview ? `${base}: ${clampPreview(preview)}` : base;
	});

	pi.on("agent_end", async (_event, ctx) => {
		const durationMs = agentStartedAt > 0 ? Date.now() - agentStartedAt : 0;
		const seconds = Math.max(0, Math.round(durationMs / 1000));
		const suffix = durationMs > 0 ? ` (${seconds}s)` : "";

		if (firstErrorMessage) {
			await sendNotification(`${firstErrorMessage}${suffix}`, ctx);
			return;
		}

		const shouldNotify = toolCallCount > 0 || durationMs >= NOTIFY_MIN_MS;
		if (!shouldNotify) return;

		await sendNotification(`pi: done${suffix}`, ctx);
	});
}
