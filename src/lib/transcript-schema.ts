// @module transcript-schema
// @exports ToolCall, RetryEvent, BypassFlag, EnvVarUsage, ContaminationEvent, OrphanedAttempt, TranscriptSession, AUDIT_DIR, ROADMAP_CLI_COMMANDS, isTranscriptSession, isToolCall
// @types ToolCall, RetryEvent, BypassFlag, EnvVarUsage, ContaminationEvent, OrphanedAttempt, TranscriptSession
// @entry roadmap

// Type definitions for transcript ingestion. Transcripts are regent JSONL or
// equivalent session records capturing all tool calls and outcomes.

/** Single tool invocation record. */
export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  timestamp: string;
  durationMs?: number;
  success: boolean;
  errorCode?: string;
}

/** Aggregated retry sequence for a single tool+args combination. */
export interface RetryEvent {
  tool: string;
  args: Record<string, unknown>;
  count: number;
  timestamps: string[];
}

/** Bypass flag observed during a session. */
export interface BypassFlag {
  flag: string;
  value: string;
  timestamp: string;
  source: 'env' | 'cli';
}

/** Environment variable read during a session. */
export interface EnvVarUsage {
  name: string;
  value?: string;
  timestamp: string;
  deprecated: boolean;
}

/** Staged file outside the node's produces allowlist. */
export interface ContaminationEvent {
  timestamp: string;
  stagedPath: string;
  producesAllowlist: string[];
  nodeId?: string;
  detail: string;
}

/** Command executed outside the roadmap CLI surface. */
export interface OrphanedAttempt {
  command: string;
  timestamp: string;
  reason: string;
}

/** Full transcript for one agent session. */
export interface TranscriptSession {
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  dagId?: string;
  toolCalls: ToolCall[];
  retries: RetryEvent[];
  failures: { errorCode: string; count: number }[];
  bypassFlagsUsed: BypassFlag[];
  envVarUsage: EnvVarUsage[];
  orphanedAttempts: OrphanedAttempt[];
  crossWorkerContaminationEvents: ContaminationEvent[];
  timeBetweenBatchesMs: number[];
}

export const AUDIT_DIR = '.roadmap/audit' as const;

export const ROADMAP_CLI_COMMANDS: string[] = [
  'orient', 'advance', 'complete', 'validate', 'chart', 'show', 'claim',
  'intake', 'plan', 'patch', 'gate', 'audit', 'profile', 'env-audit',
  'receipts', 'completion',
];

// --- Type guards ---

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function isToolCall(x: unknown): x is ToolCall {
  if (!isRecord(x)) return false;
  return (
    typeof x['tool'] === 'string' &&
    isRecord(x['args']) &&
    typeof x['timestamp'] === 'string' &&
    typeof x['success'] === 'boolean'
  );
}

export function isTranscriptSession(x: unknown): x is TranscriptSession {
  if (!isRecord(x)) return false;
  return (
    typeof x['sessionId'] === 'string' &&
    typeof x['startedAt'] === 'string' &&
    Array.isArray(x['toolCalls']) &&
    Array.isArray(x['retries']) &&
    Array.isArray(x['failures']) &&
    Array.isArray(x['bypassFlagsUsed']) &&
    Array.isArray(x['envVarUsage']) &&
    Array.isArray(x['orphanedAttempts']) &&
    Array.isArray(x['crossWorkerContaminationEvents']) &&
    Array.isArray(x['timeBetweenBatchesMs'])
  );
}
