// @module blend-receipt
// @exports BlendReceipt, writeBlendReceipt, readBlendLedger
// @types BlendReceipt, GuardResult, StatementOwnership, CheckSet, CheckEntry
// @entry roadmap

import { appendFileSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export interface GuardResult {
  guardName: string;
  passed: boolean;
  evidence?: string;
}

export interface StatementOwnership {
  statement: string;
  ownerNodeId: string;
  provenance: string[]; // source → transform → output chain
}

export type CheckStatus = 'pass' | 'fail' | 'skip';

export interface CheckEntry {
  checkId: string;
  description: string;
  status: CheckStatus;
  rollbackEvidence?: string;
}

export interface CheckSet {
  checks: CheckEntry[];
  allPassed: boolean;
}

export interface BlendReceipt {
  schema_version: 1;
  blendId: string;
  timestamp: string;        // ISO 8601
  repoRoot: string;
  headSha: string;
  inputs: string[];         // candidate IDs
  outputId: string;         // blended result id
  guardResults: GuardResult[];
  statementOwnership: StatementOwnership[];
  checkSet: CheckSet;
  output: { statementCount: number; sha256: string };
  ok: boolean;
}

export function generateBlendId(): string {
  return randomUUID();
}

export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

const LEDGER_PATH = (repoRoot: string) => join(repoRoot, '.roadmap', 'blend-ledger.jsonl');
const RECEIPT_DIR = (repoRoot: string) => join(repoRoot, '.roadmap', 'receipts', 'blend');

/** Write receipt to per-blend JSON + append to NDJSON ledger. Returns receipt JSON path. */
export function writeBlendReceipt(receipt: BlendReceipt, repoRoot: string): string {
  const ledgerDir = join(repoRoot, '.roadmap');
  if (!existsSync(ledgerDir)) mkdirSync(ledgerDir, { recursive: true });
  appendFileSync(LEDGER_PATH(repoRoot), JSON.stringify(receipt) + '\n', 'utf-8');

  const receiptDir = RECEIPT_DIR(repoRoot);
  if (!existsSync(receiptDir)) mkdirSync(receiptDir, { recursive: true });
  const receiptPath = join(receiptDir, `blend-${receipt.blendId}.json`);
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', 'utf-8');

  return receiptPath;
}

export function readBlendLedger(repoRoot: string): BlendReceipt[] {
  const path = LEDGER_PATH(repoRoot);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .trim().split('\n').filter(Boolean)
    .map(line => JSON.parse(line) as BlendReceipt);
}
