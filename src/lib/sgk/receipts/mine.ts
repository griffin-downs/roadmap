// @module sgk/receipts/mine
// @exports MiningReceipt, writeMineReceipt, readMineReceipt
// @entry roadmap

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface MiningReceipt {
  schema_version: 1;
  type: 'mining';
  runId: string;
  toolCallCounts: Record<string, number>;
  latencyP50Ms: number;
  latencyP95Ms: number;
  hotspots: string[];
  friction: string[];
  minedAt: string;
}

export function writeMineReceipt(repoRoot: string, receipt: MiningReceipt): string {
  const dir = join(repoRoot, '.roadmap', 'runs', receipt.runId, 'mine');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'MINE.json');
  writeFileSync(path, JSON.stringify(receipt, null, 2) + '\n');
  return path;
}

export function readMineReceipt(repoRoot: string, runId: string): MiningReceipt | null {
  const path = join(repoRoot, '.roadmap', 'runs', runId, 'mine', 'MINE.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}
