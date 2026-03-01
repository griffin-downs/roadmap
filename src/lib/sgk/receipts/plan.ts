// @module sgk/receipts/plan
// @exports PlanSelectionReceipt, writePlanReceipt, readPlanReceipt
// @entry roadmap

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface PlanSelectionReceipt {
  schema_version: 1;
  type: 'plan-selection';
  runId: string;
  planId: string;
  candidateSetDigest: string;
  bindingSha: string;
  selectedAt: string;
}

export function writePlanReceipt(repoRoot: string, receipt: PlanSelectionReceipt): string {
  const dir = join(repoRoot, '.roadmap', 'runs', receipt.runId, 'plan');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'SELECT.json');
  writeFileSync(path, JSON.stringify(receipt, null, 2) + '\n');
  return path;
}

export function readPlanReceipt(repoRoot: string, runId: string): PlanSelectionReceipt | null {
  const path = join(repoRoot, '.roadmap', 'runs', runId, 'plan', 'SELECT.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}
