// @module sgk/receipts/close
// @exports RunCloseReceipt, writeCloseReceipt, readCloseReceipt
// @entry roadmap

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface RunCloseReceipt {
  schema_version: 1;
  type: 'run-close';
  runId: string;
  ok: boolean;
  requiredReceipts: {
    termIntent: boolean;
    mine: boolean;
    audit: boolean;
    display: boolean;
  };
  closedAt: string;
}

export function writeCloseReceipt(repoRoot: string, receipt: RunCloseReceipt): string {
  const dir = join(repoRoot, '.roadmap', 'runs', receipt.runId);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'CLOSE.json');
  writeFileSync(path, JSON.stringify(receipt, null, 2) + '\n');
  return path;
}

export function readCloseReceipt(repoRoot: string, runId: string): RunCloseReceipt | null {
  const path = join(repoRoot, '.roadmap', 'runs', runId, 'CLOSE.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}
