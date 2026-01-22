/**
 * File-based Compaction Extension
 *
 * Uses just-bash to provide an in-memory virtual filesystem where the
 * conversation is available as a JSON file. The summarizer agent can
 * explore it with jq, grep, etc. without writing to disk.
 */

import { complete, getModel, type Message, type UserMessage, type AssistantMessage, type ToolResultMessage, type Tool, type Model } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { convertToLlm } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Bash } from "just-bash";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";

// ============================================================================
// CONFIGURATION
// ============================================================================

// Models to try for compaction, in order of preference
const COMPACTION_MODELS = [
    { provider: "cerebras", id: "zai-glm-4.7" },
    { provider: "anthropic", id: "claude-haiku-4-5" },
];

// Debug mode - saves compaction data to ~/.pi/agent/compactions/
const DEBUG_COMPACTIONS = false;

// ============================================================================
// DEBUG INFRASTRUCTURE
// ============================================================================

const COMPACTIONS_DIR = path.join(homedir(), ".pi", "agent", "compactions");

function debugLog(message: string): void {
    if (!DEBUG_COMPACTIONS) return;
    try {
        fs.mkdirSync(COMPACTIONS_DIR, { recursive: true });
        const timestamp = new Date().toISOString();
        fs.appendFileSync(path.join(COMPACTIONS_DIR, "debug.log"), `[${timestamp}] ${message}\n`);
    } catch {}
}

