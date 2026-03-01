// @module sgk/receipts/strategy
// @exports StrategySelectionReceipt, writeStrategyReceipt, readStrategyReceipt
// @entry roadmap

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface StrategySelectionReceipt {
  schema_version: 1;
  type: 'strategy-selection';
  runId: string;
  selectionMode: 'auto' | 'manual';
  strategyId: string;
  autoSelectEvidence?: string;
  strategyConfigSha: string;
  constraints: string[];
  selectedAt: string;
}

export function writeStrategyReceipt(repoRoot: string, receipt: StrategySelectionReceipt): string {
  const dir = join(repoRoot, '.roadmap', 'runs', receipt.runId, 'strategy');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'SELECT.json');
  writeFileSync(path, JSON.stringify(receipt, null, 2) + '\n');
  return path;
}

export function readStrategyReceipt(repoRoot: string, runId: string): StrategySelectionReceipt | null {
  const path = join(repoRoot, '.roadmap', 'runs', runId, 'strategy', 'SELECT.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}
