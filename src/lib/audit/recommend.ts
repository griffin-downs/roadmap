// @module audit/recommend
// @exports runAuditRecommend, AuditRecommendation, AuditRecommendResult, AuditRecommendReceipt
// @types AuditRecommendation, AuditRecommendResult, AuditRecommendReceipt
// @entry roadmap

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { TranscriptSession } from '../transcript-schema.ts';
import { AUDIT_DIR, isTranscriptSession } from '../transcript-schema.ts';
import { computeFriction } from '../friction-engine.ts';

export interface AuditRecommendation {
  type: 'kernel-modification' | 'new-spec-node' | 'index-isolation' | 'env-var-deprecation' | 'high-friction-pattern';
  severity: 'high' | 'medium' | 'low';
  evidence: string[];
  suggestion: string;
  kernelJsonKey?: string;
  suggestedNodeSpec?: string;
}

export interface AuditRecommendResult {
  sessionId?: string;
  recommendations: AuditRecommendation[];
  frictionScore: number;
  checkedAt: string;
}

export interface AuditRecommendReceipt {
  schemaVersion: 1;
  receiptType: 'audit-recommendation';
  recommendationId: string;
  sessionId?: string;
  recommendationCount: number;
  frictionScore: number;
  timestamp: string;
}

function loadSession(repoRoot: string, sessionId?: string): TranscriptSession | undefined {
  const auditDir = join(repoRoot, AUDIT_DIR);
  if (!existsSync(auditDir)) return undefined;

  if (sessionId) {
    const path = join(auditDir, `${sessionId}.json`);
    if (!existsSync(path)) return undefined;
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    return isTranscriptSession(data) ? data : undefined;
  }

  // Pick most recent by startedAt
  const files = readdirSync(auditDir).filter(f => f.endsWith('.json'));
  if (files.length === 0) return undefined;

  let latest: TranscriptSession | undefined;
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(join(auditDir, f), 'utf-8'));
      if (!isTranscriptSession(data)) continue;
      if (!latest || data.startedAt > latest.startedAt) latest = data;
    } catch { /* skip corrupt files */ }
  }
  return latest;
}

export function runAuditRecommend(options: { sessionId?: string; repoRoot: string }): AuditRecommendResult {
  const session = loadSession(options.repoRoot, options.sessionId);
  if (!session) {
    return {
      sessionId: options.sessionId,
      recommendations: [],
      frictionScore: 0,
      checkedAt: new Date().toISOString(),
    };
  }

  const friction = computeFriction(session);
  const recommendations: AuditRecommendation[] = [];

  if (friction.metrics.crossIndexContamination > 0) {
    recommendations.push({
      type: 'index-isolation',
      severity: 'high',
      evidence: session.crossWorkerContaminationEvents.map(e => `${e.stagedPath} at ${e.timestamp}: ${e.detail}`),
      suggestion: 'Use git index isolation per node (GIT_INDEX_FILE pattern)',
    });
  }

  if (friction.metrics.bypassUsage > 0) {
    recommendations.push({
      type: 'env-var-deprecation',
      severity: 'medium',
      evidence: session.bypassFlagsUsed.map(b => `${b.flag}=${b.value} via ${b.source} at ${b.timestamp}`),
      suggestion: 'Bypass flags indicate policy gaps — tighten kernel policy or deprecate the flag',
      kernelJsonKey: 'policy.bypassFlags',
    });
  }

  if (friction.metrics.retryRate > 0.2) {
    recommendations.push({
      type: 'high-friction-pattern',
      severity: 'medium',
      evidence: session.retries.map(r => `${r.tool} retried ${r.count}x`),
      suggestion: 'High retry rate indicates flaky tooling or misconfigured environment',
    });
  }

  if (friction.metrics.toolEntropy > 0.5) {
    recommendations.push({
      type: 'new-spec-node',
      severity: 'low',
      evidence: [`toolEntropy=${friction.metrics.toolEntropy.toFixed(3)}`],
      suggestion: 'High tool entropy suggests node is too coarse — split into sub-nodes',
      suggestedNodeSpec: 'Split node along tool-usage boundaries',
    });
  }

  if (friction.metrics.headDrift > 0) {
    recommendations.push({
      type: 'kernel-modification',
      severity: 'high',
      evidence: [
        `headDrift=${friction.metrics.headDrift}`,
        ...session.timeBetweenBatchesMs.filter(g => g > 60_000).map(g => `batchGap=${g}ms`),
      ],
      suggestion: 'Enable index isolation to prevent HEAD drift during parallel execution',
      kernelJsonKey: 'policy.indexIsolation',
    });
  }

  // Write receipt
  const now = new Date().toISOString();
  const receiptId = createHash('sha256')
    .update(`${session.sessionId}:${now}`)
    .digest('hex')
    .slice(0, 12);

  const receipt: AuditRecommendReceipt = {
    schemaVersion: 1,
    receiptType: 'audit-recommendation',
    recommendationId: receiptId,
    sessionId: session.sessionId,
    recommendationCount: recommendations.length,
    frictionScore: friction.frictionScore,
    timestamp: now,
  };

  const receiptsDir = join(options.repoRoot, '.roadmap', 'receipts');
  if (!existsSync(receiptsDir)) mkdirSync(receiptsDir, { recursive: true });
  writeFileSync(
    join(receiptsDir, `audit-recommendation-${receiptId}.json`),
    JSON.stringify(receipt, null, 2),
  );

  return {
    sessionId: session.sessionId,
    recommendations,
    frictionScore: friction.frictionScore,
    checkedAt: now,
  };
}
