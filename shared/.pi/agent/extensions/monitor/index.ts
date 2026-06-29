import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { keyHint } from "@earendil-works/pi-coding-agent";
import { Box, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
  getMonitor,
  listMonitors,
  startMonitor,
  stopAllMonitors,
  stopMonitor,
  type MonitorToolParams,
} from "./monitor.ts";

const MonitorAction = Type.Union([
  Type.Literal("start"),
  Type.Literal("list"),
  Type.Literal("status"),
  Type.Literal("stop"),
]);

const MonitorParams = Type.Object({
  action: MonitorAction,
  id: Type.Optional(Type.String({ description: "Running monitor id for status/stop" })),
  name: Type.Optional(Type.String({ description: "Display name for start, or exact running monitor name for status/stop" })),
  command: Type.Optional(Type.String({ description: "Shell command whose stdout is the event stream for action=start" })),
  cwd: Type.Optional(Type.String({ description: "Working directory for the monitor command. Defaults to current project cwd." })),
  filter: Type.Optional(Type.String({ description: "String or regex filter. Matching output lines wake the main session. If omitted, every line matches." })),
  regex: Type.Optional(Type.Boolean({ description: "Treat filter as a JavaScript regular expression. Default false." })),
  includeStderr: Type.Optional(Type.Boolean({ description: "Also monitor stderr lines. Default true." })),
  notifyOnExit: Type.Optional(Type.Boolean({ description: "Wake the main session when the monitor process exits. Default true." })),
  maxEvents: Type.Optional(Type.Number({ description: "Maximum matching events to steer into the session before suppressing further matches. Default 100, max 1000." })),
});

type MonitorParamsType = typeof MonitorParams.static;

