import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
  closeSurface,
  createSplitSurface,
  type HerdrSurface,
  herdrSetupHint,
  isHerdrAvailable,
  surfaceExists,
} from "../herdr-subagents/herdr.ts";
import type { MainBrokerOptions, SideBootstrap, SideRecord, SideStatus } from "./broker.ts";
import { MainSideBroker, notifyMain, requestMain } from "./broker.ts";

const SIDE_PROMPT = [
  "You are in an ephemeral side chat attached to a main Pi session.",
  "The initial conversation is a snapshot of the main session, not a shared live session.",
  "Use side_channel with action=fetch_main when you need updates from the main session.",
  "When the user asks you to send a summary, use side_channel with action=send_main and kind=summary.",
  "Do not claim that an update was delivered until side_channel confirms acceptance.",
].join(" ");

const SideChannelAction = StringEnum(["fetch_main", "send_main"] as const);
const SideChannelKind = StringEnum(["summary", "note", "question"] as const);
const SideChannelDelivery = StringEnum(["steer", "followUp"] as const);

const SideChannelParams = Type.Object(
  {
    action: SideChannelAction,
    sinceEntryId: Type.Optional(Type.String({ description: "Main-session entry cursor returned by fetch_main." })),
    kind: Type.Optional(SideChannelKind),
    content: Type.Optional(Type.String({ description: "Text to deliver to the main session." })),
    delivery: Type.Optional(SideChannelDelivery),
  },
  { additionalProperties: false },
);

type SideChannelParamsType = typeof SideChannelParams.static;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseBootstrap(raw: unknown): SideBootstrap {
  if (!isRecord(raw)) throw new Error("Invalid side bootstrap: expected an object.");
  const requiredStrings = ["sideId", "temporaryDir", "temporarySession", "brokerSocket", "token"] as const;
  for (const key of requiredStrings) {
    if (typeof raw[key] !== "string" || raw[key].trim() === "") {
      throw new Error(`Invalid side bootstrap: missing ${key}.`);
    }
  }
  if (raw.version !== 1) throw new Error("Unsupported side bootstrap version.");
  if (raw.parentSessionFile !== undefined && typeof raw.parentSessionFile !== "string") {
    throw new Error("Invalid side bootstrap: parentSessionFile must be a string.");
  }
  if (
    raw.activeTools !== undefined &&
    (!Array.isArray(raw.activeTools) || raw.activeTools.some((tool) => typeof tool !== "string"))
  ) {
    throw new Error("Invalid side bootstrap: activeTools must be a string array.");
  }
  if (
    raw.model !== undefined &&
    (!isRecord(raw.model) || typeof raw.model.provider !== "string" || typeof raw.model.id !== "string")
  ) {
    throw new Error("Invalid side bootstrap: model must contain provider and id.");
  }
  const thinkingLevels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
  if (raw.thinkingLevel !== undefined && !thinkingLevels.includes(raw.thinkingLevel as (typeof thinkingLevels)[number])) {
    throw new Error("Invalid side bootstrap: unsupported thinking level.");
  }
  return {
    version: 1,
    sideId: raw.sideId as string,
    temporaryDir: raw.temporaryDir as string,
    temporarySession: raw.temporarySession as string,
    brokerSocket: raw.brokerSocket as string,
    token: raw.token as string,
    ...(typeof raw.parentSessionFile === "string" ? { parentSessionFile: raw.parentSessionFile } : {}),
    ...(Array.isArray(raw.activeTools) ? { activeTools: raw.activeTools as string[] } : {}),
    ...(isRecord(raw.model)
      ? { model: { provider: raw.model.provider as string, id: raw.model.id as string } }
      : {}),
    ...(typeof raw.thinkingLevel === "string"
      ? { thinkingLevel: raw.thinkingLevel as SideBootstrap["thinkingLevel"] }
      : {}),
  };
}

