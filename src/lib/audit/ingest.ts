// @module audit/ingest
// @exports runAuditIngest, parseTranscript, AuditIngestOptions
// @entry roadmap

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { TranscriptSession, ToolCall, RetryEvent, ContaminationEvent, OrphanedAttempt, BypassFlag, EnvVarUsage } from '../transcript-schema.ts';
import { AUDIT_DIR, isToolCall } from '../transcript-schema.ts';

export interface AuditIngestOptions {
  transcriptPath: string;
  dagId?: string;
  repoRoot: string;
}

const BYPASS_FLAGS = ['SKIP_PLAN_GATE', 'SKIP_BATCH_COMMIT', 'ROADMAP_VALIDATING'];

function detectRetries(calls: ToolCall[]): RetryEvent[] {
  const groups = new Map<string, ToolCall[]>();
  for (const c of calls) {
    const key = `${c.tool}::${JSON.stringify(c.args)}`;
    const arr = groups.get(key);
    if (arr) arr.push(c);
    else groups.set(key, [c]);
  }
  const retries: RetryEvent[] = [];
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    retries.push({
      tool: group[0].tool,
      args: group[0].args,
      count: group.length,
      timestamps: group.map(c => c.timestamp),
    });
  }
  return retries;
}

function detectBypassFlags(calls: ToolCall[]): BypassFlag[] {
  const flags: BypassFlag[] = [];
  for (const c of calls) {
    if (c.tool !== 'Bash') continue;
    const cmd = typeof c.args['command'] === 'string' ? c.args['command'] : '';
    for (const flag of BYPASS_FLAGS) {
      if (cmd.includes(flag)) {
        const match = cmd.match(new RegExp(`${flag}=(\\S*)`));
        flags.push({
          flag,
          value: match ? match[1] : 'true',
          timestamp: c.timestamp,
          source: 'env',
        });
      }
    }
  }
  return flags;
}

function detectOrphaned(calls: ToolCall[]): OrphanedAttempt[] {
  const orphaned: OrphanedAttempt[] = [];
  for (const c of calls) {
    if (c.tool !== 'Bash') continue;
    const cmd = typeof c.args['command'] === 'string' ? c.args['command'] : '';
    if (!cmd) continue;
    const trimmed = cmd.trimStart();
    if (trimmed.startsWith('roadmap ') || trimmed.startsWith('bin/roadmap ') || trimmed.startsWith('npx ')) continue;
    if (trimmed.startsWith('cd ') || trimmed.startsWith('git ') || trimmed.startsWith('cat ') || trimmed.startsWith('ls')) continue;
    orphaned.push({
      command: cmd,
      timestamp: c.timestamp,
      reason: 'command outside roadmap CLI surface',
    });
  }
  return orphaned;
}

function detectContamination(calls: ToolCall[]): ContaminationEvent[] {
  const events: ContaminationEvent[] = [];
  for (const c of calls) {
    if (c.tool !== 'Bash') continue;
    const cmd = typeof c.args['command'] === 'string' ? c.args['command'] : '';
    if (!cmd.includes('git add')) continue;
    if (cmd.includes('git add .') || cmd.includes('git add -A')) {
      events.push({
        timestamp: c.timestamp,
        stagedPath: '*',
        producesAllowlist: [],
        detail: `broad staging detected: ${cmd.trim()}`,
      });
    }
  }
  return events;
}

function aggregateFailures(calls: ToolCall[]): { errorCode: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of calls) {
    if (c.success || !c.errorCode) continue;
    counts.set(c.errorCode, (counts.get(c.errorCode) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([errorCode, count]) => ({ errorCode, count }));
}

function coerceToolCall(entry: Record<string, unknown>): ToolCall {
  return {
    tool: String(entry['tool'] ?? 'unknown'),
    args: (typeof entry['args'] === 'object' && entry['args'] !== null && !Array.isArray(entry['args']))
      ? entry['args'] as Record<string, unknown>
      : {},
    timestamp: String(entry['timestamp'] ?? new Date().toISOString()),
    success: entry['success'] === true,
    errorCode: typeof entry['errorCode'] === 'string' ? entry['errorCode'] : undefined,
    durationMs: typeof entry['durationMs'] === 'number' ? entry['durationMs'] : undefined,
  };
}

export function parseTranscript(content: string, dagId?: string): TranscriptSession {
  const sessionId = createHash('sha256').update(content).digest('hex').slice(0, 12);
  const now = new Date().toISOString();

  let entries: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      entries = parsed.filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null);
    } else if (typeof parsed === 'object' && parsed !== null) {
      entries = [parsed as Record<string, unknown>];
    }
  } catch {
    // Try JSONL
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
          entries.push(obj as Record<string, unknown>);
        }
      } catch { /* skip unparseable lines */ }
    }
  }

  if (entries.length === 0) {
    return {
      sessionId,
      startedAt: now,
      dagId,
      toolCalls: [],
      retries: [],
      failures: [],
      bypassFlagsUsed: [],
      envVarUsage: [],
      orphanedAttempts: [],
      crossWorkerContaminationEvents: [],
      timeBetweenBatchesMs: [],
    };
  }

  const toolCalls = entries.map(coerceToolCall);
  const timestamps = toolCalls.map(c => c.timestamp).sort();

  return {
    sessionId,
    startedAt: timestamps[0],
    endedAt: timestamps.length > 1 ? timestamps[timestamps.length - 1] : undefined,
    dagId,
    toolCalls,
    retries: detectRetries(toolCalls),
    failures: aggregateFailures(toolCalls),
    bypassFlagsUsed: detectBypassFlags(toolCalls),
    envVarUsage: [],
    orphanedAttempts: detectOrphaned(toolCalls),
    crossWorkerContaminationEvents: detectContamination(toolCalls),
    timeBetweenBatchesMs: [],
  };
}

export function runAuditIngest(options: AuditIngestOptions): TranscriptSession {
  const content = readFileSync(options.transcriptPath, 'utf-8');
  const session = parseTranscript(content, options.dagId);

  const auditDir = join(options.repoRoot, AUDIT_DIR);
  if (!existsSync(auditDir)) mkdirSync(auditDir, { recursive: true });

  const outPath = join(auditDir, `${session.sessionId}.json`);
  writeFileSync(outPath, JSON.stringify(session, null, 2));

  return session;
}
