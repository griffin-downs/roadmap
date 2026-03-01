// @module metaflow/audit
// @exports runAudit, loadRequired

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AuditContract, AuditReport, DetectorResult } from './required-schema.ts';
import { readMining } from '../phases/opt-dag.ts';
import { buildReport } from './report.ts';
import { writeAuditReceipt } from './receipt.ts';

export type Detector = (runId: string, contract: AuditContract, base: string) => DetectorResult;

export function loadRequired(base = process.cwd()): AuditContract {
  const p = join(base, '.roadmap', 'metaflow', 'audit', 'REQUIRED.json');
  if (!existsSync(p)) throw new Error(`REQUIRED.json not found at ${p}`);
  return JSON.parse(readFileSync(p, 'utf8')) as AuditContract;
}

export interface RunAuditOpts {
  base?: string;
  treeSha?: string;
  sessionIds?: string[];
}

export function runAudit(
  runId: string,
  detectors: Detector[],
  opts: RunAuditOpts = {},
): AuditReport {
  const base = opts.base ?? process.cwd();
  const contract = loadRequired(base);
  const treeSha = opts.treeSha ?? 'unknown';
  const sessionIds = opts.sessionIds ?? [];

  const results: DetectorResult[] = detectors.map(d => d(runId, contract, base));
  const report = buildReport(runId, treeSha, sessionIds, results, contract);

  // Write report
  const reportDir = join(base, '.roadmap', 'metaflow', 'audit');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, `${runId}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Write receipt
  writeAuditReceipt(runId, treeSha, sessionIds, report, base);

  return report;
}
