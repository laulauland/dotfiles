import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server, Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export interface SideBootstrap {
  readonly version: 1;
  readonly sideId: string;
  readonly temporaryDir: string;
  readonly temporarySession: string;
  readonly brokerSocket: string;
  readonly token: string;
  readonly parentSessionFile?: string;
  readonly activeTools?: readonly string[];
  readonly model?: Readonly<{ provider: string; id: string }>;
  readonly thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
}

export type SideStatus = "ready" | "saved" | "closed";

type FetchRequest = {
  readonly action: "fetch_main";
  readonly sideId: string;
  readonly sinceEntryId?: string;
};

type SendRequest = {
  readonly action: "send_main";
  readonly sideId: string;
  readonly kind: "summary" | "note" | "question";
  readonly content: string;
  readonly delivery: "steer" | "followUp";
};

export interface StatusRequest {
  readonly action: "side_status";
  readonly sideId: string;
  readonly status: SideStatus;
  readonly sessionFile?: string;
};

export type SideRequest = FetchRequest | SendRequest | StatusRequest;

export interface MainRuntime {
  readonly ctx: ExtensionContext;
  readonly pi: ExtensionAPI;
}

export interface SideRecord {
  readonly sideId: string;
  readonly temporaryDir: string;
  readonly temporarySession: string;
  readonly parentSessionFile?: string;
  readonly createdAt: number;
  surfacePaneId?: string;
  phase: "ephemeral" | "saved" | "closed";
  savedSessionFile?: string;
}

export interface MainBrokerOptions {
  readonly getRuntime: () => MainRuntime | undefined;
  readonly getSide: (sideId: string) => SideRecord | undefined;
  readonly onStatus: (request: StatusRequest) => Promise<void> | void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  return typeof value[key] === "string" ? value[key] : undefined;
}

function parseRequest(value: unknown): SideRequest {
  if (!isRecord(value)) throw new Error("Request must be an object.");
  const action = value.action;
  const sideId = stringField(value, "sideId")?.trim();
  if (typeof action !== "string" || !sideId) throw new Error("Request requires action and sideId.");

  if (action === "fetch_main") {
    const sinceEntryId = stringField(value, "sinceEntryId")?.trim();
    return { action, sideId, ...(sinceEntryId ? { sinceEntryId } : {}) };
  }

  if (action === "send_main") {
    const kind = value.kind;
    const delivery = value.delivery;
    const content = stringField(value, "content");
    if (
      (kind !== "summary" && kind !== "note" && kind !== "question") ||
      (delivery !== "steer" && delivery !== "followUp") ||
      content === undefined ||
      content.trim() === ""
    ) {
      throw new Error("send_main requires kind, content, and a valid delivery.");
    }
    return { action, sideId, kind, content, delivery };
  }

  if (action === "side_status") {
    const status = value.status;
    if (status !== "ready" && status !== "saved" && status !== "closed") {
      throw new Error("side_status requires a valid status.");
    }
    const sessionFile = stringField(value, "sessionFile");
    return { action, sideId, status, ...(sessionFile ? { sessionFile } : {}) };
  }

  throw new Error(`Unknown broker action: ${action}`);
}

function response(ok: true, data: unknown): string;
function response(ok: false, error: string): string;
function response(ok: boolean, value: unknown): string {
  return `${JSON.stringify(ok ? { ok: true, data: value } : { ok: false, error: value })}\n`;
}

export class MainSideBroker {
  private readonly options: MainBrokerOptions;
  private readonly sockets = new Set<Socket>();
  private server: Server | undefined;
  private brokerDir: string | undefined;
  private socketPath: string | undefined;
  private token: string | undefined;

  constructor(options: MainBrokerOptions) {
    this.options = options;
  }

  getBootstrapFields(): Pick<SideBootstrap, "brokerSocket" | "token"> {
    if (!this.socketPath || !this.token) throw new Error("Side broker is not running.");
    return { brokerSocket: this.socketPath, token: this.token };
  }

