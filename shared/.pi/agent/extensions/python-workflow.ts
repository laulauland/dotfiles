import type { HookAPI } from "@mariozechner/pi-coding-agent";

const COMMAND_PREFIX = /(^|&&|\|\||;|\|)\s*/;

const PIP_PATTERN = new RegExp(COMMAND_PREFIX.source + /pip3?\s/.source);
const POETRY_PATTERN = new RegExp(COMMAND_PREFIX.source + /poetry\s/.source);
const PYTHON_MODULE_PATTERN = new RegExp(
	COMMAND_PREFIX.source + /python3?\s/.source,
);

const PIP_MODULE_FLAG = /-m\s+pip(\s|$)|-mpip(\s|$)/;
const VENV_MODULE_FLAG = /-m\s+venv(\s|$)|-mvenv(\s|$)/;

function checkPythonTooling(command: string): string | null {
	if (PIP_PATTERN.test(command)) {
		return "pip is disabled. Use uv instead:\n  Install a package for a script: uv run --with PACKAGE python script.py\n  Add a dependency to the project: uv add PACKAGE";
	}

	if (POETRY_PATTERN.test(command)) {
		return "poetry is disabled. Use uv instead (uv init, uv add, uv sync, uv run)";
	}

	if (PYTHON_MODULE_PATTERN.test(command)) {
		if (PIP_MODULE_FLAG.test(command)) {
			return "python -m pip is disabled. Use uv instead:\n  Install a package for a script: uv run --with PACKAGE python script.py\n  Add a dependency to the project: uv add PACKAGE";
		}
		if (VENV_MODULE_FLAG.test(command)) {
			return "python -m venv is disabled. Use uv instead:\n  Create a virtual environment: uv venv";
		}
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
