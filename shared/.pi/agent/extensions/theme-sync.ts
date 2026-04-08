import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const execAsync = promisify(exec);
const LIGHT_THEME = "laulauland-light";
const DARK_THEME = "laulauland-dark";
const POLL_INTERVAL_MS = 2000;

type ThemeMode = "light" | "dark";

let intervalId: ReturnType<typeof setInterval> | null = null;
let activeContext: ExtensionContext | null = null;
let currentThemeName: string | null = null;

function readMode(value: string | undefined): ThemeMode | null {
	const normalized = value?.trim().toLowerCase();
	return normalized === "light" || normalized === "dark" ? normalized : null;
}

function themeNameForMode(mode: ThemeMode): string {
	return mode === "dark" ? DARK_THEME : LIGHT_THEME;
}

async function readMacOsMode(): Promise<ThemeMode | null> {
	if (process.platform !== "darwin") return null;

	try {
		const { stdout } = await execAsync(
			"osascript -e 'tell application \"System Events\" to tell appearance preferences to return dark mode'",
		);
		return stdout.trim() === "true" ? "dark" : "light";
	} catch {
		return null;
	}
}

async function detectThemeMode(): Promise<ThemeMode> {
	const pinnedMode = readMode(process.env.PI_THEME_MODE);
	if (pinnedMode) return pinnedMode;

	const macOsMode = await readMacOsMode();
	if (macOsMode) return macOsMode;

	return readMode(process.env.TERM_BACKGROUND) ?? readMode(process.env.DFT_BACKGROUND) ?? "light";
}

async function applyTheme(): Promise<void> {
	if (!activeContext) return;

	const nextThemeName = themeNameForMode(await detectThemeMode());
	if (nextThemeName === currentThemeName) return;

	const result = activeContext.ui.setTheme(nextThemeName);
	if (result.success) {
		currentThemeName = nextThemeName;
	}
}

function startWatcher(): void {
	if (intervalId || readMode(process.env.PI_THEME_MODE) || process.platform !== "darwin") return;

	intervalId = setInterval(() => {
		void applyTheme();
	}, POLL_INTERVAL_MS);
}

function stopWatcher(): void {
	if (!intervalId) return;
	clearInterval(intervalId);
	intervalId = null;
}

export default function themeSync(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		activeContext = ctx;
		currentThemeName = null;
		await applyTheme();
		startWatcher();
	});

	pi.on("session_shutdown", () => {
		activeContext = null;
		currentThemeName = null;
		stopWatcher();
	});
}
