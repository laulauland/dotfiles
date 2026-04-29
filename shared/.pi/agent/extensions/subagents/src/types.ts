import type { AgentSession } from "@mariozechner/pi-coding-agent";

export type AgentStatus = "queued" | "running" | "completed" | "error" | "stopped" | "aborted";

export interface AgentRecord {
  id: string;
  description: string;
  prompt: string;
  status: AgentStatus;
  result?: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
  abortController: AbortController;
  promise?: Promise<void>;
  done: Promise<void>;
  resolveDone: () => void;
  session?: AgentSession;
  toolUses: number;
  activeTools: Map<string, string>;
  latestText: string;
  turnCount: number;
  maxTurns?: number;
  resultConsumed?: boolean;
  pendingSteers?: string[];
  groupId?: string;
}

export interface NotificationDetails {
  id: string;
  description: string;
  status: string;
  toolUses: number;
  turnCount: number;
  durationMs: number;
  error?: string;
  resultPreview: string;
  others?: NotificationDetails[];
}
