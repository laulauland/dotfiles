import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { writeFileSync } from "node:fs";
import { createSubagentActivityRecorder } from "./activity.ts";

function parseDeniedTools(rawValue: string | undefined): string[] {
  return (rawValue ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function findLatestAssistantError(messages: any[] | undefined): { errorMessage: string; stopReason: "error" } | null {
  if (!messages) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "assistant") continue;
    if (message.stopReason !== "error") return null;
    const raw = typeof message.errorMessage === "string" ? message.errorMessage.trim() : "";
    return {
      errorMessage: raw || "Subagent agent loop ended with stopReason=error (no errorMessage field).",
      stopReason: "error",
    };
  }
  return null;
}

function shouldAutoExitOnAgentEnd(messages: any[] | undefined): boolean {
  if (!messages) return true;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "assistant") return message.stopReason !== "aborted";
  }
  return true;
}

export default function herdrSubagentChild(pi: ExtensionAPI): void {
  let toolNames: string[] = [];
  let denied: string[] = [];
  let expanded = false;

  const subagentName = process.env.PI_SUBAGENT_NAME ?? "";
  const subagentAgent = process.env.PI_SUBAGENT_AGENT ?? "";
  const deniedToolsValue = process.env.PI_DENY_TOOLS;
  const autoExit = process.env.PI_SUBAGENT_AUTO_EXIT === "1";
  const recorder = createSubagentActivityRecorder({
    runningChildId: process.env.PI_SUBAGENT_ID,
    activityFile: process.env.PI_SUBAGENT_ACTIVITY_FILE,
  });

  function renderWidget(ctx: { ui: { setWidget: Function } }): void {
    ctx.ui.setWidget(
      "subagent-tools",
      (_tui: any, theme: any) => {
        const box = new Box(1, 0, (text: string) => theme.bg("toolSuccessBg", text));
        const label = subagentAgent || subagentName;
        const agentTag = label ? theme.bold(theme.fg("accent", `[${label}]`)) : "";

        if (expanded) {
          const toolList = toolNames.map((name) => theme.fg("dim", name)).join(theme.fg("muted", ", "));
          const deniedLine = denied.length > 0
            ? "\n" + theme.fg("muted", "denied: ") + denied.map((name) => theme.fg("error", name)).join(theme.fg("muted", ", "))
            : "";
          box.addChild(new Text(`${agentTag}${theme.fg("dim", ` — ${toolNames.length} available`)}${theme.fg("muted", "  (Ctrl+J to collapse)")}\n${toolList}${deniedLine}`, 0, 0));
        } else {
          const deniedInfo = denied.length > 0 ? theme.fg("dim", " · ") + theme.fg("error", `${denied.length} denied`) : "";
          box.addChild(new Text(`${agentTag}${theme.fg("dim", ` — ${toolNames.length} tools`)}${deniedInfo}${theme.fg("muted", "  (Ctrl+J to expand)")}`, 0, 0));
        }

        return box;
      },
      { placement: "aboveEditor" },
    );
  }

  pi.on("session_start", (_event, ctx) => {
    recorder.sessionStart();
    toolNames = pi.getAllTools().map((tool) => tool.name).sort();
    denied = parseDeniedTools(deniedToolsValue);
    renderWidget(ctx);
  });

  pi.on("input", () => recorder.input());
  pi.on("before_agent_start", () => recorder.beforeAgentStart());
  pi.on("agent_start", () => recorder.agentStart());
  pi.on("agent_end", (event, ctx) => {
    const messages = (event as any).messages as any[] | undefined;
    if (autoExit && shouldAutoExitOnAgentEnd(messages)) {
      const errorInfo = findLatestAssistantError(messages);
      const sessionFile = process.env.PI_SUBAGENT_SESSION;
      if (errorInfo && sessionFile) {
        try {
          writeFileSync(`${sessionFile}.exit`, JSON.stringify({ type: "error", ...errorInfo }));
        } catch {}
      }
      recorder.agentEndDone();
      ctx.shutdown();
      return;
    }
    recorder.agentEndWaiting();
  });
  pi.on("turn_start", (event) => recorder.turnStart((event as any).turnIndex));
  pi.on("turn_end", (event) => recorder.turnEnd((event as any).turnIndex));
  pi.on("before_provider_request", () => recorder.beforeProviderRequest());
  pi.on("after_provider_response", () => recorder.afterProviderResponse());
  pi.on("message_update", (event) => recorder.messageUpdate((event as any).assistantMessageEvent?.type));
  pi.on("tool_execution_start", (event) => recorder.toolExecutionStart((event as any).toolCallId, (event as any).toolName));
  pi.on("tool_call", (event) => recorder.toolCall((event as any).toolCallId, (event as any).toolName));
  pi.on("tool_execution_update", (event) => recorder.toolExecutionUpdate((event as any).toolCallId, (event as any).toolName));
  pi.on("tool_result", (event) => recorder.toolResult((event as any).toolCallId, (event as any).toolName));
  pi.on("tool_execution_end", (event) => recorder.toolExecutionEnd((event as any).toolCallId, (event as any).toolName));
  pi.on("session_shutdown", (event) => recorder.sessionShutdown((event as any).reason));

  pi.registerShortcut("ctrl+j", {
    description: "Toggle subagent tools widget",
    handler: (ctx) => {
      expanded = !expanded;
      renderWidget(ctx);
    },
  });

  pi.registerTool({
    name: "subagent_done",
    label: "Subagent Done",
    description:
      "Call this tool when you have completed your task. It closes this child session and returns your last assistant message to the parent session.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const sessionFile = process.env.PI_SUBAGENT_SESSION;
      recorder.subagentDone();
      if (sessionFile) writeFileSync(`${sessionFile}.exit`, JSON.stringify({ type: "done" }));
      ctx.shutdown();
      return { content: [{ type: "text", text: "Shutting down subagent session." }], details: {} };
    },
  });
}
