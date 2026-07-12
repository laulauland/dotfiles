import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface HerdrSurface {
  paneId: string;
  tabId?: string;
}

interface HerdrResponse<T> {
  id?: string;
  result?: T;
  error?: { code?: string; message?: string };
}

interface HerdrPaneInfo {
  pane_id?: string;
  tab_id?: string;
}

interface HerdrTabCreateResult {
  root_pane?: HerdrPaneInfo;
  tab?: { tab_id?: string };
}

function herdrBin(): string {
  return process.env.HERDR_BIN_PATH || "herdr";
}

function parseJsonResponse<T>(raw: string, command: string): T {
  let parsed: HerdrResponse<T>;
  try {
    parsed = JSON.parse(raw) as HerdrResponse<T>;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid Herdr JSON from ${command}: ${detail}. Output: ${raw.slice(0, 500)}`);
  }

  if (parsed.error) {
    throw new Error(`Herdr ${command} failed: ${parsed.error.message ?? parsed.error.code ?? "unknown error"}`);
  }
  if (parsed.result == null) {
    throw new Error(`Herdr ${command} returned no result. Output: ${raw.slice(0, 500)}`);
  }
  return parsed.result;
}

function extractTabRoot(result: HerdrTabCreateResult): HerdrSurface {
  const pane = result.root_pane;
  if (!pane?.pane_id) {
    throw new Error(`Could not find root_pane.pane_id in Herdr tab create result: ${JSON.stringify(result).slice(0, 500)}`);
  }
  return { paneId: pane.pane_id, tabId: result.tab?.tab_id ?? pane.tab_id };
}

function shellEscape(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function commandLine(command: string, args: string[]): string {
  return [command, ...args].map(shellEscape).join(" ");
}

function shellReadyDelayMs(): number {
  const raw = process.env.PI_SUBAGENT_SHELL_READY_DELAY_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 2500;
}

async function waitForShellReady(): Promise<void> {
  const delay = shellReadyDelayMs();
  if (delay <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, delay));
}

export function isHerdrAvailable(): boolean {
  if (process.env.HERDR_ENV !== "1") return false;
  try {
    execFileSync(herdrBin(), ["status"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function herdrSetupHint(): string {
  return "Start pi inside a Herdr-managed pane so HERDR_ENV=1 is present.";
}

export async function createAgentSurface(params: {
  name: string;
  cwd: string;
  env: Record<string, string>;
  command: string;
  args: string[];
}): Promise<HerdrSurface> {
  const tabArgs = ["tab", "create", "--cwd", params.cwd, "--label", params.name, "--no-focus"];
  if (process.env.HERDR_WORKSPACE_ID) tabArgs.push("--workspace", process.env.HERDR_WORKSPACE_ID);
  for (const [key, value] of Object.entries(params.env)) {
    tabArgs.push("--env", `${key}=${value}`);
  }

  const { stdout } = await execFileAsync(herdrBin(), tabArgs, { encoding: "utf8", maxBuffer: 1024 * 1024 });
  const surface = extractTabRoot(parseJsonResponse<HerdrTabCreateResult>(stdout, "tab create"));
  try {
    await waitForShellReady();
    await execFileAsync(herdrBin(), ["pane", "run", surface.paneId, commandLine(params.command, params.args)], { encoding: "utf8" });
    return surface;
  } catch (error) {
    await closeSurface(surface);
    throw error;
  }
}

export async function closeSurface(surface: HerdrSurface): Promise<void> {
  if (surface.tabId) {
    try {
      await execFileAsync(herdrBin(), ["tab", "close", surface.tabId], { encoding: "utf8" });
      return;
    } catch {
      // Fall through and try the root pane if the tab is already gone or unavailable.
    }
  }

  try {
    await execFileAsync(herdrBin(), ["pane", "close", surface.paneId], { encoding: "utf8" });
  } catch {
    // Best effort: the pane may already have exited or been closed by the user.
  }
}

export async function sendEscape(surface: HerdrSurface): Promise<void> {
  await execFileAsync(herdrBin(), ["pane", "send-keys", surface.paneId, "esc"], { encoding: "utf8" });
}

export async function readScreen(surface: HerdrSurface, lines = 50): Promise<string> {
  const { stdout } = await execFileAsync(
    herdrBin(),
    ["pane", "read", surface.paneId, "--source", "recent-unwrapped", "--lines", String(lines)],
    { encoding: "utf8", maxBuffer: 1024 * 1024 },
  );
  try {
    const result = parseJsonResponse<{ text?: string; output?: string; content?: string }>(stdout, "pane read");
    return result.text ?? result.output ?? result.content ?? stdout;
  } catch {
    return stdout;
  }
}

async function paneExists(surface: HerdrSurface): Promise<boolean> {
  try {
    await execFileAsync(herdrBin(), ["pane", "get", surface.paneId], { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

export interface PollResult {
  reason: "done" | "sentinel" | "error";
  exitCode: number;
  errorMessage?: string;
}

function interpretExitSidecar(data: any): PollResult {
  if (data?.type === "error") {
    const errorMessage = typeof data.errorMessage === "string" && data.errorMessage.trim() !== ""
      ? data.errorMessage
      : "Subagent exited with stopReason=error (no errorMessage in sidecar).";
    return { reason: "error", exitCode: 1, errorMessage };
  }
  return { reason: "done", exitCode: 0 };
}

export async function pollForExit(
  surface: HerdrSurface,
  signal: AbortSignal,
  options: {
    interval: number;
    sessionFile?: string;
    onTick?: (elapsed: number) => void;
    existsSync: (path: string) => boolean;
    readFileSync: (path: string, encoding: "utf8") => string;
    rmSync: (path: string, options: { force: boolean }) => void;
  },
): Promise<PollResult> {
  const start = Date.now();
  for (;;) {
    if (signal.aborted) throw new Error("Aborted while waiting for subagent to finish");

    if (options.sessionFile) {
      const exitFile = `${options.sessionFile}.exit`;
      try {
        if (options.existsSync(exitFile)) {
          const data = JSON.parse(options.readFileSync(exitFile, "utf8"));
          options.rmSync(exitFile, { force: true });
          return interpretExitSidecar(data);
        }
      } catch {}
    }

    try {
      const screen = await readScreen(surface, 5);
      const match = screen.match(/__SUBAGENT_DONE_(\d+)__/);
      if (match) return { reason: "sentinel", exitCode: Number.parseInt(match[1], 10) };
    } catch {
      if (!(await paneExists(surface))) {
        return { reason: "sentinel", exitCode: 1, errorMessage: "Subagent pane exited before writing a completion sidecar." };
      }
    }

    const elapsed = Math.floor((Date.now() - start) / 1000);
    options.onTick?.(elapsed);
    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) return reject(new Error("Aborted"));
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, options.interval);
      function onAbort(): void {
        clearTimeout(timer);
        reject(new Error("Aborted"));
      }
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}