function loadBootstrap(): SideBootstrap | undefined {
  const path = process.env.PI_SIDE_BOOTSTRAP;
  if (!path) return undefined;
  return parseBootstrap(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

function writeJsonlSnapshot(ctx: ExtensionContext, sideId: string, temporaryDir: string): {
  temporarySession: string;
  parentSessionFile?: string;
} {
  const temporarySession = join(temporaryDir, "session.jsonl");
  const header = {
    type: "session",
    version: 3,
    id: sideId,
    timestamp: new Date().toISOString(),
    cwd: ctx.cwd,
    ...(ctx.sessionManager.getSessionFile()
      ? { parentSession: ctx.sessionManager.getSessionFile() }
      : {}),
  };
  const lines = [JSON.stringify(header), ...ctx.sessionManager.getBranch().map((entry) => JSON.stringify(entry))];
  writeFileSync(temporarySession, `${lines.join("\n")}\n`, { mode: 0o600 });
  return {
    temporarySession,
    ...(ctx.sessionManager.getSessionFile()
      ? { parentSessionFile: ctx.sessionManager.getSessionFile() }
      : {}),
  };
}

function writeBootstrap(path: string, bootstrap: SideBootstrap): void {
  writeFileSync(path, `${JSON.stringify(bootstrap, null, 2)}\n`, { mode: 0o600 });
}

function formatFetchResult(data: unknown): string {
  if (!isRecord(data)) return "Main session returned an invalid update.";
  const entries = Array.isArray(data.entries) ? data.entries : [];
  const reset = data.reset === true;
  const prefix = reset ? "Main session branch changed; here is the replacement branch." : "Main session updates:";
  return `${prefix}\n\n${entries.length > 0 ? JSON.stringify(entries, null, 2) : "No new entries."}`;
}

function registerSideRuntime(pi: ExtensionAPI, bootstrap: SideBootstrap): void {
  let promotionInProgress = false;

  pi.on("before_agent_start", (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${SIDE_PROMPT}`,
  }));

  pi.on("session_start", async (_event, ctx) => {
    const sessionFile = ctx.sessionManager.getSessionFile();
    const ephemeral = sessionFile === bootstrap.temporarySession;
    const instructions = [
      `SIDE CHAT · ${ephemeral ? "ephemeral" : "saved"}`,
      ephemeral ? "/save [name] keep" : "saved session",
      ephemeral ? "/close discard" : "/close",
      "/send-summary → main",
    ].join("  ·  ");
    if (ctx.mode === "tui") {
      ctx.ui.setWidget("side-chat-guide", (_tui, theme) => ({
        render(width: number): string[] {
          return [truncateToWidth(theme.fg("dim", instructions), width)];
        },
        invalidate() {},
      }));
    }
    if (bootstrap.model) {
      const model = ctx.modelRegistry.find(bootstrap.model.provider, bootstrap.model.id);
      if (model) await pi.setModel(model);
    }
    if (bootstrap.thinkingLevel) pi.setThinkingLevel(bootstrap.thinkingLevel);
    if (bootstrap.activeTools) {
      pi.setActiveTools([...new Set([...bootstrap.activeTools, "side_channel"])]);
    }
    const status: SideStatus = ephemeral ? "ready" : "saved";
    try {
      await notifyMain(bootstrap, status, sessionFile);
    } catch {
      ctx.ui.notify("Main side-chat broker is unavailable.", "warning");
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (ctx.mode === "tui") {
      ctx.ui.setWidget("side-chat-guide", undefined);
    }
    if (promotionInProgress) return;

    const sessionFile = ctx.sessionManager.getSessionFile();
    const ephemeral = sessionFile === bootstrap.temporarySession;
    try {
      await notifyMain(bootstrap, "closed", sessionFile);
    } catch {
      // The main process may already be gone.
    }
    if (ephemeral) {
      rmSync(bootstrap.temporaryDir, { recursive: true, force: true });
    }
  });

  pi.registerCommand("close", {
    description: "Discard this side chat and close its Herdr pane",
    handler: async (_args, ctx) => {
      ctx.shutdown();
    },
  });

  pi.registerCommand("save", {
    description: "Persist this ephemeral side chat as a normal Pi session",
    handler: async (args, ctx) => {
      if (ctx.sessionManager.getSessionFile() !== bootstrap.temporarySession) {
        ctx.ui.notify("This side chat is already saved.", "warning");
        return;
      }

      await ctx.waitForIdle();
      if (!existsSync(bootstrap.temporarySession)) {
        throw new Error("The ephemeral side session file no longer exists.");
      }

      const name = args.trim();
      if (name) pi.setSessionName(name);

      const destinationManager = SessionManager.create(ctx.cwd);
      const destination = destinationManager.getSessionFile();
      const destinationHeader = destinationManager.getHeader();
      if (!destination || !destinationHeader) throw new Error("Could not allocate a durable session file.");

      const source = readFileSync(bootstrap.temporarySession, "utf8");
      const newline = source.indexOf("\n");
      if (newline < 0) throw new Error("The ephemeral side session is malformed.");
      const body = source.slice(newline + 1);
      const header = {
        ...destinationHeader,
        ...(bootstrap.parentSessionFile ? { parentSession: bootstrap.parentSessionFile } : {}),
      };
      writeFileSync(destination, `${JSON.stringify(header)}\n${body}`, { flag: "wx", mode: 0o600 });

      promotionInProgress = true;
      try {
        const result = await ctx.switchSession(destination, {
          withSession: async (nextCtx) => {
            try {
              await notifyMain(bootstrap, "saved", destination);
            } catch {
              // Saving locally succeeded even if the broker disappeared.
            }
            rmSync(bootstrap.temporaryDir, { recursive: true, force: true });
            nextCtx.ui.notify(`Side chat saved as ${destinationManager.getSessionId()}.`, "info");
          },
        });
        if (result.cancelled) {
          rmSync(destination, { force: true });
          promotionInProgress = false;
          ctx.ui.notify("Saving the side chat was cancelled.", "warning");
        }
      } catch (error) {
        rmSync(destination, { force: true });
        promotionInProgress = false;
        throw error;
      }
    },
  });

  pi.registerCommand("send-summary", {
    description: "Ask the side agent to summarize and send this chat to the main session",
    handler: async (_args, _ctx) => {
      pi.sendUserMessage(
        "Summarize this side conversation and send the summary to the main session using side_channel with kind=summary.",
        { deliverAs: "followUp" },
      );
    },
  });

  pi.registerTool({
    name: "side_channel",
    label: "Side Channel",
    description:
      "Communicate with the main Pi session. Use fetch_main to retrieve main-session updates. Use send_main to deliver a summary, note, or question to the main session.",
    promptSnippet: "Fetch main-session updates or send a summary back to the main session.",
    parameters: SideChannelParams,
    async execute(_toolCallId, params: SideChannelParamsType, signal) {
      if (params.action === "fetch_main") {
        const data = await requestMain(bootstrap, {
          action: "fetch_main",
          ...(params.sinceEntryId ? { sinceEntryId: params.sinceEntryId } : {}),
        }, signal);
        return {
          content: [{ type: "text", text: formatFetchResult(data) }],
          details: data,
        };
      }

      if (!params.content?.trim()) throw new Error("send_main requires content.");
      const data = await requestMain(bootstrap, {
        action: "send_main",
        kind: params.kind ?? "note",
        content: params.content,
        delivery: params.delivery ?? "followUp",
      }, signal);
      return {
        content: [{ type: "text", text: "Accepted by the main Pi session." }],
        details: data,
      };
    },
    renderCall(args, theme) {
      const action = typeof args.action === "string" ? args.action : "side_channel";
      return new Text(theme.fg("toolTitle", theme.bold(action)), 0, 0);
    },
    renderResult(result, _options, theme) {
      const text = result.content[0]?.type === "text" ? result.content[0].text : "";
      return new Text(theme.fg(result.isError ? "error" : "dim", text), 0, 0);
    },
  });
}

function registerMainRuntime(pi: ExtensionAPI): void {
  let currentRuntime: { ctx: ExtensionContext; pi: ExtensionAPI } | undefined;
  const sides = new Map<string, SideRecord>();
  let broker: MainSideBroker | undefined;
  let sideWatcher: ReturnType<typeof setInterval> | undefined;
  let sideWatchInFlight = false;

  const stopSideWatcher = (): void => {
    if (!sideWatcher) return;
    clearInterval(sideWatcher);
    sideWatcher = undefined;
  };

  const reapMissingSides = async (): Promise<void> => {
    if (sideWatchInFlight) return;
    sideWatchInFlight = true;
    try {
      for (const side of [...sides.values()]) {
        if (!side.surfacePaneId || Date.now() - side.createdAt < 10_000) continue;
        if (await surfaceExists({ paneId: side.surfacePaneId })) continue;

        const wasSaved = side.phase === "saved";
        side.phase = "closed";
        sides.delete(side.sideId);
        if (!wasSaved) rmSync(side.temporaryDir, { recursive: true, force: true });
        await closeSurface({ paneId: side.surfacePaneId });
      }
    } finally {
      sideWatchInFlight = false;
      if (sides.size === 0) stopSideWatcher();
    }
  };

  const startSideWatcher = (): void => {
    if (sideWatcher) return;
    sideWatcher = setInterval(() => void reapMissingSides(), 5_000);
  };

  const getBroker = async (): Promise<MainSideBroker> => {
    if (!broker) {
      const options: MainBrokerOptions = {
        getRuntime: () => currentRuntime,
        getSide: (sideId) => sides.get(sideId),
        onStatus: async (request) => {
          const side = sides.get(request.sideId);
          if (!side) return;
          if (request.status === "saved") {
            side.phase = "saved";
            side.savedSessionFile = request.sessionFile;
            return;
          }
          if (request.status !== "closed") return;
          const wasSaved = side.phase === "saved";
          side.phase = "closed";
          if (!wasSaved) rmSync(side.temporaryDir, { recursive: true, force: true });
          sides.delete(side.sideId);
          if (side.surfacePaneId) {
            await closeSurface({ paneId: side.surfacePaneId });
          }
          if (sides.size === 0) stopSideWatcher();
        },
      };
      const candidate = new MainSideBroker(options);
      try {
        await candidate.start();
        broker = candidate;
      } catch (error) {
        await candidate.stop();
        throw error;
      }
    }
    return broker;
  };

  const launchSide = async (args: string, ctx: ExtensionContext, label: string): Promise<void> => {
    if (!isHerdrAvailable()) {
      ctx.ui.notify(`Side chats require Herdr. ${herdrSetupHint()}`, "error");
      return;
    }

    const sideId = randomUUID();
    const temporaryDir = mkdtempSync(join(tmpdir(), "pi-side-"));
    let snapshot: ReturnType<typeof writeJsonlSnapshot>;
    try {
      snapshot = writeJsonlSnapshot(ctx, sideId, temporaryDir);
    } catch (error) {
      rmSync(temporaryDir, { recursive: true, force: true });
      throw error;
    }
    const activeTools = [...new Set(pi.getActiveTools())];
    let runningBroker: MainSideBroker;
    try {
      runningBroker = await getBroker();
    } catch (error) {
      rmSync(temporaryDir, { recursive: true, force: true });
      throw error;
    }
    const brokerFields = runningBroker.getBootstrapFields();
    const bootstrap: SideBootstrap = {
      version: 1,
      sideId,
      temporaryDir,
      temporarySession: snapshot.temporarySession,
      brokerSocket: brokerFields.brokerSocket,
      token: brokerFields.token,
      ...(snapshot.parentSessionFile ? { parentSessionFile: snapshot.parentSessionFile } : {}),
      activeTools,
      ...(ctx.model ? { model: { provider: ctx.model.provider, id: ctx.model.id } } : {}),
      thinkingLevel: pi.getThinkingLevel(),
    };
    const bootstrapPath = join(temporaryDir, "bootstrap.json");
    try {
      writeBootstrap(bootstrapPath, bootstrap);
    } catch (error) {
      rmSync(temporaryDir, { recursive: true, force: true });
      throw error;
    }

    const side: SideRecord = {
      sideId,
      temporaryDir,
      temporarySession: snapshot.temporarySession,
      ...(snapshot.parentSessionFile ? { parentSessionFile: snapshot.parentSessionFile } : {}),
      createdAt: Date.now(),
      phase: "ephemeral",
    };
    sides.set(sideId, side);

    try {
      const surface: HerdrSurface = await createSplitSurface({
        label: `${label}:${sideId.slice(0, 8)}`,
        cwd: ctx.cwd,
        env: { PI_SIDE: "1", PI_SIDE_BOOTSTRAP: bootstrapPath },
        command: "pi",
        args: ["--session", snapshot.temporarySession, ...(args.trim() ? [args.trim()] : [])],
        signal: undefined,
      });
      side.surfacePaneId = surface.paneId;
      if (!sides.has(sideId)) {
        await closeSurface(surface);
        return;
      }
      startSideWatcher();
      ctx.ui.notify(`Opened ${label} side chat in Herdr.`, "info");
    } catch (error) {
      sides.delete(sideId);
      rmSync(temporaryDir, { recursive: true, force: true });
      throw error;
    }
  };

  pi.on("session_start", (_event, ctx) => {
    currentRuntime = { ctx, pi };
  });

  pi.on("session_shutdown", async () => {
    currentRuntime = undefined;
    stopSideWatcher();
    const activeSides = [...sides.values()];
    sides.clear();
    await Promise.allSettled(activeSides.map(async (side) => {
      if (side.phase !== "saved") rmSync(side.temporaryDir, { recursive: true, force: true });
      if (side.surfacePaneId) await closeSurface({ paneId: side.surfacePaneId });
    }));
    await broker?.stop();
    broker = undefined;
  });

  pi.registerCommand("side", {
    description: "Open an ephemeral side chat in a Herdr split pane",
    handler: async (args, ctx) => await launchSide(args, ctx, "side"),
  });

  pi.registerCommand("btw", {
    description: "Open a contextual side chat and optionally ask an initial question",
    handler: async (args, ctx) => await launchSide(args, ctx, "btw"),
  });
}

export default function sideChatExtension(pi: ExtensionAPI): void {
  const bootstrap = loadBootstrap();
  if (bootstrap) registerSideRuntime(pi, bootstrap);
  else registerMainRuntime(pi);
}
