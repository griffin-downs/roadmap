// @module profile-cmd
// @exports runProfile, ProfileOptions
// @entry roadmap

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ProfileReport, NodeProfile, EfficiencyWarning } from './profile-schema.ts';
import { DEFAULT_PROFILE_CONFIG, PROFILE_REPORT_PATH, computeParallelismUtilization } from './profile-schema.ts';
import type { TranscriptSession } from './transcript-schema.ts';
import { AUDIT_DIR, isTranscriptSession } from './transcript-schema.ts';

export interface ProfileOptions {
  repoRoot: string;
  nodeId?: string;
  lastN?: number;
}

export function runProfile(options: ProfileOptions): ProfileReport {
  const auditPath = join(options.repoRoot, AUDIT_DIR);
  let sessions: TranscriptSession[] = [];

  if (existsSync(auditPath)) {
    for (const file of readdirSync(auditPath).filter(f => f.endsWith('.json'))) {
      try {
        const raw = JSON.parse(readFileSync(join(auditPath, file), 'utf-8'));
        if (isTranscriptSession(raw)) sessions.push(raw);
      } catch { /* skip malformed */ }
    }
  }

  // Sort by startedAt ascending
  sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  if (options.lastN !== undefined && options.lastN > 0) {
    sessions = sessions.slice(-options.lastN);
  }

  // nodeId filter is a stub — sessions don't carry per-node breakdown yet
  // If provided, it's acknowledged but all sessions are included

  const nodeProfiles: Record<string, NodeProfile> = {};
  const warnings: EfficiencyWarning[] = [];
  let totalCommands = 0;
  let totalLatencyMs = 0;

  for (const session of sessions) {
    const commandCount = session.toolCalls.length;
    const validatorRuns = session.toolCalls.filter(
      tc => tc.tool === 'Bash' && typeof tc.args['command'] === 'string' &&
        (/\btsc\b/.test(tc.args['command'] as string) || /\bvitest\b/.test(tc.args['command'] as string))
    ).length;
    const durations = session.toolCalls.map(tc => tc.durationMs ?? 0);
    const avgLatencyMs = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;
    const bypassCount = session.bypassFlagsUsed.length;
    const retryCount = session.retries.reduce((sum, r) => sum + r.count, 0);
    const sessionLatency = durations.reduce((a, b) => a + b, 0);

    const profile: NodeProfile = {
      nodeId: session.sessionId,
      commandCount,
      validatorRuns,
      avgLatencyMs: Math.round(avgLatencyMs),
      bypassCount,
      retryCount,
    };
    nodeProfiles[session.sessionId] = profile;
    totalCommands += commandCount;
    totalLatencyMs += sessionLatency;

    if (commandCount > DEFAULT_PROFILE_CONFIG.commandCountThreshold) {
      warnings.push({
        nodeId: session.sessionId,
        reason: `commandCount ${commandCount} exceeds threshold ${DEFAULT_PROFILE_CONFIG.commandCountThreshold}`,
        commandCount,
        threshold: DEFAULT_PROFILE_CONFIG.commandCountThreshold,
      });
    }
  }

  const batchParallelismUtilization = computeParallelismUtilization(
    sessions.length > 0 ? [sessions.length] : []
  );

  const report: ProfileReport = {
    reportId: `profile-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    sessionIds: sessions.map(s => s.sessionId),
    nodeProfiles,
    batchParallelismUtilization,
    efficiencyWarnings: warnings,
    totalCommands,
    totalLatencyMs: Math.round(totalLatencyMs),
  };

  writeFileSync(
    join(options.repoRoot, PROFILE_REPORT_PATH),
    JSON.stringify(report, null, 2) + '\n',
  );

  return report;
}
