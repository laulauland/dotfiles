/**
 * In-Memory File-based Compaction Extension
 *
 * Uses just-bash to provide an in-memory virtual filesystem where the
 * conversation is available as a JSON file. The summarizer agent can
 * explore it with jq, grep, etc. without writing to disk.
 *
 * This keeps the summarizer's context small - it only loads what it
 * queries, rather than the entire conversation at once.
 */

import { complete, getModel, type Message, type UserMessage, type AssistantMessage, type ToolResultMessage, type Tool } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { convertToLlm } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Bash } from "just-bash";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";

// Debug logging configuration
const DEBUG_COMPACTIONS = true;
const COMPACTIONS_DIR = path.join(homedir(), ".pi", "agent", "compactions");
const DEBUG_LOG_FILE = path.join(COMPACTIONS_DIR, "debug.log");

function debugLog(message: string): void {
    if (!DEBUG_COMPACTIONS) return;
    try {
        fs.mkdirSync(COMPACTIONS_DIR, { recursive: true });
        const timestamp = new Date().toISOString();
        fs.appendFileSync(DEBUG_LOG_FILE, `[${timestamp}] ${message}\n`);
    } catch {}
}

interface CompactionDebugData {
    timestamp: string;
    sessionId: string;
    input: {
        messagesToSummarize: any[];
        turnPrefixMessages: any[];
        branchEntries: any[]; // Raw session entries for comparison
        tokensBefore: number;
        previousSummary: string | null;
        llmMessages: any[]; // The converted messages sent to the virtual FS
    };
    trajectory: Message[]; // All messages in the compaction conversation
    output: {
        summary: string;
        firstKeptEntryId: string;
        tokensBefore: number;
    } | null;
    error?: string;
    iterationsUsed: number;
    model: string;
}

// Deep clone helper that handles potential Proxy objects and circular refs
function safeClone(obj: any): any {
    try {
        // For arrays, map each element
        if (Array.isArray(obj)) {
            return obj.map((item) => safeClone(item));
        }
        // For objects, spread to break Proxy and then recurse
        if (obj && typeof obj === "object") {
            const result: any = {};
            for (const key of Object.keys(obj)) {
                try {
                    result[key] = safeClone(obj[key]);
                } catch {
                    result[key] = "[unserializable]";
                }
            }
            return result;
        }
        return obj;
    } catch {
        return "[unserializable]";
    }
}

function saveCompactionDebug(data: CompactionDebugData): void {
    if (!DEBUG_COMPACTIONS) return;

    try {
        fs.mkdirSync(COMPACTIONS_DIR, { recursive: true });

        // Create filename with timestamp and session ID
        const sanitizedTimestamp = data.timestamp.replace(/[:.]/g, "-");
        const shortSessionId = data.sessionId.slice(0, 8);
        const filename = `${sanitizedTimestamp}_${shortSessionId}.json`;
        const filepath = path.join(COMPACTIONS_DIR, filename);

        // Use safeClone to handle potential Proxy objects
        const safeData = safeClone(data);
        fs.writeFileSync(filepath, JSON.stringify(safeData, null, 2));
    } catch (err) {
        // Silently fail - don't break compaction for debugging issues
        debugLog(`Failed to save compaction debug data: ${err}`);
    }
}

