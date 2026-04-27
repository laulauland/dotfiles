import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { AutocompleteItem, AutocompleteProvider, AutocompleteSuggestions } from "@mariozechner/pi-tui";
import * as fs from "node:fs";
import * as path from "node:path";

import type { ShellInfo, ShellType, CompletionResult } from "./types.js";
import { getFishCompletions } from "./fish.js";
import { getBashCompletions } from "./bash.js";
import { getZshCompletions } from "./zsh.js";

function detectShellType(shellPath: string): ShellType {
	const name = path.basename(shellPath);
	if (name === "fish" || name.startsWith("fish")) return "fish";
	if (name === "zsh" || name.startsWith("zsh")) return "zsh";
	return "bash";
}

function findCompletionShell(): ShellInfo {
	const userShell = process.env.SHELL;
	if (userShell && fs.existsSync(userShell)) {
		const shellType = detectShellType(userShell);
		return { path: userShell, type: shellType };
	}

	for (const fishPath of ["/opt/homebrew/bin/fish", "/usr/local/bin/fish", "/usr/bin/fish", "/bin/fish"]) {
		if (fs.existsSync(fishPath)) return { path: fishPath, type: "fish" };
	}
	for (const zshPath of ["/bin/zsh", "/usr/bin/zsh", "/usr/local/bin/zsh", "/opt/homebrew/bin/zsh"]) {
		if (fs.existsSync(zshPath)) return { path: zshPath, type: "zsh" };
	}
	for (const bashPath of ["/bin/bash", "/usr/bin/bash", "/usr/local/bin/bash", "/opt/homebrew/bin/bash"]) {
		if (fs.existsSync(bashPath)) return { path: bashPath, type: "bash" };
	}

	return { path: "/bin/bash", type: "bash" };
}

function isBashMode(lines: string[]): boolean {
	const text = lines.join("\n").trimStart();
	return text.startsWith("!");
}

function getTextUpToCursor(lines: string[], cursorLine: number, cursorCol: number): string {
	const textLines = lines.slice(0, cursorLine + 1);
	if (textLines.length > 0) {
		textLines[textLines.length - 1] = textLines[textLines.length - 1].slice(0, cursorCol);
	}
	return textLines.join("\n");
}

function extractCompletionContext(text: string): { commandLine: string; prefix: string } {
	let commandLine = text.trimStart();
	if (commandLine.startsWith("!!")) {
		commandLine = commandLine.slice(2);
	} else if (commandLine.startsWith("!")) {
		commandLine = commandLine.slice(1);
	}

	const trimmed = commandLine.trimStart();
	if (trimmed.endsWith(" ")) return { commandLine: trimmed, prefix: "" };

	const words = trimmed.split(/\s+/);
	return { commandLine: trimmed, prefix: words[words.length - 1] || "" };
}

function getShellCompletions(text: string, cwd: string, shell: ShellInfo): CompletionResult | null {
	const { commandLine } = extractCompletionContext(text);
	if (!commandLine.trim()) return null;

	switch (shell.type) {
		case "fish":
			return getFishCompletions(commandLine, cwd, shell.path);
		case "bash":
			return getBashCompletions(commandLine, cwd, shell.path);
		case "zsh":
			return getZshCompletions(commandLine, cwd, shell.path);
		default:
			return null;
	}
}

function createShellCompletionProvider(current: AutocompleteProvider, shell: ShellInfo): AutocompleteProvider {
	return {
		async getSuggestions(
			lines: string[],
			cursorLine: number,
			cursorCol: number,
			options: { signal: AbortSignal; force?: boolean },
		): Promise<AutocompleteSuggestions | null> {
			if (!isBashMode(lines)) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			if (options.signal.aborted) return null;
			const text = getTextUpToCursor(lines, cursorLine, cursorCol);
			const result = getShellCompletions(text, process.cwd(), shell);
			if (options.signal.aborted) return null;
			return result && result.items.length > 0 ? result : current.getSuggestions(lines, cursorLine, cursorCol, options);
		},

		applyCompletion(
			lines: string[],
			cursorLine: number,
			cursorCol: number,
			item: AutocompleteItem,
			prefix: string,
		): { lines: string[]; cursorLine: number; cursorCol: number } {
			if (!isBashMode(lines)) return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);

			const currentLine = lines[cursorLine] || "";
			const prefixStart = cursorCol - prefix.length;
			const beforePrefix = currentLine.slice(0, prefixStart);
			const afterCursor = currentLine.slice(cursorCol);
			const suffix = item.value.endsWith("/") ? "" : " ";
			const newLines = [...lines];
			newLines[cursorLine] = beforePrefix + item.value + suffix + afterCursor;

			return { lines: newLines, cursorLine, cursorCol: prefixStart + item.value.length + suffix.length };
		},

		shouldTriggerFileCompletion(lines: string[], cursorLine: number, cursorCol: number): boolean {
			if (isBashMode(lines)) return true;
			return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
		},
	};
}

export default function shellCompletions(pi: ExtensionAPI) {
	const shell = findCompletionShell();
	const shellName = path.basename(shell.path);

	pi.on("session_start", (_event, ctx) => {
		ctx.ui.addAutocompleteProvider((current) => createShellCompletionProvider(current, shell));
		ctx.ui.notify(`Shell completions enabled (${shellName})`, "info");
	});
}

export type { ShellInfo, ShellType, CompletionResult } from "./types.js";
