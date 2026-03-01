// @module sgk/audit
// @exports auditRun, AuditRunOpts
// @entry roadmap

import { writeAuditReceipt } from './receipts/audit.js';
import type { AuditVerdict } from './receipts/audit.js';
import { detectStrategyIgnorance } from './detectors/strategy.js';
import { detectChainBreak } from './detectors/chain.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AuditRunOpts {
  runId: string;
  repoRoot: string;
}

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * Run audit detectors and write AuditReceipt.
 * Calls each detector, aggregates verdicts. overallPass = all verdicts pass.
 */
export function auditRun(opts: AuditRunOpts): string {
  const verdicts: AuditVerdict[] = [];

  const strategyResult = detectStrategyIgnorance(opts.repoRoot, opts.runId);
  verdicts.push(strategyResult);

  const chainResult = detectChainBreak(opts.repoRoot, opts.runId);
  verdicts.push(chainResult);

  const overallPass = verdicts.every(v => v.pass);

  return writeAuditReceipt(opts.repoRoot, {
    schema_version: 1,
    type: 'audit',
    runId: opts.runId,
    verdicts,
    overallPass,
    bypassUsage: [],
    auditedAt: new Date().toISOString(),
  });
}