export default function (pi: ExtensionAPI) {
    pi.on("session_before_compact", async (event, ctx) => {
        // Log everything we receive
        debugLog(`event keys: ${Object.keys(event)}`);
        debugLog(`event.preparation keys: ${Object.keys(event.preparation || {})}`);
        debugLog(`branchEntries length: ${event.branchEntries?.length}`);
        
        const { preparation, signal } = event;
        debugLog(`preparation.messagesToSummarize: ${preparation.messagesToSummarize?.length}, type: ${typeof preparation.messagesToSummarize}, isArray: ${Array.isArray(preparation.messagesToSummarize)}`);
        debugLog(`preparation.turnPrefixMessages: ${preparation.turnPrefixMessages?.length}, type: ${typeof preparation.turnPrefixMessages}`);
        debugLog(`preparation.tokensBefore: ${preparation.tokensBefore}`);
        debugLog(`preparation.firstKeptEntryId: ${preparation.firstKeptEntryId}`);
        
        const { messagesToSummarize, turnPrefixMessages, tokensBefore, firstKeptEntryId, previousSummary } = preparation;
        
        debugLog(`after destructure - messagesToSummarize: ${messagesToSummarize?.length}, turnPrefixMessages: ${turnPrefixMessages?.length}`);

        // Get session ID for debugging
        const sessionId = ctx.sessionManager.getSessionId() || `unknown-${Date.now()}`;
        debugLog(`sessionId: ${sessionId}`);

        // Prefer the currently selected "main" model for this session.
        // If unavailable (should be rare), fall back to a reasonable default.
        const model = ctx.model ?? getModel("anthropic", "claude-haiku-4-5");
        if (!model) {
            ctx.ui.notify(`Could not resolve an active model, using default compaction`, "warning");
            return;
        }

        // Prefer stored API key, but allow provider env var fallbacks handled by pi-ai.
        const apiKey = await ctx.modelRegistry.getApiKey(model);

        // Combine all messages and create in-memory bash environment
        const allMessages = [...messagesToSummarize, ...turnPrefixMessages];
        const llmMessages = convertToLlm(allMessages);

        const bash = new Bash({
            files: {
                "/conversation.json": JSON.stringify(llmMessages, null, 2),
            },
        });

        ctx.ui.notify(`Compacting ${allMessages.length} messages with ${model.provider}/${model.id}`, "info");

        debugLog(`allMessages length: ${allMessages.length}`);
        debugLog(`llmMessages length: ${llmMessages.length}`);
        
        // Initialize debug data - clone immediately to capture current state
        const debugData: CompactionDebugData = {
            timestamp: new Date().toISOString(),
            sessionId,
            input: {
                messagesToSummarize: safeClone(messagesToSummarize),
                turnPrefixMessages: safeClone(turnPrefixMessages),
                branchEntries: safeClone(event.branchEntries),
                tokensBefore,
                previousSummary: previousSummary || null,
                llmMessages: safeClone(llmMessages),
            },
            trajectory: [],
            output: null,
            iterationsUsed: 0,
            model: `${model.provider}/${model.id}`,
        };

        const previousContext = previousSummary ? `\n\nPrevious session summary for context:\n${previousSummary}` : "";

        const tools: Tool[] = [
            {
                name: "bash",
                description:
                    "Execute a bash command in a virtual filesystem. The conversation is at /conversation.json. Use jq, grep, head, tail, wc, cat to explore it.",
                parameters: Type.Object({
                    command: Type.String({ description: "The bash command to execute" }),
                }),
            },
        ];

        const systemPrompt = `You are a conversation summarizer. The conversation is at /conversation.json - use the bash tool with jq, grep, head, tail to explore it.

JSON structure:
- Array of messages with "role" ("user" | "assistant" | "toolResult") and "content" array
- Assistant content blocks: "type": "text", "toolCall" (with "name", "arguments"), or "thinking"
- toolResult messages: "toolCallId", "toolName", "content" array
- toolCall blocks show actions taken (read, write, edit, bash commands)

Explore the entire conversation - beginning, middle, and end. The end often shows what was actually completed.${previousContext}

Summarize:
1. Main goals and objectives
2. Key decisions and rationale
3. Code changes, file modifications, technical details
4. Current state - what is done vs pending
5. Blockers or open questions
6. Next steps

Format as markdown. Output only the summary without preamble.`;

        const initialUserMessage: UserMessage = {
            role: "user",
            content: [{ type: "text", text: "Summarize the conversation in /conversation.json. Explore the entire file - beginning, middle, and end." }],
            timestamp: Date.now(),
        };

        const messages: Message[] = [initialUserMessage];

        // Track trajectory starting with the initial user message
        debugData.trajectory.push(initialUserMessage);

        try {
            let iterations = 0;
            const maxIterations = 30;

            while (iterations < maxIterations) {
                if (signal.aborted) throw new Error("Compaction aborted");

                const response = await complete(model, { systemPrompt, messages, tools }, { apiKey, maxTokens: 4096, signal });

                const toolCalls = response.content.filter(
                    (c): c is { type: "toolCall"; id: string; name: string; arguments: Record<string, any> } => c.type === "toolCall"
                );

                // If model wants to use tools, process them
                if (toolCalls.length > 0 || response.stopReason === "toolUse") {
                    // Add assistant message with tool use
                    const assistantMessage: AssistantMessage = {
                        role: "assistant",
                        content: response.content,
                        api: response.api,
                        provider: response.provider,
                        model: response.model,
                        usage: response.usage,
                        stopReason: response.stopReason,
                        timestamp: Date.now(),
                    };
                    messages.push(assistantMessage);
                    debugData.trajectory.push(assistantMessage);

                    // Execute tools in virtual bash and add results
                    for (const toolCall of toolCalls) {
                        if (toolCall.name === "bash") {
                            const { command } = toolCall.arguments as { command: string };
                            ctx.ui.notify(`bash: ${command.slice(0, 60)}${command.length > 60 ? "..." : ""}`, "info");
                            let result: string;
                            let isError = false;
                            try {
                                const execResult = await bash.exec(command);
                                result = execResult.stdout + (execResult.stderr ? `\nstderr: ${execResult.stderr}` : "");
                                if (execResult.exitCode !== 0) {
                                    result += `\nexit code: ${execResult.exitCode}`;
                                    isError = true;
                                }
                                result = result.slice(0, 50000); // Limit output size
                            } catch (err: any) {
                                result = `Error: ${err.message}`;
                                isError = true;
                            }
                            // Use pi-ai's ToolResultMessage format
                            const toolResultMessage: ToolResultMessage = {
                                role: "toolResult",
                                toolCallId: toolCall.id,
                                toolName: toolCall.name,
                                content: [{ type: "text", text: result }],
                                isError,
                                timestamp: Date.now(),
                            };
                            messages.push(toolResultMessage);
                            debugData.trajectory.push(toolResultMessage);
                        }
                    }
                    iterations++;
                    continue;
                }

                // Model is done - extract summary
                const summary = response.content
                    .filter((c): c is { type: "text"; text: string } => c.type === "text")
                    .map((c) => c.text)
                    .join("\n");

                // Add final assistant message to trajectory
                const finalAssistantMessage: AssistantMessage = {
                    role: "assistant",
                    content: response.content,
                    api: response.api,
                    provider: response.provider,
                    model: response.model,
                    usage: response.usage,
                    stopReason: response.stopReason,
                    timestamp: Date.now(),
                };
                debugData.trajectory.push(finalAssistantMessage);
                debugData.iterationsUsed = iterations;

                if (!summary.trim()) {
                    ctx.ui.notify("Compaction summary was empty, using default", "warning");
                    debugData.error = "Empty summary";
                    saveCompactionDebug(debugData);
                    return;
                }

                // Save successful compaction debug data
                debugData.output = {
                    summary,
                    firstKeptEntryId,
                    tokensBefore,
                };
                saveCompactionDebug(debugData);

                return {
                    compaction: {
                        summary,
                        firstKeptEntryId,
                        tokensBefore,
                    },
                };
            }

            debugData.iterationsUsed = maxIterations;
            debugData.error = "Max iterations reached";
            saveCompactionDebug(debugData);

            ctx.ui.notify("Compaction reached max iterations, using default", "warning");
            return;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            debugData.error = message;
            debugData.iterationsUsed = messages.filter((m) => m.role === "assistant").length;
            if (!signal.aborted) {
                saveCompactionDebug(debugData);
                const notifyType: "warning" | "error" = message.includes("No API key for provider:") ? "warning" : "error";
                ctx.ui.notify(`Compaction failed: ${message}`, notifyType);
            }
            return;
        }
    });
}
