/**
 * Update Extension - Adds /update command and `pi update` CLI support
 *
 * Detects installation method (bun, npm, or native binary) and runs
 * the appropriate update command.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type InstallMethod = "bun" | "npm" | "native";

interface DetectionResult {
	method: InstallMethod;
	details: string;
}

async function detectInstallMethod(pi: ExtensionAPI): Promise<DetectionResult> {
	// Get the path to the pi executable
	const { stdout: whichPi, code: whichCode } = await pi.exec("which", ["pi"]);
	const piPath = whichPi.trim();

	// Path-based detection (fast, preferred)
	if (whichCode === 0 && piPath) {
		// Bun: ~/.bun/bin/pi or paths containing .bun
		if (piPath.includes(".bun") || piPath.includes("/bun/")) {
			return {
				method: "bun",
				details: `Installed via bun at: ${piPath}`,
			};
		}

		// npm: ~/.npm/bin/pi, ~/.npm-global/, or node_modules
		if (piPath.includes(".npm") || piPath.includes("npm-global") || piPath.includes("node_modules")) {
			return {
				method: "npm",
				details: `Installed via npm at: ${piPath}`,
			};
		}

		// Check npm global prefix (handles custom npm prefix configurations)
		const { stdout: npmPrefix, code: npmPrefixCode } = await pi.exec("npm", ["config", "get", "prefix"]);
		if (npmPrefixCode === 0 && npmPrefix.trim()) {
			const prefix = npmPrefix.trim();
			if (piPath.startsWith(prefix)) {
				return {
					method: "npm",
					details: `Installed via npm at: ${piPath}`,
				};
			}
		}

		// Check bun global bin path
		const { stdout: bunBin, code: bunBinCode } = await pi.exec("bun", ["pm", "bin", "-g"]);
		if (bunBinCode === 0 && bunBin.trim()) {
			const bunBinPath = bunBin.trim();
			if (piPath.startsWith(bunBinPath)) {
				return {
					method: "bun",
					details: `Installed via bun at: ${piPath}`,
				};
			}
		}
	}

	// Fallback: check if package is installed via package managers
	// This handles cases where `which pi` fails or returns unexpected paths

	// Check bun global packages
	const { stdout: bunList, code: bunListCode } = await pi.exec("bun", ["pm", "ls", "-g"]);
	if (bunListCode === 0 && bunList.includes("@mariozechner/pi-coding-agent")) {
		return {
			method: "bun",
			details: "Detected via bun global packages",
		};
	}

	// Check npm global packages
	const { stdout: npmList, code: npmListCode } = await pi.exec("npm", ["list", "-g", "--depth=0", "@mariozechner/pi-coding-agent"]);
	if (npmListCode === 0 && npmList.includes("@mariozechner/pi-coding-agent")) {
		return {
			method: "npm",
			details: "Detected via npm global packages",
		};
	}

	// If we have a path but couldn't identify the method, it's likely native
	if (piPath) {
		return {
			method: "native",
			details: `Native binary at: ${piPath}`,
		};
	}

	return {
		method: "native",
		details: "Could not determine installation method, assuming native binary",
	};
}

async function runUpdate(
	pi: ExtensionAPI,
	method: InstallMethod,
	ctx: { ui: { notify: (msg: string, type: "info" | "error" | "success" | "warning") => void }; hasUI: boolean }
): Promise<{ success: boolean; output: string }> {
	let result: { stdout: string; stderr: string; code: number };
	let command: string;

	switch (method) {
		case "bun":
			command = "bun install -g @mariozechner/pi-coding-agent";
			ctx.ui.notify(`Running: ${command}`, "info");
			result = await pi.exec("bun", ["install", "-g", "@mariozechner/pi-coding-agent"]);
			break;

		case "npm":
			command = "npm install -g @mariozechner/pi-coding-agent";
			ctx.ui.notify(`Running: ${command}`, "info");
			result = await pi.exec("npm", ["install", "-g", "@mariozechner/pi-coding-agent"]);
			break;

		case "native":
			ctx.ui.notify("Native binary detected. Please download the latest release manually:", "warning");
			ctx.ui.notify("https://github.com/badlogic/pi-mono/releases", "info");
			return {
				success: false,
				output: "Native binary installation requires manual update from GitHub releases.",
			};
	}

	const success = result.code === 0;
	const output = result.stdout + (result.stderr ? `\n${result.stderr}` : "");

	return { success, output };
}

export default function (pi: ExtensionAPI) {
	// Register the /update command
	pi.registerCommand("update", {
		description: "Update pi-coding-agent to the latest version",
		handler: async (_args, ctx) => {
			const notify = ctx.hasUI
				? (msg: string, type: "info" | "error" | "success" | "warning") => ctx.ui.notify(msg, type)
				: (msg: string, _type: "info" | "error" | "success" | "warning") => console.log(msg);

			notify("Detecting installation method...", "info");

			try {
				const detection = await detectInstallMethod(pi);
				notify(detection.details, "info");

				const { success, output } = await runUpdate(pi, detection.method, {
					ui: { notify },
					hasUI: ctx.hasUI,
				});

				if (success) {
					notify("Update complete! Restart pi to use the new version.", "success");
				} else if (detection.method !== "native") {
					notify(`Update failed: ${output}`, "error");
				}
			} catch (error) {
				notify(`Update failed: ${error instanceof Error ? error.message : String(error)}`, "error");
			}
		},
	});

	// Register --update flag for CLI usage (pi --update)
	pi.registerFlag("update", {
		description: "Update pi-coding-agent to the latest version",
		type: "boolean",
		default: false,
	});

	// Check flag on session start
	pi.on("session_start", async (_event, ctx) => {
		if (!pi.getFlag("update")) {
			return;
		}

		if (!ctx.hasUI) {
			// In print mode, just output text
			console.log("Detecting installation method...");
			try {
				const detection = await detectInstallMethod(pi);
				console.log(detection.details);

				const { success, output } = await runUpdate(pi, detection.method, {
					ui: {
						notify: (msg, _type) => console.log(msg),
					},
					hasUI: false,
				});

				if (success) {
					console.log("Update complete! Restart pi to use the new version.");
				} else if (detection.method !== "native") {
					console.error(`Update failed: ${output}`);
				}
			} catch (error) {
				console.error(`Update failed: ${error instanceof Error ? error.message : String(error)}`);
			}
			process.exit(0);
		} else {
			ctx.ui.notify("Detecting installation method...", "info");

			try {
				const detection = await detectInstallMethod(pi);
				ctx.ui.notify(detection.details, "info");

				const { success, output } = await runUpdate(pi, detection.method, ctx);

				if (success) {
					ctx.ui.notify("Update complete! Restart pi to use the new version.", "success");
				} else if (detection.method !== "native") {
					ctx.ui.notify(`Update failed: ${output}`, "error");
				}
			} catch (error) {
				ctx.ui.notify(`Update failed: ${error instanceof Error ? error.message : String(error)}`, "error");
			}
		}
	});
}
