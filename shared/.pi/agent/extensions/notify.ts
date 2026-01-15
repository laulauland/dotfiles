/**
 * Desktop Notification Extension
 *
 * Sends a native desktop notification when the agent finishes and is waiting for input.
 * Uses OSC 777 escape sequence with tmux passthrough support.
 *
 * Supported terminals: Ghostty, iTerm2, WezTerm, rxvt-unicode
 * Not supported: Kitty (uses OSC 99), Terminal.app, Windows Terminal, Alacritty
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Send a desktop notification via OSC 777 escape sequence.
 */
function notify(title: string, body: string): void {
	if (process.env.TMUX) {
		// Wrap in DCS passthrough for tmux
		process.stdout.write(`\x1bPtmux;\x1b\x1b]777;notify;${title};${body}\x07\x1b\\`);
	} else {
		process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("agent_end", async (_event, ctx) => {
		// Avoid leaking OSC sequences into print/RPC output
		if (!ctx.hasUI) return;

		notify("Pi", "Ready for input");
	});
}
