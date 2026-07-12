import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Identifies the Herdr tab and root pane owned by one subagent. */
export interface HerdrSurface {
  readonly paneId: string;
  readonly tabId?: string;
}

function herdrBin(): string {
  return process.env.HERDR_BIN_PATH || "herdr";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJsonResponse(raw: string, command: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown parse error";
    throw new Error(`Invalid Herdr JSON from ${command}: ${detail}`);
  }

  if (!isRecord(parsed)) throw new Error(`Invalid Herdr response from ${command}: expected an object.`);
  const error = isRecord(parsed.error) ? parsed.error : undefined;
  if (error) {
    const message = typeof error.message === "string" ? error.message : undefined;
    const code = typeof error.code === "string" ? error.code : undefined;
    throw new Error(`Herdr ${command} failed: ${message ?? code ?? "unknown error"}`);
  }
  if (!("result" in parsed) || parsed.result == null) {
    throw new Error(`Herdr ${command} returned no result.`);
  }
  return parsed.result;
}

function extractTabRoot(result: unknown): HerdrSurface {
  if (!isRecord(result)) throw new Error("Could not parse Herdr tab create result: expected an object.");
  const root = isRecord(result.root_pane) ? result.root_pane : undefined;
  const tab = isRecord(result.tab) ? result.tab : undefined;
  const paneId = root?.pane_id;
  const tabId = tab?.tab_id ?? root?.tab_id;
  if (typeof paneId !== "string" || paneId.trim() === "") {
    throw new Error("Could not find root_pane.pane_id in Herdr tab create result.");
  }
  if (tabId !== undefined && typeof tabId !== "string") {
    throw new Error("Invalid tab_id in Herdr tab create result.");
  }
  return { paneId, ...(typeof tabId === "string" ? { tabId } : {}) };
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

async function waitForShellReady(signal?: AbortSignal): Promise<void> {
  const delay = shellReadyDelayMs();
  if (delay <= 0) {
    signal?.throwIfAborted();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delay);
    function onAbort(): void {
      clearTimeout(timer);
      reject(new Error("Aborted while waiting for Herdr shell"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Return whether the current process can reach the Herdr control plane. */
export function isHerdrAvailable(): boolean {
  if (process.env.HERDR_ENV !== "1") return false;
  try {
    execFileSync(herdrBin(), ["status"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Explain how to make Herdr available to the extension. */
export function herdrSetupHint(): string {
  return "Start pi inside a Herdr-managed pane so HERDR_ENV=1 is present.";
}

/** Create a no-focus Herdr tab and run the child launcher in its root pane. */
export async function createAgentSurface(params: {
  readonly label: string;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly command: string;
  readonly args: readonly string[];
  readonly signal?: AbortSignal;
}): Promise<HerdrSurface> {
  const tabArgs = ["tab", "create", "--cwd", params.cwd, "--label", params.label, "--no-focus"];
  if (process.env.HERDR_WORKSPACE_ID) tabArgs.push("--workspace", process.env.HERDR_WORKSPACE_ID);
  for (const [key, value] of Object.entries(params.env)) {
    tabArgs.push("--env", `${key}=${value}`);
  }

  const { stdout } = await execFileAsync(herdrBin(), tabArgs, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    signal: params.signal,
  });
  const surface = extractTabRoot(parseJsonResponse(stdout, "tab create"));
  try {
    await waitForShellReady(params.signal);
    await execFileAsync(herdrBin(), ["pane", "run", surface.paneId, commandLine(params.command, [...params.args])], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      signal: params.signal,
    });
    return surface;
  } catch (error) {
    await closeSurface(surface);
    throw error;
  }
}

/** Focus the Herdr tab containing a subagent surface. */
export async function focusSurface(surface: HerdrSurface): Promise<void> {
  if (!surface.tabId) throw new Error("Subagent tab has no tab id");
  await execFileAsync(herdrBin(), ["tab", "focus", surface.tabId], { encoding: "utf8" });
}

/** Report whether the subagent pane still contains a detected Pi agent. */
export async function surfaceExists(surface: HerdrSurface): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(herdrBin(), ["pane", "get", surface.paneId], { encoding: "utf8" });
    const result = parseJsonResponse(stdout, "pane get");
    if (!isRecord(result) || !isRecord(result.pane)) return false;
    return result.pane.agent === "pi";
  } catch {
    return false;
  }
}

/** Send a follow-up prompt to an existing interactive subagent pane. */
export async function sendPrompt(surface: HerdrSurface, prompt: string): Promise<void> {
  if (!(await paneExists(surface))) throw new Error(`Subagent pane ${surface.paneId} is no longer available`);
  await execFileAsync(herdrBin(), ["pane", "run", surface.paneId, prompt], { encoding: "utf8" });
}

/** Close the owned Herdr tab, falling back to its root pane when necessary. */
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

/** Send Escape to request interruption without closing the subagent surface. */
export async function sendEscape(surface: HerdrSurface): Promise<void> {
  await execFileAsync(herdrBin(), ["pane", "send-keys", surface.paneId, "esc"], { encoding: "utf8" });
}

/** Read recent unwrapped text from the subagent pane. */
export async function readScreen(
  surface: HerdrSurface,
  lines = 50,
  options: { readonly signal?: AbortSignal } = {},
): Promise<string> {
  const { stdout } = await execFileAsync(
    herdrBin(),
    ["pane", "read", surface.paneId, "--source", "recent-unwrapped", "--lines", String(lines), "--format", "text"],
    { encoding: "utf8", maxBuffer: 1024 * 1024, signal: options.signal },
  );
  // `pane read --format text` is the intentional plain-text Herdr boundary;
  // the other control-plane commands are validated as JSON envelopes above.
  return stdout;
}

async function paneExists(surface: HerdrSurface): Promise<boolean> {
  try {
    await execFileAsync(herdrBin(), ["pane", "get", surface.paneId], { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

/** Describes how the child watcher observed completion. */
export interface PollResult {
  readonly reason: "done" | "sentinel" | "settled";
  readonly exitCode: number;
  readonly errorMessage?: string;
}

function interpretExitSidecar(data: unknown): PollResult {
  if (!isRecord(data)) {
    return { reason: "done", exitCode: 1, errorMessage: "Invalid subagent exit sidecar: expected an object." };
  }
  const record = data;
  if (record.type === "error") {
    const errorMessage = typeof record.errorMessage === "string" && record.errorMessage.trim() !== ""
      ? record.errorMessage
      : "Subagent settled with stopReason=error (no errorMessage in sidecar).";
    return { reason: "settled", exitCode: 1, errorMessage };
  }
  if (record.type === "settled") return { reason: "settled", exitCode: 0 };
  return { reason: "done", exitCode: 1, errorMessage: "Invalid subagent exit sidecar: unknown type." };
}

/** Wait for a child completion sidecar or the launch-script sentinel. */
export async function pollForExit(
  surface: HerdrSurface,
  signal: AbortSignal,
  options: {
    readonly interval: number;
    readonly sessionFile?: string;
    readonly onTick?: (elapsed: number) => void;
    readonly existsSync: (path: string) => boolean;
    readonly readFileSync: (path: string, encoding: "utf8") => string;
    readonly rmSync: (path: string, options: { force: boolean }) => void;
  },
): Promise<PollResult> {
  const start = Date.now();
  for (;;) {
    if (signal.aborted) throw new Error("Aborted while waiting for subagent to finish");

    if (options.sessionFile) {
      const exitFile = `${options.sessionFile}.exit`;
      if (options.existsSync(exitFile)) {
        let data: unknown;
        try {
          data = JSON.parse(options.readFileSync(exitFile, "utf8"));
        } catch (error) {
          const detail = error instanceof Error ? error.message : "unknown parse error";
          return { reason: "done", exitCode: 1, errorMessage: `Invalid subagent exit sidecar: ${detail}` };
        }
        try {
          options.rmSync(exitFile, { force: true });
        } catch {
          // Completion has still been observed; the watcher owns one read of the sidecar.
        }
        return interpretExitSidecar(data);
      }
    }

    try {
      const screen = await readScreen(surface, 5, { signal });
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