  async start(): Promise<void> {
    if (this.server) return;

    this.brokerDir = mkdtempSync(join(tmpdir(), "pi-side-broker-"));
    this.socketPath = join(this.brokerDir, "broker.sock");
    this.token = randomBytes(32).toString("hex");
    this.server = createServer((socket) => this.handleConnection(socket));
    const server = this.server;
    if (!server) throw new Error("Could not start the side broker server.");

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.socketPath);
    });
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();

    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }

    if (this.brokerDir) rmSync(this.brokerDir, { recursive: true, force: true });
    this.brokerDir = undefined;
    this.socketPath = undefined;
    this.token = undefined;
  }

  private handleConnection(socket: Socket): void {
    this.sockets.add(socket);
    let buffer = "";
    let handled = false;

    const finish = () => {
      this.sockets.delete(socket);
      socket.destroy();
    };

    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      if (handled) return;
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      handled = true;
      const line = buffer.slice(0, newline).trim();
      void this.handleLine(line)
        .then((body) => socket.end(body))
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          socket.end(response(false, message));
        })
        .finally(() => {
          socket.once("close", finish);
        });
    });
    socket.on("error", finish);
    socket.on("close", () => this.sockets.delete(socket));
  }

  private async handleLine(line: string): Promise<string> {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      return response(false, "Invalid JSON request.");
    }
    if (!isRecord(raw)) return response(false, "Invalid request envelope.");

    const token = stringField(raw, "token");
    if (!token || token !== this.token) return response(false, "Unauthorized side request.");

    let request: SideRequest;
    try {
      request = parseRequest(raw);
    } catch (error: unknown) {
      return response(false, error instanceof Error ? error.message : String(error));
    }

    if (!this.options.getSide(request.sideId)) return response(false, "Unknown side session.");

    if (request.action === "side_status") {
      await this.options.onStatus(request);
      return response(true, { status: request.status });
    }

    const runtime = this.options.getRuntime();
    if (!runtime) return response(false, "Main Pi session is unavailable.");

    if (request.action === "fetch_main") {
      const branch = runtime.ctx.sessionManager.getBranch();
      const sinceIndex = request.sinceEntryId
        ? branch.findIndex((entry) => entry.id === request.sinceEntryId)
        : -1;
      const reset = Boolean(request.sinceEntryId && sinceIndex === -1);
      const entries = reset ? branch : request.sinceEntryId ? branch.slice(sinceIndex + 1) : branch;
      return response(true, {
        sessionId: runtime.ctx.sessionManager.getSessionId(),
        leafId: runtime.ctx.sessionManager.getLeafId(),
        busy: !runtime.ctx.isIdle(),
        reset,
        entries,
      });
    }

    const prefix =
      request.kind === "summary"
        ? `Summary from side chat ${request.sideId}:\n\n`
        : request.kind === "question"
          ? `Question from side chat ${request.sideId}:\n\n`
          : `Update from side chat ${request.sideId}:\n\n`;

    runtime.pi.sendUserMessage(`${prefix}${request.content}`, { deliverAs: request.delivery });
    return response(true, { accepted: true, delivery: request.delivery });
  }
}

export async function requestMain<T>(
  bootstrap: SideBootstrap,
  request: Omit<SideRequest, "sideId">,
  signal?: AbortSignal,
): Promise<T> {
  const payload = JSON.stringify({
    ...request,
    sideId: bootstrap.sideId,
    token: bootstrap.token,
    requestId: randomUUID(),
  });

  return await new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Side broker request aborted."));
      return;
    }
    const socket = new Socket();
    let buffer = "";
    let settled = false;
    const settleError = (error: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    };
    const onAbort = () => settleError(new Error("Side broker request aborted."));

    signal?.addEventListener("abort", onAbort, { once: true });
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline === -1 || settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      try {
        const raw: unknown = JSON.parse(buffer.slice(0, newline));
        if (!isRecord(raw) || raw.ok !== true) {
          throw new Error(isRecord(raw) && typeof raw.error === "string" ? raw.error : "Invalid broker response.");
        }
        resolve(raw.data as T);
      } catch (error: unknown) {
        reject(error instanceof Error ? error : new Error(String(error)));
      } finally {
        socket.end();
      }
    });
    socket.on("error", (error) => settleError(error));
    socket.connect(bootstrap.brokerSocket, () => socket.write(`${payload}\n`));
  });
}

export async function notifyMain(bootstrap: SideBootstrap, status: SideStatus, sessionFile?: string): Promise<void> {
  await requestMain(bootstrap, {
    action: "side_status",
    status,
    ...(sessionFile ? { sessionFile } : {}),
  });
}
