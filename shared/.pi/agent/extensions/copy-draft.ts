import { spawn } from "node:child_process";
import { platform } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface ClipboardCommand {
	command: string;
	args: string[];
	name: string;
}

function clipboardCommands(): ClipboardCommand[] {
	switch (platform()) {
		case "darwin":
			return [{ command: "pbcopy", args: [], name: "pbcopy" }];
		case "linux":
			return [
				{ command: "wl-copy", args: [], name: "wl-copy" },
				{ command: "xclip", args: ["-selection", "clipboard"], name: "xclip" },
				{ command: "xsel", args: ["--clipboard", "--input"], name: "xsel" },
			];
		case "win32":
			return [{ command: "clip.exe", args: [], name: "clip.exe" }];
		default:
			return [];
	}
}

function writeWithCommand(candidate: ClipboardCommand, text: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(candidate.command, candidate.args, { stdio: ["pipe", "ignore", "pipe"] });
		let stderr = "";

		child.stderr?.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		child.on("error", reject);
		child.stdin.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`${candidate.name} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
		});

		child.stdin.end(text);
	});
}

async function writeClipboard(text: string): Promise<string> {
	const candidates = clipboardCommands();
	if (candidates.length === 0) {
		throw new Error(`No clipboard command configured for ${platform()}`);
	}

	let lastError: unknown;
	for (const candidate of candidates) {
		try {
			await writeWithCommand(candidate, text);
			return candidate.name;
		} catch (error) {
			lastError = error;
		}
	}

	throw lastError instanceof Error ? lastError : new Error("Clipboard write failed");
}

function describeDraft(text: string): string {
	const chars = [...text].length;
	const lines = text.split("\n").length;
	const charLabel = chars === 1 ? "character" : "characters";
	const lineLabel = lines === 1 ? "line" : "lines";
	return `${chars} ${charLabel}, ${lines} ${lineLabel}`;
}

export default function copyDraftExtension(pi: ExtensionAPI) {
	pi.registerShortcut("ctrl+s", {
		description: "Copy the current prompt draft to the clipboard and clear the input box",
		handler: async (ctx) => {
			const draft = ctx.ui.getEditorText();

			if (!draft.trim()) {
				ctx.ui.notify("No prompt draft to copy", "info");
				return;
			}

			try {
				const clipboard = await writeClipboard(draft);
				ctx.ui.setEditorText("");
				ctx.ui.notify(`Copied draft to clipboard via ${clipboard} (${describeDraft(draft)})`, "success");
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Failed to copy draft: ${message}`, "error");
			}
		},
	});
}
