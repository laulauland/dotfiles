/**
 * Web Tools Extension for pi
 *
 * Provides two tools:
 * - webfetch: Fetch and convert web content to markdown/text/html
 * - websearch: Search the web using Exa AI
 *
 * Adapted from opencode's implementations.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
} from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import TurndownService from "turndown";

// ============================================================================
// Constants
// ============================================================================

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_TIMEOUT = 30 * 1000; // 30 seconds
const MAX_TIMEOUT = 120 * 1000; // 2 minutes

const EXA_API_CONFIG = {
	BASE_URL: "https://mcp.exa.ai",
	ENDPOINTS: {
		SEARCH: "/mcp",
	},
	DEFAULT_NUM_RESULTS: 8,
} as const;

// ============================================================================
// Helpers
// ============================================================================

function convertHTMLToMarkdown(html: string): string {
	const turndownService = new TurndownService({
		headingStyle: "atx",
		hr: "---",
		bulletListMarker: "-",
		codeBlockStyle: "fenced",
		emDelimiter: "*",
	});
	turndownService.remove(["script", "style", "meta", "link"]);
	return turndownService.turndown(html);
}

function extractTextFromHTML(html: string): string {
	// Simple text extraction - strip all HTML tags and decode entities
	return html
		.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
		.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
		.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, " ")
		.trim();
}

// ============================================================================
// Tool Definitions
// ============================================================================

interface WebFetchDetails {
	url: string;
	format: string;
	contentType?: string;
	truncated?: boolean;
}

interface WebSearchDetails {
	query: string;
	numResults?: number;
	type?: string;
}

interface McpSearchRequest {
	jsonrpc: string;
	id: number;
	method: string;
	params: {
		name: string;
		arguments: {
			query: string;
			numResults?: number;
			livecrawl?: "fallback" | "preferred";
			type?: "auto" | "fast" | "deep";
			contextMaxCharacters?: number;
		};
	};
}

interface McpSearchResponse {
	jsonrpc: string;
	result: {
		content: Array<{
			type: string;
			text: string;
		}>;
	};
}

export default function (pi: ExtensionAPI) {
	// ========================================================================
	// webfetch tool
	// ========================================================================
	pi.registerTool({
		name: "webfetch",
		label: "Web Fetch",
		description: `Fetch content from a URL and convert to specified format.
- Fetches content from a specified URL
- Returns content in markdown (default), text, or html format
- Use when you need to retrieve and analyze web content
- URL must be fully-formed (http:// or https://)
- Results are truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}`,
		parameters: Type.Object({
			url: Type.String({ description: "The URL to fetch content from" }),
			format: Type.Optional(
				StringEnum(["text", "markdown", "html"] as const, {
					description:
						"The format to return the content in. Defaults to markdown.",
				})
			),
			timeout: Type.Optional(
				Type.Number({
					description: "Optional timeout in seconds (max 120)",
				})
			),
		}),

		async execute(_toolCallId, params, onUpdate, ctx, signal) {
			const { url, format = "markdown", timeout: timeoutSec } = params;

			// Validate URL
			if (!url.startsWith("http://") && !url.startsWith("https://")) {
				return {
					content: [
						{ type: "text", text: "URL must start with http:// or https://" },
					],
					isError: true,
					details: { url, format } as WebFetchDetails,
				};
			}

			onUpdate?.({
				content: [{ type: "text", text: `Fetching ${url}...` }],
			});

			const timeout = Math.min(
				(timeoutSec ?? DEFAULT_TIMEOUT / 1000) * 1000,
				MAX_TIMEOUT
			);

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), timeout);

			// Build Accept header based on requested format
			let acceptHeader = "*/*";
			switch (format) {
				case "markdown":
					acceptHeader =
						"text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1";
					break;
				case "text":
					acceptHeader =
						"text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1";
					break;
				case "html":
					acceptHeader =
						"text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1";
					break;
			}

			try {
				const signals: AbortSignal[] = [controller.signal];
				if (signal) signals.push(signal);

				const response = await fetch(url, {
					signal: AbortSignal.any(signals),
					headers: {
						"User-Agent":
							"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
						Accept: acceptHeader,
						"Accept-Language": "en-US,en;q=0.9",
					},
				});

				clearTimeout(timeoutId);

				if (!response.ok) {
					return {
						content: [
							{
								type: "text",
								text: `Request failed with status code: ${response.status}`,
							},
						],
						isError: true,
						details: { url, format } as WebFetchDetails,
					};
				}

				// Check content length
				const contentLength = response.headers.get("content-length");
				if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
					return {
						content: [
							{ type: "text", text: "Response too large (exceeds 5MB limit)" },
						],
						isError: true,
						details: { url, format } as WebFetchDetails,
					};
				}

				const arrayBuffer = await response.arrayBuffer();
				if (arrayBuffer.byteLength > MAX_RESPONSE_SIZE) {
					return {
						content: [
							{ type: "text", text: "Response too large (exceeds 5MB limit)" },
						],
						isError: true,
						details: { url, format } as WebFetchDetails,
					};
				}

				let content = new TextDecoder().decode(arrayBuffer);
				const contentType = response.headers.get("content-type") || "";

				// Handle content based on requested format and actual content type
				switch (format) {
					case "markdown":
						if (contentType.includes("text/html")) {
							content = convertHTMLToMarkdown(content);
						}
						break;
					case "text":
						if (contentType.includes("text/html")) {
							content = extractTextFromHTML(content);
						}
						break;
					case "html":
						// Return as-is
						break;
				}

				// Apply truncation
				const truncation = truncateHead(content, {
					maxLines: DEFAULT_MAX_LINES,
					maxBytes: DEFAULT_MAX_BYTES,
				});

				let resultText = truncation.content;
				if (truncation.truncated) {
					resultText += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)})]`;
				}

				return {
					content: [{ type: "text", text: resultText }],
					details: {
						url,
						format,
						contentType,
						truncated: truncation.truncated,
					} as WebFetchDetails,
				};
			} catch (error: unknown) {
				clearTimeout(timeoutId);

				if (error instanceof Error && error.name === "AbortError") {
					return {
						content: [{ type: "text", text: "Request timed out or cancelled" }],
						isError: true,
						details: { url, format } as WebFetchDetails,
					};
				}

				return {
					content: [
						{
							type: "text",
							text: `Fetch error: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					isError: true,
					details: { url, format } as WebFetchDetails,
				};
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("webfetch "));
			text += theme.fg("accent", args.url as string);
			if (args.format && args.format !== "markdown") {
				text += theme.fg("muted", ` (${args.format})`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			const details = result.details as WebFetchDetails | undefined;

			if (isPartial) {
				return new Text(theme.fg("warning", "Fetching..."), 0, 0);
			}

			if (result.isError) {
				const errorText =
					result.content[0]?.type === "text"
						? (result.content[0] as { type: "text"; text: string }).text
						: "Unknown error";
				return new Text(theme.fg("error", `✗ ${errorText}`), 0, 0);
			}

			let text = theme.fg("success", "✓ Fetched");
			if (details?.contentType) {
				text += theme.fg("muted", ` (${details.contentType.split(";")[0]})`);
			}
			if (details?.truncated) {
				text += theme.fg("warning", " [truncated]");
			}

			if (expanded) {
				const content = result.content[0];
				if (content?.type === "text") {
					const lines = (content as { type: "text"; text: string }).text
						.split("\n")
						.slice(0, 30);
					for (const line of lines) {
						text += `\n${theme.fg("dim", line.slice(0, 200))}`;
					}
					if (
						(content as { type: "text"; text: string }).text.split("\n")
							.length > 30
					) {
						text += `\n${theme.fg("muted", "...")}`;
					}
				}
			}

			return new Text(text, 0, 0);
		},
	});

	// ========================================================================
	// websearch tool
	// ========================================================================
	pi.registerTool({
		name: "websearch",
		label: "Web Search",
		description: `Search the web using Exa AI.
- Performs real-time web searches and can scrape content from specific URLs
- Provides up-to-date information for current events and recent data
- Supports configurable result counts (default: 8)
- Use for accessing information beyond knowledge cutoff
- Search types: 'auto' (balanced), 'fast' (quick), 'deep' (comprehensive)
- Live crawl: 'fallback' (use if cached unavailable) or 'preferred' (prioritize live)`,
		parameters: Type.Object({
			query: Type.String({ description: "Web search query" }),
			numResults: Type.Optional(
				Type.Number({
					description: "Number of search results to return (default: 8)",
				})
			),
			livecrawl: Type.Optional(
				StringEnum(["fallback", "preferred"] as const, {
					description:
						"Live crawl mode - 'fallback': backup if cached unavailable, 'preferred': prioritize live crawling",
				})
			),
			type: Type.Optional(
				StringEnum(["auto", "fast", "deep"] as const, {
					description:
						"Search type - 'auto': balanced (default), 'fast': quick, 'deep': comprehensive",
				})
			),
			contextMaxCharacters: Type.Optional(
				Type.Number({
					description:
						"Maximum characters for context string (default: 10000)",
				})
			),
		}),

		async execute(_toolCallId, params, onUpdate, _ctx, signal) {
			const {
				query,
				numResults,
				livecrawl = "fallback",
				type = "auto",
				contextMaxCharacters,
			} = params;

			onUpdate?.({
				content: [{ type: "text", text: `Searching for "${query}"...` }],
			});

			const searchRequest: McpSearchRequest = {
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					name: "web_search_exa",
					arguments: {
						query,
						type,
						numResults: numResults || EXA_API_CONFIG.DEFAULT_NUM_RESULTS,
						livecrawl,
						contextMaxCharacters,
					},
				},
			};

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 25000);

			try {
				const signals: AbortSignal[] = [controller.signal];
				if (signal) signals.push(signal);

				const response = await fetch(
					`${EXA_API_CONFIG.BASE_URL}${EXA_API_CONFIG.ENDPOINTS.SEARCH}`,
					{
						method: "POST",
						headers: {
							accept: "application/json, text/event-stream",
							"content-type": "application/json",
						},
						body: JSON.stringify(searchRequest),
						signal: AbortSignal.any(signals),
					}
				);

				clearTimeout(timeoutId);

				if (!response.ok) {
					const errorText = await response.text();
					return {
						content: [
							{
								type: "text",
								text: `Search error (${response.status}): ${errorText}`,
							},
						],
						isError: true,
						details: { query, numResults, type } as WebSearchDetails,
					};
				}

				const responseText = await response.text();

				// Parse SSE response
				const lines = responseText.split("\n");
				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const data: McpSearchResponse = JSON.parse(line.substring(6));
						if (
							data.result &&
							data.result.content &&
							data.result.content.length > 0
						) {
							// Apply truncation to search results
							const truncation = truncateHead(data.result.content[0].text, {
								maxLines: DEFAULT_MAX_LINES,
								maxBytes: DEFAULT_MAX_BYTES,
							});

							let resultText = truncation.content;
							if (truncation.truncated) {
								resultText += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines]`;
							}

							return {
								content: [{ type: "text", text: resultText }],
								details: { query, numResults, type } as WebSearchDetails,
							};
						}
					}
				}

				return {
					content: [
						{
							type: "text",
							text: "No search results found. Please try a different query.",
						},
					],
					details: { query, numResults, type } as WebSearchDetails,
				};
			} catch (error: unknown) {
				clearTimeout(timeoutId);

				if (error instanceof Error && error.name === "AbortError") {
					return {
						content: [
							{ type: "text", text: "Search request timed out or cancelled" },
						],
						isError: true,
						details: { query, numResults, type } as WebSearchDetails,
					};
				}

				return {
					content: [
						{
							type: "text",
							text: `Search error: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					isError: true,
					details: { query, numResults, type } as WebSearchDetails,
				};
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("websearch "));
			text += theme.fg("accent", `"${args.query}"`);
			if (args.type && args.type !== "auto") {
				text += theme.fg("muted", ` (${args.type})`);
			}
			if (args.numResults) {
				text += theme.fg("dim", ` limit=${args.numResults}`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			const details = result.details as WebSearchDetails | undefined;

			if (isPartial) {
				return new Text(theme.fg("warning", "Searching..."), 0, 0);
			}

			if (result.isError) {
				const errorText =
					result.content[0]?.type === "text"
						? (result.content[0] as { type: "text"; text: string }).text
						: "Unknown error";
				return new Text(theme.fg("error", `✗ ${errorText}`), 0, 0);
			}

			let text = theme.fg("success", "✓ Search results");
			if (details?.query) {
				text += theme.fg("muted", ` for "${details.query}"`);
			}

			if (expanded) {
				const content = result.content[0];
				if (content?.type === "text") {
					const lines = (content as { type: "text"; text: string }).text
						.split("\n")
						.slice(0, 30);
					for (const line of lines) {
						text += `\n${theme.fg("dim", line.slice(0, 200))}`;
					}
					if (
						(content as { type: "text"; text: string }).text.split("\n")
							.length > 30
					) {
						text += `\n${theme.fg("muted", "...")}`;
					}
				}
			}

			return new Text(text, 0, 0);
		},
	});
}
