import type { HookAPI } from "@mariozechner/pi-coding-agent";

const COMMAND_SEGMENT_SPLIT = /&&|\|\||;|\||\n/;

const PIP_PATTERN = /(^|[\s(!])(?:[^\s]+\/)?pip3?(?=\s|$)/;
const POETRY_PATTERN = /(^|[\s(!])(?:[^\s]+\/)?poetry(?=\s|$)/;

const PYTHON_TOKEN_PATTERN =
	/(^|[\s(!])(?:command\s+)?(?:env\s+)?(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*(?:[^\s]+\/)?python(?:[23](?:\.\d+)?)?(?=\s|$)/;

const PIP_MODULE_FLAG = /-m\s+pip(\s|$)|-mpip(\s|$)/;
const VENV_MODULE_FLAG = /-m\s+venv(\s|$)|-mvenv(\s|$)/;

function splitSegments(command: string): string[] {
	return command
		.split(COMMAND_SEGMENT_SPLIT)
		.map((segment) => segment.trim())
		.filter(Boolean);
}

function isUvRunSegment(segment: string): boolean {
	return /^uv\s+run\b/.test(segment);
}

function checkPythonTooling(command: string): string | null {
	if (PIP_PATTERN.test(command)) {
		return "pip is disabled. Use uv instead:\n  Install a package for a script: uv run --with PACKAGE python script.py\n  Add a dependency to the project: uv add PACKAGE";
	}

	if (POETRY_PATTERN.test(command)) {
		return "poetry is disabled. Use uv instead (uv init, uv add, uv sync, uv run)";
	}

	for (const segment of splitSegments(command)) {
		if (isUvRunSegment(segment)) {
			continue;
		}

		if (!PYTHON_TOKEN_PATTERN.test(segment)) {
			continue;
		}

		if (PIP_MODULE_FLAG.test(segment)) {
			return "python -m pip is disabled. Use uv instead:\n  Install a package for a script: uv run --with PACKAGE python script.py\n  Add a dependency to the project: uv add PACKAGE";
		}

		if (VENV_MODULE_FLAG.test(segment)) {
			return "python -m venv is disabled. Use uv instead:\n  Create a virtual environment: uv venv";
		}

		return "Direct python/python3 commands are disabled. Use uv instead:\n  Run scripts: uv run python script.py\n  One-off deps: uv run --with PACKAGE python script.py";
	}

	return null;
}

export default function (pi: HookAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return;

		const command = event.input.command as string;
		if (!command) return;

		const error = checkPythonTooling(command);
		if (error) {
			ctx.ui.notify(error, "warning");
			return { block: true, reason: error };
		}
	});
}
