// @module sgk/receipts/audit
// @exports AuditVerdict, AuditReceipt, writeAuditReceipt, readAuditReceipt
// @entry roadmap

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface AuditVerdict {
  check: string;
  pass: boolean;
  evidence?: string;
}

export interface AuditReceipt {
  schema_version: 1;
  type: 'audit';
  runId: string;
  verdicts: AuditVerdict[];
  overallPass: boolean;
  bypassUsage: string[];
  auditedAt: string;
}

export function writeAuditReceipt(repoRoot: string, receipt: AuditReceipt): string {
  const dir = join(repoRoot, '.roadmap', 'runs', receipt.runId, 'audit');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'AUDIT.json');
  writeFileSync(path, JSON.stringify(receipt, null, 2) + '\n');
  return path;
}

export function readAuditReceipt(repoRoot: string, runId: string): AuditReceipt | null {
  const path = join(repoRoot, '.roadmap', 'runs', runId, 'audit', 'AUDIT.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}
