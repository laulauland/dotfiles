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

export default function (pi: ExtensionAPI) {
    pi.on("session_before_compact", async (event, ctx) => {
        const { preparation, signal } = event;
        const { messagesToSummarize, turnPrefixMessages, tokensBefore, firstKeptEntryId, previousSummary } = preparation;

        const model = getModel("anthropic", "claude-haiku-4-5");
        if (!model) {
            ctx.ui.notify(`Could not find Claude Haiku model, using default compaction`, "warning");
            return;
        }

        const apiKey = await ctx.modelRegistry.getApiKey(model);
        if (!apiKey) {
            ctx.ui.notify(`No API key for ${model.provider}, using default compaction`, "warning");
            return;
        }

        // Combine all messages and create in-memory bash environment
        const allMessages = [...messagesToSummarize, ...turnPrefixMessages];
        const llmMessages = convertToLlm(allMessages);

        const bash = new Bash({
            files: {
                "/conversation.json": JSON.stringify(llmMessages, null, 2),
            },
        });

        ctx.ui.notify(`Compacting ${allMessages.length} messages with ${model.id}`, "info");

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

        const systemPrompt = `You are a conversation summarizer with access to a bash tool. The conversation you need to summarize is stored at /conversation.json in the virtual filesystem.

IMPORTANT: You MUST use the bash tool to read the conversation file. The file is NOT provided in this chat - you must read it yourself using commands like:
- cat /conversation.json | head -200
- jq 'length' /conversation.json
- jq '.[0]' /conversation.json

The JSON structure is an array of messages with 'role' and 'content' fields. Content is an array of blocks (text, tool_use, tool_result).

Start by running: cat /conversation.json | head -200

Then explore more as needed. When you have enough information, provide a final summary that captures:${previousContext}

1. The main goals and objectives discussed
2. Key decisions made and their rationale  
3. Important code changes, file modifications, or technical details
4. Current state of any ongoing work
5. Any blockers, issues, or open questions
6. Next steps that were planned or suggested

Format as structured markdown. Output only the summary itself without any preamble or introductory phrases.`;

        const messages: Message[] = [
            {
                role: "user",
                content: [{ type: "text", text: "Read /conversation.json using the bash tool and create a comprehensive summary. Start with: cat /conversation.json | head -200" }],
                timestamp: Date.now(),
            } satisfies UserMessage,
        ];

        try {
            let iterations = 0;
            const maxIterations = 20;

            while (iterations < maxIterations) {
                if (signal.aborted) throw new Error("Compaction aborted");

                const response = await complete(model, { systemPrompt, messages, tools }, { apiKey, maxTokens: 4096, signal });

                const toolCalls = response.content.filter(
                    (c): c is { type: "toolCall"; id: string; name: string; arguments: Record<string, any> } => c.type === "toolCall"
                );

                // If model wants to use tools, process them
                if (toolCalls.length > 0 || response.stopReason === "toolUse") {
                    // Add assistant message with tool use
                    messages.push({
                        role: "assistant",
                        content: response.content,
                        api: response.api,
                        provider: response.provider,
                        model: response.model,
                        usage: response.usage,
                        stopReason: response.stopReason,
                        timestamp: Date.now(),
                    } satisfies AssistantMessage);

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
                            messages.push({
                                role: "toolResult",
                                toolCallId: toolCall.id,
                                toolName: toolCall.name,
                                content: [{ type: "text", text: result }],
                                isError,
                                timestamp: Date.now(),
                            } satisfies ToolResultMessage);
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

                if (!summary.trim()) {
                    ctx.ui.notify("Compaction summary was empty, using default", "warning");
                    return;
                }

                return {
                    compaction: {
                        summary,
                        firstKeptEntryId,
                        tokensBefore,
                    },
                };
            }

            ctx.ui.notify("Compaction reached max iterations, using default", "warning");
            return;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!signal.aborted) ctx.ui.notify(`Compaction failed: ${message}`, "error");
            return;
        }
    });
}
