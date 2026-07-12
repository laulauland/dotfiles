import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import { writeFileSync } from "node:fs";
import { createSubagentActivityRecorder, type SubagentShutdownReason } from "./activity.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function eventRecord(event: unknown): Record<string, unknown> | undefined {
  return isRecord(event) ? event : undefined;
}

function eventString(event: unknown, key: string): string | undefined {
  const value = eventRecord(event)?.[key];
  return typeof value === "string" ? value : undefined;
}

function eventNumber(event: unknown, key: string): number | undefined {
  const value = eventRecord(event)?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function eventMessages(event: unknown): unknown[] | undefined {
  const value = eventRecord(event)?.messages;
  return Array.isArray(value) ? value : undefined;
}

function nestedEventString(event: unknown, outerKey: string, innerKey: string): string | undefined {
  const nested = eventRecord(event)?.[outerKey];
  return eventString(nested, innerKey);
}

function latestAssistantMessage(messages: unknown[] | undefined): Record<string, unknown> | undefined {
  if (!messages) return undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!isRecord(message) || message.role !== "assistant") continue;
    return message;
  }
  return undefined;
}

function hasLatestAssistantStopReason(messages: unknown[] | undefined, stopReason: string): boolean {
  return latestAssistantMessage(messages)?.stopReason === stopReason;
}

function findLatestAssistantError(messages: unknown[] | undefined): { errorMessage: string; stopReason: "error" } | null {
  const message = latestAssistantMessage(messages);
  if (!message || message.stopReason !== "error") return null;
  const errorMessage = typeof message.errorMessage === "string" ? message.errorMessage.trim() : "";
  return {
    errorMessage: errorMessage || "Subagent agent loop ended with stopReason=error (no errorMessage field).",
    stopReason: "error",
  };
}

function shutdownReason(event: unknown): SubagentShutdownReason {
  const reason = eventString(event, "reason");
  return reason === "quit" || reason === "reload" || reason === "new" || reason === "resume" || reason === "fork" ? reason : "reload";
}

/** Register the child-side activity recorder and compact tool widget. */
export default function herdrSubagentChild(pi: ExtensionAPI): void {
  let toolNames: string[] = [];
  let expanded = false;
  let latestAgentError: { errorMessage: string; stopReason: "error" } | null = null;
  let agentWasAborted = false;

  const subagentTask = process.env.PI_SUBAGENT_TASK ?? "";
  const recorder = createSubagentActivityRecorder({
    runningChildId: process.env.PI_SUBAGENT_ID,
    activityFile: process.env.PI_SUBAGENT_ACTIVITY_FILE,
  });

  function renderWidget(ctx: ExtensionContext): void {
    ctx.ui.setWidget(
      "subagent-tools",
      (_tui, theme) => {
        const box = new Box(1, 0, (text: string) => theme.bg("toolSuccessBg", text));
        const taskLabel = subagentTask ? theme.bold(theme.fg("accent", `[${subagentTask}]`)) : "";
        const toolList = toolNames.map((name) => theme.fg("dim", name)).join(theme.fg("muted", ", "));

        if (expanded) {
          box.addChild(new Text(`${taskLabel}${theme.fg("dim", ` — ${toolNames.length} available`)}${theme.fg("muted", "  (Ctrl+J to collapse)")}\n${toolList}`, 0, 0));
        } else {
          box.addChild(new Text(`${taskLabel}${theme.fg("dim", ` — ${toolNames.length} tools`)}${theme.fg("muted", "  (Ctrl+J to expand)")}`, 0, 0));
        }

        return box;
      },
      { placement: "aboveEditor" },
    );
  }

  pi.on("session_start", (_event, ctx) => {
    recorder.sessionStart();
    toolNames = pi.getActiveTools().sort();
    renderWidget(ctx);
  });

  pi.on("input", () => recorder.input());
  pi.on("before_agent_start", () => recorder.beforeAgentStart());
  pi.on("agent_start", () => {
    agentWasAborted = false;
    latestAgentError = null;
    recorder.agentStart();
  });
  pi.on("agent_end", (event) => {
    const messages = eventMessages(event);
    latestAgentError = findLatestAssistantError(messages);
    agentWasAborted = hasLatestAssistantStopReason(messages, "aborted");
    if (agentWasAborted) recorder.agentInterrupted();
  });
  pi.on("agent_settled", () => {
    if (agentWasAborted) return;
    const sessionFile = process.env.PI_SUBAGENT_SESSION;
    if (sessionFile) {
      try {
        writeFileSync(`${sessionFile}.exit`, JSON.stringify(latestAgentError ? { type: "error", ...latestAgentError } : { type: "settled" }));
      } catch {}
    }
    // The parent owns this settled tab and closes it on its next input or shutdown.
    recorder.agentSettled();
  });
  pi.on("turn_start", (event) => recorder.turnStart(eventNumber(event, "turnIndex")));
  pi.on("turn_end", (event) => recorder.turnEnd(eventNumber(event, "turnIndex")));
  pi.on("before_provider_request", () => recorder.beforeProviderRequest());
  pi.on("after_provider_response", () => recorder.afterProviderResponse());
  pi.on("message_update", (event) => recorder.messageUpdate(nestedEventString(event, "assistantMessageEvent", "type")));
  pi.on("tool_execution_start", (event) => recorder.toolExecutionStart(eventString(event, "toolCallId"), eventString(event, "toolName")));
  pi.on("tool_call", (event) => recorder.toolCall(eventString(event, "toolCallId"), eventString(event, "toolName")));
  pi.on("tool_execution_update", (event) => recorder.toolExecutionUpdate(eventString(event, "toolCallId"), eventString(event, "toolName")));
  pi.on("tool_result", (event) => recorder.toolResult(eventString(event, "toolCallId"), eventString(event, "toolName")));
  pi.on("tool_execution_end", (event) => recorder.toolExecutionEnd(eventString(event, "toolCallId"), eventString(event, "toolName")));
  pi.on("session_shutdown", (event) => recorder.sessionShutdown(shutdownReason(event)));

  pi.registerShortcut("ctrl+j", {
    description: "Toggle subagent tools widget",
    handler: (ctx) => {
      expanded = !expanded;
      renderWidget(ctx);
    },
  });
}
