import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
  type ExtensionAPI,
  type ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { preloadSkills } from "./skill-loader.js";

const SELF_TOOLS = new Set(["dispatch_subagent", "get_subagent_result", "steer_subagent", "stop_subagent"]);

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part: any) => part?.type === "text")
    .map((part: any) => part.text ?? "")
    .join("\n");
}

function buildParentContext(ctx: ExtensionContext): string {
  const entries = ctx.sessionManager.getBranch();
  const parts: string[] = [];

  for (const entry of entries) {
    if (entry.type === "message") {
      const msg = entry.message;
      if (msg.role === "user" || msg.role === "assistant") {
        const text = extractText(msg.content).trim();
        if (text) parts.push(`[${msg.role}]: ${text}`);
      }
    } else if (entry.type === "compaction" && entry.summary) {
      parts.push(`[summary]: ${entry.summary}`);
    }
  }

  if (parts.length === 0) return "";
  return `# Parent Conversation Context\nThe subagent was spawned from a parent conversation. Relevant parent context follows.\n\n${parts.join("\n\n")}\n\n---\n# Subagent Task\n`;
}

function lastAssistantText(session: AgentSession): string {
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const msg = session.messages[i];
    if (msg?.role !== "assistant") continue;
    const text = extractText(msg.content).trim();
    if (text) return text;
  }
  return "";
}

export interface RunSubagentOptions {
  pi: ExtensionAPI;
  prompt: string;
  skills?: string[];
  inheritContext?: boolean;
  maxTurns?: number;
  signal: AbortSignal;
  onSession?: (session: AgentSession) => void;
  onText?: (fullText: string) => void;
  onTool?: (toolName: string, phase: "start" | "end") => void;
  onTurnEnd?: (turnCount: number) => void;
}

export async function runSubagent(ctx: ExtensionContext, options: RunSubagentOptions): Promise<{ text: string; session: AgentSession; aborted: boolean }> {
  const agentDir = getAgentDir();
  const skillBlocks = preloadSkills(options.skills ?? [], ctx.cwd).map(
    (skill) => `# Preloaded Skill: ${skill.name}\n${skill.content}`,
  );

  const systemPrompt = [
    ctx.getSystemPrompt(),
    ...skillBlocks,
  ].filter(Boolean).join("\n\n");

  const loader = new DefaultResourceLoader({
    cwd: ctx.cwd,
    agentDir,
    noExtensions: false,
    noSkills: false,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPromptOverride: () => systemPrompt,
  });
  await loader.reload();

  const tools = options.pi.getActiveTools().filter((name) => !SELF_TOOLS.has(name));
  const { session } = await createAgentSession({
    cwd: ctx.cwd,
    agentDir,
    sessionManager: SessionManager.inMemory(ctx.cwd),
    settingsManager: SettingsManager.create(ctx.cwd, agentDir),
    modelRegistry: ctx.modelRegistry,
    model: ctx.model,
    tools,
    resourceLoader: loader,
  });

  session.setActiveToolsByName(session.getActiveToolNames().filter((name) => !SELF_TOOLS.has(name)));
  await session.bindExtensions({
    uiContext: ctx.ui as any,
    onError: (error) => {
      options.onTool?.(`extension-error:${error.extensionPath}`, "end");
    },
  });
  // Extensions may register tools during bind; remove our own tools again to avoid recursive subagents.
  session.setActiveToolsByName(session.getActiveToolNames().filter((name) => !SELF_TOOLS.has(name)));
  options.onSession?.(session);

  let currentText = "";
  let turnCount = 0;
  let softLimitReached = false;
  let aborted = false;

  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    if (event.type === "message_start") currentText = "";
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      currentText += event.assistantMessageEvent.delta;
      options.onText?.(currentText);
    }
    if (event.type === "tool_execution_start") options.onTool?.(event.toolName, "start");
    if (event.type === "tool_execution_end") options.onTool?.(event.toolName, "end");
    if (event.type === "turn_end") {
      turnCount++;
      options.onTurnEnd?.(turnCount);
      if (options.maxTurns != null) {
        if (!softLimitReached && turnCount >= options.maxTurns) {
          softLimitReached = true;
          session.steer("You have reached your turn limit. Wrap up immediately with your final answer.");
        } else if (softLimitReached && turnCount >= options.maxTurns + 3) {
          aborted = true;
          session.abort();
        }
      }
    }
  });

  const onAbort = () => {
    aborted = true;
    session.abort();
  };
  options.signal.addEventListener("abort", onAbort, { once: true });

  const effectivePrompt = (options.inheritContext ? buildParentContext(ctx) : "") + options.prompt;
  try {
    await session.prompt(effectivePrompt);
  } finally {
    unsubscribe();
    options.signal.removeEventListener("abort", onAbort);
  }

  return { text: currentText.trim() || lastAssistantText(session), session, aborted };
}

export async function steerSubagent(session: AgentSession, message: string): Promise<void> {
  await session.steer(message);
}

export function getConversation(session: AgentSession): string {
  const parts: string[] = [];
  for (const msg of session.messages) {
    if (msg.role === "user") {
      const text = extractText(msg.content).trim();
      if (text) parts.push(`[User]: ${text}`);
    } else if (msg.role === "assistant") {
      const text = extractText(msg.content).trim();
      if (text) parts.push(`[Assistant]: ${text}`);
    } else if (msg.role === "toolResult") {
      const text = extractText(msg.content).trim();
      parts.push(`[Tool Result ${msg.toolName}]: ${text.slice(0, 500)}${text.length > 500 ? "…" : ""}`);
    }
  }
  return parts.join("\n\n");
}
