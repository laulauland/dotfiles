/**
 * Annotate Extension
 *
 * Adds /annotate to review the last assistant message in a temporary Neovim buffer.
 * The buffer uses a commit-message-style template:
 * - assistant message at the top
 * - divider near the bottom
 * - writable response area below the divider
 *
 * Whatever is written below the divider is loaded back into Pi's input editor.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const REPLY_MARKER = "--- PI: write below / only below is returned ---";
const EDITOR = process.env.PI_ANNOTATE_EDITOR || "nvim";

interface AnnotateTemplate {
	template: string;
	replyLine: number;
}

interface EditorRunResult {
	content: string | null;
	exitCode: number | null;
	error: string | null;
}

function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
	return message.role === "assistant" && Array.isArray(message.content);
}

function getAssistantText(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n")
		.trim();
}

function getLastAssistantText(ctx: ExtensionContext): string | undefined {
	const branch = ctx.sessionManager.getBranch();

	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (entry.type !== "message") continue;

		const message = entry.message as AgentMessage;
		if (!isAssistantMessage(message)) continue;

		const text = getAssistantText(message);
		if (text.length > 0) {
			return text;
		}
	}

	return undefined;
}

function buildTemplate(assistantText: string): AnnotateTemplate {
	const lines = [
		"Review the assistant message above.",
		"Write your follow-up below the marker.",
		"Only text below the marker will be returned to Pi.",
		"",
		"# Last assistant message",
		"",
		...assistantText.trimEnd().split("\n"),
		"",
		REPLY_MARKER,
		"",
	];

	return {
		template: `${lines.join("\n")}\n`,
		replyLine: lines.length,
	};
}

function extractReply(content: string): { reply: string | null; error?: string } {
	const markerIndex = content.indexOf(REPLY_MARKER);
	if (markerIndex === -1) {
		return {
			reply: null,
			error: "Reply marker was removed.",
		};
	}

	const reply = content.slice(markerIndex + REPLY_MARKER.length).trim();
	return { reply };
}

async function openAnnotateEditor(ctx: ExtensionContext, template: string, replyLine: number): Promise<EditorRunResult> {
	return (
		(await ctx.ui.custom<EditorRunResult>((tui, _theme, _kb, done) => {
			const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-annotate-"));
			const tempFile = path.join(tempDir, "ANNOTATE.md");

			try {
				fs.writeFileSync(tempFile, template, "utf-8");
			} catch (error) {
				done({
					content: null,
					exitCode: null,
					error: error instanceof Error ? error.message : String(error),
				});
				return { render: () => [], invalidate: () => {} };
			}

			try {
				tui.stop();
				process.stdout.write("\x1b[2J\x1b[H");

				const result = spawnSync(EDITOR, [`+call cursor(${replyLine},1)`, tempFile], {
					stdio: "inherit",
					shell: process.platform === "win32",
				});

				if (result.error) {
					done({
						content: null,
						exitCode: result.status,
						error: result.error.message,
					});
				} else if (result.status === 0) {
					done({
						content: fs.readFileSync(tempFile, "utf-8"),
						exitCode: result.status,
						error: null,
					});
				} else {
					done({
						content: null,
						exitCode: result.status,
						error: null,
					});
				}
			} finally {
				try {
					fs.rmSync(tempDir, { recursive: true, force: true });
				} catch {
					// Ignore cleanup errors.
				}

				tui.start();
				tui.requestRender(true);
			}

			return { render: () => [], invalidate: () => {} };
		})) ?? { content: null, exitCode: null, error: null }
	);
}

export default function annotateExtension(pi: ExtensionAPI) {
	pi.registerCommand("annotate", {
		description: "Open the last assistant message in Neovim and draft a follow-up",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/annotate requires interactive mode", "error");
				return;
			}

			if (!ctx.isIdle()) {
				ctx.ui.notify("Wait until Pi finishes responding before annotating.", "warning");
				return;
			}

			const assistantText = getLastAssistantText(ctx);
			if (!assistantText) {
				ctx.ui.notify("No assistant message with text found to annotate.", "warning");
				return;
			}

			const { template, replyLine } = buildTemplate(assistantText);
			const result = await openAnnotateEditor(ctx, template, replyLine);

			if (result.error) {
				ctx.ui.notify(`Failed to open ${EDITOR}: ${result.error}`, "error");
				return;
			}

			if (result.exitCode !== 0 || result.content === null) {
				ctx.ui.notify("Annotation cancelled.", "info");
				return;
			}

			const parsed = extractReply(result.content);
			if (parsed.error) {
				ctx.ui.notify(parsed.error, "warning");
				return;
			}

			if (!parsed.reply) {
				ctx.ui.notify("No follow-up text written below the marker.", "info");
				return;
			}

			ctx.ui.setEditorText(parsed.reply);
			ctx.ui.notify("Loaded annotated follow-up into the prompt input.", "info");
		},
	});
}
