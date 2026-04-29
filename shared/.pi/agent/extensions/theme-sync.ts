import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const execAsync = promisify(exec);
const LIGHT_THEME = "light";
const DARK_THEME = "dark";
const POLL_INTERVAL_MS = 2000;

type ThemeMode = "light" | "dark";

let intervalId: ReturnType<typeof setInterval> | null = null;
let activeContext: ExtensionContext | null = null;
let activeToken: symbol | null = null;
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

async function applyTheme(ctx = activeContext, token = activeToken): Promise<void> {
	if (!ctx || !token) return;

	const nextThemeName = themeNameForMode(await detectThemeMode());
	if (ctx !== activeContext || token !== activeToken) return;
	if (nextThemeName === currentThemeName) return;

	try {
		const result = ctx.ui.setTheme(nextThemeName);
		if (ctx !== activeContext || token !== activeToken) return;
		if (result.success) {
			currentThemeName = nextThemeName;
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes("extension ctx is stale")) return;
		throw error;
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
		const token = Symbol("theme-sync-session");
		activeContext = ctx;
		activeToken = token;
		currentThemeName = null;
		await applyTheme(ctx, token);
		if (activeContext === ctx && activeToken === token) startWatcher();
	});

	pi.on("session_shutdown", () => {
		stopWatcher();
		activeContext = null;
		activeToken = null;
		currentThemeName = null;
	});
}
