// @module sgk/receipts/display
// @exports RenderedBlock, DisplayReceipt, writeDisplayReceipt, readDisplayReceipt
// @entry roadmap

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface RenderedBlock {
  type: 'chart' | 'orient' | 'parallel' | 'json';
  content: string;
  byteLength: number;
}

export interface DisplayReceipt {
  schema_version: 1;
  type: 'display';
  runId: string;
  cmd: string;
  humanMode: boolean;
  renderedBlocks: RenderedBlock[];
  displayedAt: string;
}

export function writeDisplayReceipt(repoRoot: string, receipt: DisplayReceipt): string {
  const dir = join(repoRoot, '.roadmap', 'runs', receipt.runId, 'display');
  mkdirSync(dir, { recursive: true });
  const stamp = receipt.displayedAt.replace(/[:.]/g, '-');
  const path = join(dir, `${stamp}.json`);
  writeFileSync(path, JSON.stringify(receipt, null, 2) + '\n');
  return path;
}

export function readDisplayReceipt(repoRoot: string, runId: string, stamp: string): DisplayReceipt | null {
  const path = join(repoRoot, '.roadmap', 'runs', runId, 'display', `${stamp}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}
