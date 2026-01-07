/**
 * Core types for pi-mcp extension
 */

import { Data } from "effect";

// ============================================================================
// Error Types
// ============================================================================

export type McpErrorCode = "auth_required" | "server_error" | "not_found" | "transport_error";

export class McpError extends Data.TaggedError("McpError")<{
	code: McpErrorCode;
	message: string;
	auth_command?: string; // for auth_required
	server?: string;
}> {}

// Convenience constructors
export const AuthRequired = (server: string, auth_command: string) =>
	new McpError({
		code: "auth_required",
		message: `Server ${server} requires authentication`,
		auth_command,
		server,
	});

export const ServerError = (server: string, message: string) =>
	new McpError({
		code: "server_error",
		message,
		server,
	});

export const NotFound = (server: string) =>
	new McpError({
		code: "not_found",
		message: `Server ${server} not found`,
		server,
	});

export const TransportError = (server: string, message: string) =>
	new McpError({
		code: "transport_error",
		message,
		server,
	});

// ============================================================================
// Server Types
// ============================================================================

export type ServerState = "ready" | "auth_required" | "error" | "offline";

export interface ServerInfo {
	name: string;
	version: string;
}

export interface ServerStatus {
	state: ServerState;
	checked_at: string; // ISO timestamp
	message: string | null;
	auth_command: string;
	tool_count: number;
	server_info: ServerInfo | null;
}

export interface ServerConfig {
	name: string;
	type: "http" | "stdio";
	url?: string; // for http
	command?: string; // for stdio
	args?: string[]; // for stdio
}

// ============================================================================
// Tool Types
// ============================================================================

export type JSONSchema = Record<string, unknown>;

export interface McpTool {
	name: string;
	description: string;
	inputSchema: JSONSchema;
}

// ============================================================================
// Result Types
// ============================================================================

export interface ToolResult {
	content: unknown;
	isError?: boolean;
}