function saveCompactionDebug(sessionId: string, data: any): void {
    if (!DEBUG_COMPACTIONS) return;
    try {
        fs.mkdirSync(COMPACTIONS_DIR, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `${timestamp}_${sessionId.slice(0, 8)}.json`;
        fs.writeFileSync(path.join(COMPACTIONS_DIR, filename), JSON.stringify(data, null, 2));
    } catch {}
}

// ============================================================================
// EXTENSION
// ============================================================================

export default function (pi: ExtensionAPI) {
    pi.on("session_before_compact", async (event, ctx) => {
        const { preparation, signal, branchEntries } = event;
        const { tokensBefore, firstKeptEntryId, previousSummary } = preparation;
        const sessionId = ctx.sessionManager.getSessionId() || `unknown-${Date.now()}`;

        // Extract messages from branchEntries
        const allMessages = branchEntries
            ?.filter((e: any) => e.type === "message" && e.message)
            .map((e: any) => e.message) ?? [];

        if (allMessages.length === 0) {
            debugLog("No messages to compact");
            return;
        }

        // Try each model in order until one works
        let model: Model<any> | null = null;
        let apiKey: string | undefined;

        for (const cfg of COMPACTION_MODELS) {
            const candidate = getModel(cfg.provider, cfg.id);
            if (!candidate) {
                debugLog(`Model ${cfg.provider}/${cfg.id} not found`);
                continue;
            }
            const key = await ctx.modelRegistry.getApiKey(candidate);
            if (!key) {
                debugLog(`No API key for ${cfg.provider}/${cfg.id}`);
                continue;
            }
            model = candidate;
            apiKey = key;
            break;
        }

        // Fall back to session model
        if (!model) {
            model = ctx.model;
            apiKey = await ctx.modelRegistry.getApiKey(model);
        }

        if (!model || !apiKey) {
            ctx.ui.notify("No model available for compaction", "warning");
            return;
        }

        const llmMessages = convertToLlm(allMessages);
        const bash = new Bash({
            files: { "/conversation.json": JSON.stringify(llmMessages, null, 2) },
        });

        ctx.ui.notify(`Compacting ${allMessages.length} messages with ${model.provider}/${model.id}`, "info");

        const tools: Tool[] = [{
            name: "bash",
            description: "Execute a bash command in a virtual filesystem. The conversation is at /conversation.json. Use jq, grep, head, tail, wc, cat to explore it.",
            parameters: Type.Object({
                command: Type.String({ description: "The bash command to execute" }),
            }),
        }];

        const previousContext = previousSummary ? `\n\nPrevious session summary for context:\n${previousSummary}` : "";

        const systemPrompt = `You are a conversation summarizer. The conversation is at /conversation.json - use the bash tool with jq, grep, head, tail to explore it.

## JSON Structure
- Array of messages with "role" ("user" | "assistant" | "toolResult") and "content" array
- Assistant content blocks: "type": "text", "toolCall" (with "name", "arguments"), or "thinking"
- toolResult messages: "toolCallId", "toolName", "content" array
- toolCall blocks show actions taken (read, write, edit, bash commands)

## Exploration Strategy
1. **Count messages**: \`jq 'length' /conversation.json\`
2. **First user request**: \`jq '.[0:3]' /conversation.json\` - understand the initial goal
3. **Last 10-15 messages**: \`jq '.[-15:]' /conversation.json\` - see final state and any issues
4. **Find ALL file modifications**: \`jq '[.[] | .content[]? | select(.type=="toolCall" and (.name | test("write|edit"))) | {name, file: .arguments.path}]' /conversation.json\`
5. **Check for user feedback/issues**: \`jq '.[] | select(.role=="user") | .content[0].text' /conversation.json | grep -i "doesn't work\\|still\\|bug\\|issue\\|error\\|wrong\\|fix" | tail -10\`

## Rules for Accuracy

1. **Session Type Detection**: 
   - If you only see "read" tool calls → this is a CODE REVIEW/EXPLORATION session, NOT implementation
   - Only claim files were "modified" if you see successful "write" or "edit" tool results

2. **Done vs In-Progress**:
   - Check the LAST 10 user messages for complaints like "doesn't work", "still broken", "bug"
   - If user reports issues after a change, mark it as "In Progress" NOT "Done"
   - Only mark "Done" if there's user confirmation OR successful test output

3. **Exact Names**:
   - Use EXACT variable/function/parameter names from the code
   - Quote specific values when relevant

4. **File Lists**:
   - List ALL files that were modified (check write/edit tool calls)
   - Don't list files that were only read
${previousContext}

## Output Format
Output ONLY the summary in markdown, nothing else. Use these sections:

## Summary

### 1. Main Goal
What the user asked for (quote if short)

### 2. Session Type
Implementation / Code Review / Debugging / Discussion

### 3. Key Decisions
Technical decisions and rationale

### 4. Files Modified
List with brief description of changes (only files with write/edit)

### 5. Status
What is Done ✓ vs In Progress ⏳ vs Blocked ❌

### 6. Issues/Blockers
Any reported problems or unresolved issues

### 7. Next Steps
What remains to be done`;

        const messages: Message[] = [{
            role: "user",
            content: [{ type: "text", text: "Summarize the conversation in /conversation.json. Follow the exploration strategy, then output ONLY the summary." }],
            timestamp: Date.now(),
        }];

        const trajectory: Message[] = [...messages];

        try {
            while (true) {
                if (signal.aborted) return;

                const response = await complete(model, { systemPrompt, messages, tools }, { apiKey, signal });

                const toolCalls = response.content.filter((c): c is any => c.type === "toolCall");

                if (toolCalls.length > 0) {
                    const assistantMsg: AssistantMessage = {
                        role: "assistant",
                        content: response.content,
                        api: response.api,
                        provider: response.provider,
                        model: response.model,
                        usage: response.usage,
                        stopReason: response.stopReason,
                        timestamp: Date.now(),
                    };
                    messages.push(assistantMsg);
                    trajectory.push(assistantMsg);

                    for (const tc of toolCalls) {
                        const { command } = tc.arguments as { command: string };
                        ctx.ui.notify(`bash: ${command.slice(0, 60)}${command.length > 60 ? "..." : ""}`, "info");
                        
                        let result: string;
                        let isError = false;
                        try {
                            const r = await bash.exec(command);
                            result = r.stdout + (r.stderr ? `\nstderr: ${r.stderr}` : "");
                            if (r.exitCode !== 0) {
                                result += `\nexit code: ${r.exitCode}`;
                                isError = true;
                            }
                            result = result.slice(0, 50000);
                        } catch (e: any) {
                            result = `Error: ${e.message}`;
                            isError = true;
                        }

                        const toolResultMsg: ToolResultMessage = {
                            role: "toolResult",
                            toolCallId: tc.id,
                            toolName: tc.name,
                            content: [{ type: "text", text: result }],
                            isError,
                            timestamp: Date.now(),
                        };
                        messages.push(toolResultMsg);
                        trajectory.push(toolResultMsg);
                    }
                    continue;
                }

                // Done - extract summary
                const summary = response.content
                    .filter((c): c is any => c.type === "text")
                    .map((c) => c.text)
                    .join("\n")
                    .trim();

                trajectory.push({
                    role: "assistant",
                    content: response.content,
                    timestamp: Date.now(),
                } as AssistantMessage);

                if (summary.length < 100) {
                    debugLog(`Summary too short: ${summary.length} chars`);
                    saveCompactionDebug(sessionId, { input: llmMessages, trajectory, error: "Summary too short" });
                    return;
                }

                saveCompactionDebug(sessionId, {
                    input: llmMessages,
                    trajectory,
                    output: { summary, firstKeptEntryId, tokensBefore },
                });

                return {
                    compaction: { summary, firstKeptEntryId, tokensBefore },
                };
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            debugLog(`Compaction failed: ${message}`);
            saveCompactionDebug(sessionId, { input: llmMessages, trajectory, error: message });
            if (!signal.aborted) {
                ctx.ui.notify(`Compaction failed: ${message}`, "warning");
            }
            return;
        }
    });
}
