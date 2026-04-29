import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { GroupJoinManager } from "./group-join.js";
import { SubagentManager } from "./manager.js";
import { getConversation, steerSubagent } from "./runner.js";
import type { AgentRecord, NotificationDetails } from "./types.js";
import { SubagentWidget } from "./widget.js";

function textResult(text: string, details?: unknown, isError = false) {
  return { content: [{ type: "text" as const, text }], details: details as any, isError };
}

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function preview(text: string | undefined, max = 700): string {
  const value = text?.trim() || "No output.";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function buildNotificationDetails(record: AgentRecord): NotificationDetails {
  return {
    id: record.id,
    description: record.description,
    status: record.status,
    toolUses: record.toolUses,
    turnCount: record.turnCount,
    durationMs: (record.completedAt ?? Date.now()) - record.startedAt,
    error: record.error,
    resultPreview: preview(record.result ?? record.error, 500),
  };
}

function formatRecordResult(record: AgentRecord, verbose = false): string {
  const duration = formatMs((record.completedAt ?? Date.now()) - record.startedAt);
  let output = [
    `Subagent: ${record.id}`,
    `Status: ${record.status}`,
    `Description: ${record.description}`,
    `Tool uses: ${record.toolUses}`,
    `Turns: ${record.turnCount}`,
    `Duration: ${duration}`,
    "",
  ].join("\n");

  if (record.status === "queued" || record.status === "running") {
    output += record.latestText.trim() ? `Still running. Latest text:\n${record.latestText.trim()}` : "Still running.";
  } else if (record.status === "error") {
    output += `Error: ${record.error ?? "unknown"}`;
  } else {
    output += record.result?.trim() || "No output.";
  }

  if (verbose && record.session) output += `\n\n--- Subagent Conversation ---\n${getConversation(record.session)}`;
  return output;
}

export default function minimalSubagents(pi: ExtensionAPI): void {
  const pendingNudges = new Map<string, ReturnType<typeof setTimeout>>();
  const currentBatchAgents: { id: string }[] = [];
  let batchFinalizeTimer: ReturnType<typeof setTimeout> | undefined;
  let batchCounter = 0;

  let manager!: SubagentManager;
  let widget!: SubagentWidget;

  function cancelNudge(key: string): void {
    const timer = pendingNudges.get(key);
    if (timer) clearTimeout(timer);
    pendingNudges.delete(key);
  }

  function scheduleNudge(key: string, fn: () => void, delay = 200): void {
    cancelNudge(key);
    pendingNudges.set(key, setTimeout(() => {
      pendingNudges.delete(key);
      fn();
    }, delay));
  }

  function sendNotification(records: AgentRecord[], partial: boolean): void {
    const unconsumed = records.filter((record) => !record.resultConsumed);
    if (unconsumed.length === 0) return;

    for (const record of unconsumed) {
      widget.markFinished(record.id);
    }

    if (unconsumed.length === 1 && !partial) {
      const record = unconsumed[0]!;
      scheduleNudge(record.id, () => {
        if (record.resultConsumed) return;
        pi.sendMessage<NotificationDetails>({
          customType: "subagent-notification",
          display: true,
          content: `Subagent completed: ${record.description}\n\n${preview(record.result ?? record.error, 1200)}\n\nUse get_subagent_result with agent_id=${record.id} for full output.`,
          details: buildNotificationDetails(record),
        }, { deliverAs: "followUp", triggerTurn: true });
      });
      return;
    }

    const key = `group:${unconsumed.map((record) => record.id).join(",")}`;
    scheduleNudge(key, () => {
      const stillUnconsumed = unconsumed.filter((record) => !record.resultConsumed);
      if (stillUnconsumed.length === 0) return;

      const [first, ...rest] = stillUnconsumed;
      const details = buildNotificationDetails(first!);
      if (rest.length > 0) details.others = rest.map(buildNotificationDetails);
      const heading = partial
        ? `${stillUnconsumed.length} subagent(s) finished (partial; others still running)`
        : `${stillUnconsumed.length} subagent(s) finished`;
      const summaries = stillUnconsumed.map((record) => {
        const status = record.status === "completed" ? "completed" : record.status;
        return `## ${record.description} (${record.id}) — ${status}\n${preview(record.result ?? record.error, 600)}`;
      }).join("\n\n");

      pi.sendMessage<NotificationDetails>({
        customType: "subagent-notification",
        display: true,
        content: `Subagent group completed: ${heading}\n\n${summaries}\n\nUse get_subagent_result for full output.`,
        details,
      }, { deliverAs: "followUp", triggerTurn: true });
    });
  }

  const groupJoin = new GroupJoinManager((records, partial) => {
    sendNotification(records, partial);
    widget.update();
  }, 30_000);

  manager = new SubagentManager(
    (record) => {
      pi.appendEntry("subagent-record", {
        id: record.id,
        description: record.description,
        status: record.status,
        startedAt: record.startedAt,
        completedAt: record.completedAt,
      });

      if (record.resultConsumed) {
        widget.markFinished(record.id);
        widget.update();
        return;
      }

      if (currentBatchAgents.some((agent) => agent.id === record.id)) {
        widget.update();
        return;
      }

      const result = groupJoin.onAgentComplete(record as any);
      if (result === "pass") sendNotification([record], false);
      widget.update();
    },
    () => widget.update(),
    () => widget.update(),
  );
  widget = new SubagentWidget(manager);

  function finalizeBatch(): void {
    batchFinalizeTimer = undefined;
    const batch = currentBatchAgents.splice(0, currentBatchAgents.length);
    if (batch.length >= 2) {
      const groupId = `batch-${++batchCounter}`;
      const ids = batch.map((agent) => agent.id);
      groupJoin.registerGroup(groupId, ids);
      for (const id of ids) {
        const record = manager.getRecord(id);
        if (!record) continue;
        record.groupId = groupId;
        if (record.completedAt && !record.resultConsumed) groupJoin.onAgentComplete(record as any);
      }
      return;
    }

    for (const { id } of batch) {
      const record = manager.getRecord(id);
      if (record?.completedAt && !record.resultConsumed) sendNotification([record], false);
    }
  }

  function trackForSmartGroup(id: string): void {
    currentBatchAgents.push({ id });
    if (batchFinalizeTimer) clearTimeout(batchFinalizeTimer);
    batchFinalizeTimer = setTimeout(finalizeBatch, 100);
  }

  pi.registerMessageRenderer<NotificationDetails>("subagent-notification", (message, { expanded }, theme) => {
    const detail = message.details;
    if (!detail) return undefined;
    const all = [detail, ...(detail.others ?? [])];
    const lines = all.map((d) => {
      const ok = d.status === "completed";
      const icon = ok ? theme.fg("success", "✓") : theme.fg("error", "✗");
      let line = `${icon} ${theme.bold(d.description)} ${theme.fg("dim", d.status)} ${theme.fg("dim", `· ${d.toolUses} tools · ${formatMs(d.durationMs)}`)}`;
      const text = expanded ? d.resultPreview : d.resultPreview.split("\n")[0];
      line += `\n  ${theme.fg("dim", `⎿ ${text}`)}`;
      return line;
    });
    return new Text(lines.join("\n"), 0, 0);
  });

  pi.registerTool({
    name: "dispatch_subagent",
    label: "Dispatch Subagent",
    description: "Start one background subagent using the current agent persona/system prompt. Fire-and-forget: this tool returns an agent ID immediately and the parent agent should normally respond to the user confidently instead of waiting for results. Completion notifications arrive later.",
    promptSnippet: "Dispatch fire-and-forget background subagents for independent work",
    promptGuidelines: [
      "Use dispatch_subagent to delegate independent, parallelizable research or implementation work to a background subagent.",
      "dispatch_subagent is fire-and-forget: after dispatching, normally stop and tell the user the subagent is running; do not immediately call get_subagent_result just to wait.",
      "Only call get_subagent_result when checking a subagent that is likely finished, when listing status, or when the user explicitly asks for the result.",
      "Never use get_subagent_result wait=true unless the user explicitly asks you to block for completion.",
      "Subagents reuse the current agent persona and system prompt. Provide clear, self-contained prompts.",
      "Use the skills parameter to preload named skills into a subagent when they are relevant; normal skill loading remains available.",
    ],
    parameters: Type.Object({
      description: Type.String({ description: "Short 3-6 word description shown in the UI." }),
      prompt: Type.String({ description: "The task for the background subagent." }),
      skills: Type.Optional(Type.Array(Type.String(), { description: "Named skills to preload into this subagent's prompt." })),
      inherit_context: Type.Optional(Type.Boolean({ description: "Include parent conversation history in the subagent task prompt. Default: false." })),
      max_turns: Type.Optional(Type.Number({ description: "Soft maximum agentic turns before the subagent is asked to wrap up." })),
      max_concurrent: Type.Optional(Type.Number({ description: "Set max concurrent background subagents. Default: 4." })),
    }),
    renderCall(args, theme) {
      return new Text(`▸ ${theme.fg("toolTitle", theme.bold("Subagent"))} ${theme.fg("muted", args.description ?? "")}`, 0, 0);
    },
    renderResult(result, _options, theme) {
      const text = result.content[0]?.type === "text" ? result.content[0].text : "";
      return new Text(theme.fg("dim", text), 0, 0);
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      widget.setUICtx(ctx.ui as any);
      widget.ensureTimer();
      if (params.max_concurrent != null) manager.setMaxConcurrent(params.max_concurrent);

      const id = manager.spawn(pi, ctx, {
        description: params.description,
        prompt: params.prompt,
        skills: params.skills,
        inheritContext: params.inherit_context,
        maxTurns: params.max_turns,
      });
      trackForSmartGroup(id);

      return textResult(
        `Subagent started in background.\nAgent ID: ${id}\nDescription: ${params.description}\n\nReturn to the user now; do not block waiting for this subagent unless the user explicitly asked you to. You will be notified when it completes. Use get_subagent_result with agent_id=${id} later to retrieve the result.`,
        { id, status: manager.getRecord(id)?.status },
      );
    },
  });

  pi.registerTool({
    name: "get_subagent_result",
    label: "Get Subagent Result",
    description: "Check status and retrieve output from a background subagent. Prefer non-blocking status checks; do not use wait=true unless the user explicitly asked to wait.",
    promptGuidelines: [
      "Use get_subagent_result without wait to check status or fetch an already-completed subagent.",
      "Do not call get_subagent_result with wait=true immediately after dispatch_subagent; return to the user and let the completion notification arrive instead.",
      "Use all=true to monitor currently queued/running subagents.",
    ],
    parameters: Type.Object({
      agent_id: Type.Optional(Type.String({ description: "Agent ID returned by dispatch_subagent. Omit with all=true to list all subagents." })),
      all: Type.Optional(Type.Boolean({ description: "List all known subagents." })),
      wait: Type.Optional(Type.Boolean({ description: "Block until the selected subagent finishes. Avoid this unless the user explicitly asks to wait." })),
      verbose: Type.Optional(Type.Boolean({ description: "Include the subagent conversation transcript." })),
    }),
    async execute(_toolCallId, params, signal) {
      if (params.all || !params.agent_id) {
        const records = manager.list();
        if (records.length === 0) return textResult("No subagents found.");
        return textResult(records.map((record) => `${record.id} · ${record.status} · ${record.description}`).join("\n"));
      }

      const record = manager.getRecord(params.agent_id);
      if (!record) return textResult(`Subagent not found: ${params.agent_id}`, undefined, true);

      if (params.wait && (record.status === "queued" || record.status === "running")) {
        const interrupted = await new Promise<boolean>((resolve) => {
          if (signal?.aborted) return resolve(true);
          const onAbort = () => resolve(true);
          signal?.addEventListener("abort", onAbort, { once: true });
          record.done.then(() => resolve(false)).finally(() => signal?.removeEventListener("abort", onAbort));
        });
        if (interrupted) {
          return textResult(`Stopped waiting for subagent ${record.id}; it is still ${record.status}. Use get_subagent_result later, or stop_subagent to kill it.`);
        }
      }

      if (record.status !== "queued" && record.status !== "running") {
        record.resultConsumed = true;
        cancelNudge(record.id);
      }

      return textResult(formatRecordResult(record, params.verbose));
    },
  });

  pi.registerTool({
    name: "steer_subagent",
    label: "Steer Subagent",
    description: "Send a steering message to a running background subagent.",
    parameters: Type.Object({
      agent_id: Type.String({ description: "Agent ID to steer." }),
      message: Type.String({ description: "Message to inject into the subagent conversation." }),
    }),
    async execute(_toolCallId, params) {
      const record = manager.getRecord(params.agent_id);
      if (!record) return textResult(`Subagent not found: ${params.agent_id}`, undefined, true);
      if (record.status !== "running" && record.status !== "queued") return textResult(`Subagent ${record.id} is ${record.status}; cannot steer.`);
      if (!record.session) {
        record.pendingSteers ??= [];
        record.pendingSteers.push(params.message);
        return textResult(`Steering message queued for subagent ${record.id}.`);
      }
      await steerSubagent(record.session, params.message);
      return textResult(`Steering message sent to subagent ${record.id}.`);
    },
  });

  pi.registerTool({
    name: "stop_subagent",
    label: "Stop Subagent",
    description: "Stop a queued or running background subagent.",
    parameters: Type.Object({ agent_id: Type.String({ description: "Agent ID to stop." }) }),
    async execute(_toolCallId, params) {
      return manager.abort(params.agent_id)
        ? textResult(`Stopped subagent ${params.agent_id}.`)
        : textResult(`Subagent ${params.agent_id} was not found or is not running.`, undefined, true);
    },
  });

  pi.registerCommand("subagents", {
    description: "List background subagents and show their status",
    handler: async (args) => {
      const verbose = args.trim() === "--verbose" || args.trim() === "-v";
      const records = manager.list();
      const content = records.length === 0
        ? "No subagents found."
        : records.map((record) => formatRecordResult(record, verbose)).join("\n\n---\n\n");
      pi.sendMessage({
        customType: "subagent-command",
        display: true,
        content,
      });
    },
  });

  pi.registerCommand("subagent-result", {
    description: "Show a subagent result by id; use --verbose for transcript",
    handler: async (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const id = parts.find((part) => !part.startsWith("-"));
      const verbose = parts.includes("--verbose") || parts.includes("-v");
      if (!id) {
        pi.sendMessage({ customType: "subagent-command", display: true, content: "Usage: /subagent-result <id> [--verbose]" });
        return;
      }
      const record = manager.getRecord(id);
      if (!record) {
        pi.sendMessage({ customType: "subagent-command", display: true, content: `Subagent not found: ${id}` });
        return;
      }
      if (record.status !== "queued" && record.status !== "running") {
        record.resultConsumed = true;
        cancelNudge(record.id);
      }
      pi.sendMessage({ customType: "subagent-command", display: true, content: formatRecordResult(record, verbose) });
    },
  });

  pi.registerCommand("subagent-stop", {
    description: "Stop a queued or running subagent by id, or use 'all'",
    handler: async (args) => {
      const id = args.trim();
      if (!id) {
        pi.sendMessage({ customType: "subagent-command", display: true, content: "Usage: /subagent-stop <id|all>" });
        return;
      }
      if (id === "all") {
        manager.abortAll();
        pi.sendMessage({ customType: "subagent-command", display: true, content: "Stopped all queued/running subagents." });
        return;
      }
      const ok = manager.abort(id);
      pi.sendMessage({
        customType: "subagent-command",
        display: true,
        content: ok ? `Stopped subagent ${id}.` : `Subagent ${id} was not found or is not running.`,
      });
    },
  });

  pi.on("tool_execution_start", async (_event, ctx) => {
    widget.setUICtx(ctx.ui as any);
    widget.onTurnStart();
  });

  pi.on("session_shutdown", async () => {
    if (batchFinalizeTimer) clearTimeout(batchFinalizeTimer);
    groupJoin.dispose();
    for (const timer of pendingNudges.values()) clearTimeout(timer);
    pendingNudges.clear();
    widget.dispose();
    manager.dispose();
  });
}
