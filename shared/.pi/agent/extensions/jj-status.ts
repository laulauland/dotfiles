/**
 * Jujutsu Status Line Extension
 *
 * Displays jj revision and bookmarks in the footer status line.
 * Shows: change_id (short) + bookmarks if any
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "child_process";

const STATUS_KEY = "jj";

function getJjStatus(): string | null {
	try {
		// Check if we're in a jj repo
		execSync("jj root", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });

		// Get current change info: short change_id and bookmarks
		const result = execSync(
			`jj log -r @ -T 'change_id.short() ++ " " ++ bookmarks' --no-graph`,
			{ encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
		).trim();

		if (!result) return null;

		const [changeId, ...bookmarkParts] = result.split(" ");
		const bookmarks = bookmarkParts.join(" ").trim();

		if (bookmarks) {
			return `${changeId} (${bookmarks})`;
		}

		// No bookmark on current change - find closest ancestor with a bookmark
		// Using ::@ to get all ancestors, filter by those with bookmarks, take the first
		try {
			const closestBookmark = execSync(
				`jj log -r '::@- & bookmarks()' -T 'bookmarks' --no-graph --limit 1`,
				{ encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
			).trim();

			if (closestBookmark) {
				// Calculate distance: count commits from bookmark (exclusive) to @
				// Using (bookmark::@) ~ bookmark to get commits after bookmark
				const bookmarkName = closestBookmark.split(" ")[0]; // Take first if multiple
				try {
					const distanceOutput = execSync(
						`jj log -r '(${bookmarkName}::@) ~ ${bookmarkName}' --no-graph -T '"x"'`,
						{ encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
					).trim();
					const distance = distanceOutput.length; // Each commit outputs 'x'

					if (distance > 0) {
						return `${changeId} → ${closestBookmark}~${distance}`;
					}
				} catch {
					// Fall back to showing without distance
				}
				return `${changeId} → ${closestBookmark}`;
			}
		} catch {
			// No ancestor with bookmark found
		}

		return changeId;
	} catch {
		// Not in a jj repo or jj not installed
		return null;
	}
}

function updateStatus(ctx: Parameters<Parameters<ExtensionAPI["on"]>[1]>[1]) {
	const theme = ctx.ui.theme;
	const status = getJjStatus();

	if (status) {
		ctx.ui.setStatus(STATUS_KEY, theme.fg("dim", `${status}`));
	} else {
		ctx.ui.setStatus(STATUS_KEY, undefined);
	}
}

export default function (pi: ExtensionAPI) {
	// Update on session start
	pi.on("session_start", async (_event, ctx) => {
		updateStatus(ctx);
	});

	// Update after each turn (in case jj state changed via tool calls)
	pi.on("turn_end", async (_event, ctx) => {
		updateStatus(ctx);
	});

	// Update on session switch
	pi.on("session_switch", async (_event, ctx) => {
		updateStatus(ctx);
	});
}