function handleMonitor(params: MonitorParamsType, ctx: ExtensionContext, pi: ExtensionAPI) {
  switch (params.action as MonitorToolParams["action"]) {
    case "start": {
      if (!params.command?.trim()) {
        return { content: [{ type: "text" as const, text: "monitor action=start requires command." }], details: { error: "missing command" }, isError: true };
      }
      let record;
      try {
        record = startMonitor({
          name: params.name,
          command: params.command,
          cwd: params.cwd ?? ctx.cwd,
          filter: params.filter,
          regex: params.regex,
          includeStderr: params.includeStderr,
          notifyOnExit: params.notifyOnExit,
          maxEvents: params.maxEvents,
        }, pi);
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Failed to start monitor: ${error?.message ?? String(error)}` }], details: { error: error?.message ?? String(error) }, isError: true };
      }
      return {
        content: [{ type: "text" as const, text: `Monitor "${record.name}" started. Matching output lines will wake this session; do not poll for this condition.` }],
        details: { action: "start", monitor: record, status: "started" },
      };
    }
    case "list": {
      const records = listMonitors();
      if (records.length === 0) return { content: [{ type: "text" as const, text: "No running monitors." }], details: { monitors: [] } };
      const lines = records.map((record) => `• ${record.name} [${record.id}] — ${record.matchedEvents} matches / ${record.totalLines} lines — ${record.command}`);
      return { content: [{ type: "text" as const, text: lines.join("\n") }], details: { monitors: records } };
    }
    case "status": {
      if (!params.id && !params.name) {
        const records = listMonitors();
        return { content: [{ type: "text" as const, text: JSON.stringify(records, null, 2) }], details: { monitors: records } };
      }
      const record = getMonitor(params);
      if (!record) return { content: [{ type: "text" as const, text: "No matching running monitor." }], details: { error: "not found" }, isError: true };
      return { content: [{ type: "text" as const, text: JSON.stringify(record, null, 2) }], details: { monitor: record } };
    }
    case "stop": {
      const record = stopMonitor(params);
      if (!record) return { content: [{ type: "text" as const, text: "No matching running monitor." }], details: { error: "not found" }, isError: true };
      return { content: [{ type: "text" as const, text: `Stop requested for monitor "${record.name}".` }], details: { action: "stop", monitor: record, status: "stop_requested" } };
    }
    default:
      return { content: [{ type: "text" as const, text: `Unknown monitor action: ${(params as any).action}` }], details: { error: "unknown action" }, isError: true };
  }
}

export default function monitorExtension(pi: ExtensionAPI): void {
  pi.on("session_shutdown", () => {
    stopAllMonitors();
  });

  pi.registerTool({
    name: "monitor",
    label: "Monitor",
    description:
      "Event-driven observation of a background shell command. Use action=start to run a command whose output lines become an event stream; matching lines are delivered automatically as steer messages that wake the main session. Use this instead of polling files/processes. Include terminal-state filters that catch success and failure, e.g. Done|Traceback|Error|FAILED. Use list/status for occasional inspection and stop to terminate a monitor.",
    promptSnippet:
      "Use monitor({ action: 'start', command, filter }) for event-driven background observation. Matching output lines wake you automatically; do not poll. Make filters catch terminal success and failure states such as Done|Traceback|Error|FAILED.",
    parameters: MonitorParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return handleMonitor(params, ctx, pi);
    },
    renderCall(args, theme) {
      const action = typeof args.action === "string" ? args.action : "start";
      const name = typeof args.name === "string" && args.name ? args.name : typeof args.id === "string" ? args.id : "monitor";
      const command = typeof args.command === "string" ? args.command : "";
      const filter = typeof args.filter === "string" ? args.filter : "";
      let text = "▸ " + theme.fg("toolTitle", theme.bold(name)) + theme.fg("dim", ` — monitor ${action}`);
      if (command) text += "\n" + theme.fg("toolOutput", command.length > 100 ? command.slice(0, 100) + "…" : command);
      if (filter) text += "\n" + theme.fg("dim", `filter: ${filter}`);
      return new Text(text, 0, 0);
    },
    renderResult(result, _opts, theme) {
      const details = result.details as any;
      const monitor = details?.monitor;
      if (details?.status === "started" && monitor) {
        return new Text(theme.fg("accent", "▸") + " " + theme.fg("toolTitle", theme.bold(monitor.name ?? "monitor")) + theme.fg("dim", " — monitoring"), 0, 0);
      }
      if (details?.status === "stop_requested" && monitor) {
        return new Text(theme.fg("accent", "▸") + " " + theme.fg("toolTitle", theme.bold(monitor.name ?? "monitor")) + theme.fg("dim", " — stop requested"), 0, 0);
      }
      const text = typeof result.content[0]?.text === "string" ? result.content[0].text : "";
      return new Text(theme.fg("dim", text), 0, 0);
    },
  });

  pi.registerMessageRenderer("monitor_event", (message, options, theme) => ({
    render(width: number): string[] {
      const details = message.details as any;
      const name = details?.name ?? "monitor";
      const source = details?.source ?? "output";
      const line = typeof details?.line === "string" ? details.line : String(message.content ?? "");
      const contentLines = [
        `${theme.fg("accent", "•")} ${theme.fg("toolTitle", theme.bold(name))} ${theme.fg("dim", `matched ${source}`)}`,
        theme.fg("toolOutput", truncateToWidth(line, Math.max(0, width - 6))),
      ];
      if (options.expanded) {
        contentLines.push("", theme.fg("dim", `Command: ${details?.command ?? ""}`));
      } else {
        contentLines.push(theme.fg("muted", keyHint("app.tools.expand", "to expand")));
      }
      const box = new Box(1, 1, (text: string) => theme.bg("customMessageBg", text));
      box.addChild(new Text(contentLines.join("\n"), 0, 0));
      return ["", ...box.render(width)];
    },
  }));

  pi.registerMessageRenderer("monitor_exit", (message, _options, theme) => ({
    render(width: number): string[] {
      const details = message.details as any;
      const name = details?.name ?? "monitor";
      const exit = details?.exited;
      const status = exit?.signal ? `signal ${exit.signal}` : `code ${exit?.code ?? "unknown"}`;
      const box = new Box(1, 1, (text: string) => theme.bg("customMessageBg", text));
      box.addChild(new Text(`${theme.fg("toolTitle", theme.bold(name))} ${theme.fg("dim", `exited with ${status}`)}`, 0, 0));
      return ["", ...box.render(width)];
    },
  }));
}
