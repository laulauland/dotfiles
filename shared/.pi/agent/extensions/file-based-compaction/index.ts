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

// Providers known to support tool use properly
const TOOL_COMPATIBLE_PROVIDERS = ["anthropic", "openai", "google"];

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

/**
 * Clean up summary preambles that models sometimes add
 */
function cleanSummaryPreamble(summary: string): string {
    return summary
        // Remove common preambles
        .replace(/^(Based on my exploration|Perfect!|Now I have|Let me|I'll now|Here's the|Here is the|After exploring|Having explored|Looking at the conversation).+?\n+/i, '')
        // Remove leading horizontal rules
        .replace(/^---\n*/m, '')
        // Remove "Summary" header if it's the first thing (redundant)
        .replace(/^#\s*Summary\s*\n+/i, '')
        .trim();
}

/**
 * Validate summary quality - returns null if valid, error message if not
 */
function validateSummary(summary: string): string | null {
    // Check minimum length
    if (summary.length < 200) {
        return `Summary too short (${summary.length} chars, minimum 200)`;
    }

    // Check for structure (should have headers or bold sections)
    const hasStructure = summary.includes('##') || summary.includes('**') || summary.includes('###');
    if (!hasStructure) {
        return "Summary lacks structure (no headers or bold sections)";
    }

    // Check for "I couldn't" or similar failure indicators
    const failurePatterns = [
        /i couldn't find/i,
        /no conversation/i,
        /empty conversation/i,
        /unable to access/i,
        /file is empty/i,
    ];
    for (const pattern of failurePatterns) {
        if (pattern.test(summary)) {
            return `Summary indicates failure: ${pattern.toString()}`;
        }
    }

    return null; // Valid
}

/**
 * Extract messages from branchEntries (the complete session history)
 * branchEntries contains entries like {type: "message", message: {...}} 
 * as well as other entry types like model_change, thinking_level_change, etc.
 */
function extractMessagesFromBranchEntries(branchEntries: any[]): any[] {
    if (!branchEntries || !Array.isArray(branchEntries)) {
        return [];
    }
    return branchEntries
        .filter((entry: any) => entry.type === "message" && entry.message)
        .map((entry: any) => entry.message);
}

export default function (pi: ExtensionAPI) {
    pi.on("session_before_compact", async (event, ctx) => {
        const { preparation, signal, branchEntries } = event;
        const { messagesToSummarize, turnPrefixMessages, tokensBefore, firstKeptEntryId, previousSummary } = preparation;

        // Get session ID for debugging
        const sessionId = ctx.sessionManager.getSessionId() || `unknown-${Date.now()}`;

        // === FIX: Use branchEntries as source of truth ===
        // The preparation.messagesToSummarize sometimes misses messages, 
        // but branchEntries contains the complete session history
        const branchMessages = extractMessagesFromBranchEntries(branchEntries);
        const preparationMessages = [...messagesToSummarize, ...turnPrefixMessages];
        
        // Use branchMessages if available and larger, otherwise fall back to preparation
        const allMessages = branchMessages.length > preparationMessages.length 
            ? branchMessages 
            : preparationMessages;
        
        debugLog(`branchMessages: ${branchMessages.length}, preparationMessages: ${preparationMessages.length}, using: ${allMessages.length}`);

        // === IMPROVEMENT 1: Early return for empty input ===
        if (allMessages.length === 0) {
            ctx.ui.notify("No messages to compact, skipping custom compaction", "info");
            debugLog(`Empty input - messagesToSummarize: ${messagesToSummarize.length}, turnPrefixMessages: ${turnPrefixMessages.length}`);
            return; // Let default compaction handle it
        }

        // Prefer the currently selected "main" model for this session.
        const model = getModel("anthropic", "claude-haiku-4-5") ?? ctx.model;
        if (!model) {
            ctx.ui.notify("Could not resolve an active model, using default compaction", "warning");
            return;
        }

        // === IMPROVEMENT 2: Check model compatibility ===
        if (!TOOL_COMPATIBLE_PROVIDERS.includes(model.provider)) {
            ctx.ui.notify(`Model ${model.provider}/${model.id} may not support tools well, using default compaction`, "warning");
            debugLog(`Incompatible provider: ${model.provider}`);
            return; // Fall back to default compaction
        }

        // Prefer stored API key, but allow provider env var fallbacks handled by pi-ai.
        const apiKey = await ctx.modelRegistry.getApiKey(model);

        const llmMessages = convertToLlm(allMessages);

        const bash = new Bash({
            files: {
                "/conversation.json": JSON.stringify(llmMessages, null, 2),
            },
        });

        ctx.ui.notify(`Compacting ${allMessages.length} messages with ${model.provider}/${model.id}`, "info");

        debugLog(`allMessages length: ${allMessages.length}, llmMessages length: ${llmMessages.length}`);
        
        // Track which source we used
        const usedBranchEntries = branchMessages.length > preparationMessages.length;

        // Initialize debug data
        const debugData: CompactionDebugData = {
            timestamp: new Date().toISOString(),
            sessionId,
            input: {
                messagesToSummarize: safeClone(messagesToSummarize),
                turnPrefixMessages: safeClone(turnPrefixMessages),
                branchEntries: safeClone(branchEntries),
                tokensBefore,
                previousSummary: previousSummary || null,
                llmMessages: safeClone(llmMessages),
                // Track which source was used
                messageSource: usedBranchEntries ? "branchEntries" : "preparation",
                branchMessagesCount: branchMessages.length,
                preparationMessagesCount: preparationMessages.length,
            } as any,
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

        // === IMPROVEMENT 3: Much better system prompt with exploration strategy ===
        const systemPrompt = `You are a conversation summarizer. The conversation is at /conversation.json - use the bash tool with jq, grep, head, tail to explore it.

## JSON Structure
- Array of messages with "role" ("user" | "assistant" | "toolResult") and "content" array
- Assistant content blocks: "type": "text", "toolCall" (with "name", "arguments"), or "thinking"
- toolResult messages: "toolCallId", "toolName", "content" array
- toolCall blocks show actions taken (read, write, edit, bash commands)

## REQUIRED Exploration Strategy
You MUST explore thoroughly before summarizing. Follow this sequence:

1. **Count messages**: \`jq 'length' /conversation.json\`
2. **First user request**: \`jq '.[0:3]' /conversation.json\` - understand the initial goal
3. **Last 10-15 messages**: \`jq '.[-15:]' /conversation.json\` - see final state and any issues
4. **Find ALL file modifications**: \`jq '[.[] | .content[]? | select(.type=="toolCall" and (.name | test("write|edit"))) | {name, file: .arguments.path}]' /conversation.json\`
5. **Check for user feedback/issues**: \`jq '.[] | select(.role=="user") | .content[0].text' /conversation.json | grep -i "doesn't work\\|still\\|bug\\|issue\\|error\\|wrong\\|fix" | tail -10\`
6. **Middle section** (if >50 messages): \`jq '.[length/2 - 5 : length/2 + 5]' /conversation.json\`

## CRITICAL Rules for Accuracy

1. **Session Type Detection**: 
   - If you only see "read" tool calls → this is a CODE REVIEW/EXPLORATION session, NOT implementation
   - Only claim files were "modified" if you see successful "write" or "edit" tool results

2. **Done vs In-Progress**:
   - Check the LAST 10 user messages for complaints like "doesn't work", "still broken", "bug"
   - If user reports issues after a change, mark it as "In Progress" NOT "Done"
   - Only mark "Done" if there's user confirmation OR successful test output

3. **Exact Names**:
   - Use EXACT variable/function/parameter names from the code, not paraphrased versions
   - Quote specific values when relevant

4. **File Lists**:
   - List ALL files that were modified (check write/edit tool calls)
   - Don't list files that were only read

${previousContext}

## Output Format
Summarize in markdown with these sections:
1. **Main Goal** - What the user asked for (quote if short)
2. **Session Type** - Implementation / Code Review / Debugging / Discussion
3. **Key Decisions** - Technical decisions and rationale
4. **Files Modified** - List with brief description of changes (only files with write/edit)
5. **Status** - What is Done ✓ vs In Progress ⏳ vs Blocked ❌
6. **Issues/Blockers** - Any reported problems or unresolved issues
7. **Next Steps** - What remains to be done

Be accurate. Don't claim things are done if the user reported issues. Don't invent features that weren't discussed.`;

        // === IMPROVEMENT 4: Better initial prompt with exploration instructions ===
        const initialUserMessage: UserMessage = {
            role: "user",
            content: [{ 
                type: "text", 
                text: `Summarize the conversation in /conversation.json. 

IMPORTANT: Follow the exploration strategy in your instructions. You MUST:
1. First count messages and check the beginning (initial request)
2. Then check the END (last 10-15 messages) for final state and any issues
3. Find ALL file modifications (write/edit tool calls)
4. Search for user feedback about bugs/issues
5. Only then write your summary

Start by counting messages and viewing the first few.` 
            }],
            timestamp: Date.now(),
        };

        const messages: Message[] = [initialUserMessage];
        debugData.trajectory.push(initialUserMessage);

        try {
            let iterations = 0;
            const maxIterations = 30;
            let retryCount = 0;
            const maxRetries = 2;

            while (iterations < maxIterations) {
                if (signal.aborted) throw new Error("Compaction aborted");

                const response = await complete(model, { systemPrompt, messages, tools }, { apiKey, maxTokens: 4096, signal });

                // === IMPROVEMENT 5: Retry on error responses ===
                if (response.stopReason === "error" || (response.content.length === 0 && retryCount < maxRetries)) {
                    retryCount++;
                    ctx.ui.notify(`Compaction attempt ${retryCount} got empty/error response, retrying...`, "warning");
                    debugLog(`Retry ${retryCount}: stopReason=${response.stopReason}, content.length=${response.content.length}`);
                    
                    // Add a nudge message
                    const nudgeMessage: UserMessage = {
                        role: "user",
                        content: [{ type: "text", text: "Please try again. Start by running: jq 'length' /conversation.json" }],
                        timestamp: Date.now(),
                    };
                    messages.push(nudgeMessage);
                    debugData.trajectory.push(nudgeMessage);
                    iterations++;
                    continue;
                }

                const toolCalls = response.content.filter(
                    (c): c is { type: "toolCall"; id: string; name: string; arguments: Record<string, any> } => c.type === "toolCall"
                );

                // If model wants to use tools, process them
                if (toolCalls.length > 0 || response.stopReason === "toolUse") {
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

                    // Execute tools
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
                                result = result.slice(0, 50000);
                            } catch (err: any) {
                                result = `Error: ${err.message}`;
                                isError = true;
                            }
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
                let summary = response.content
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

                // === IMPROVEMENT 6: Clean up preambles ===
                summary = cleanSummaryPreamble(summary);

                // === IMPROVEMENT 7: Validate summary quality ===
                const validationError = validateSummary(summary);
                if (validationError) {
                    ctx.ui.notify(`Summary validation failed: ${validationError}, using default`, "warning");
                    debugData.error = validationError;
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
