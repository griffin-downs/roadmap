// @module metaflow/audit
// @exports writeAuditReceipt, readAuditReceipt, auditReceiptExists

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AuditReceipt, AuditReport } from './required-schema.ts';

function receiptPath(runId: string, base: string): string {
  return join(base, '.roadmap', 'receipts', `audit-${runId}.json`);
}

export function writeAuditReceipt(
  runId: string,
  treeSha: string,
  sessionIds: string[],
  report: AuditReport,
  base = process.cwd(),
): AuditReceipt {
  const receipt: AuditReceipt = {
    schema_version: 1,
    runId,
    treeSha,
    sessionIds,
    passed: report.passed,
    reason: report.passed ? undefined : `${report.detectorResults.filter(r => !r.passed).length} detector(s) failed`,
    reportPath: join('.roadmap', 'metaflow', 'audit', `${runId}.json`),
    emittedAt: new Date().toISOString(),
  };

  const p = receiptPath(runId, base);
  mkdirSync(join(base, '.roadmap', 'receipts'), { recursive: true });
  writeFileSync(p, JSON.stringify(receipt, null, 2));

  return receipt;
}

export function readAuditReceipt(runId: string, base = process.cwd()): AuditReceipt {
  const p = receiptPath(runId, base);
  if (!existsSync(p)) throw new Error(`Audit receipt not found for run ${runId}`);
  return JSON.parse(readFileSync(p, 'utf8')) as AuditReceipt;
}

export function auditReceiptExists(runId: string, base = process.cwd()): boolean {
  return existsSync(receiptPath(runId, base));
}
