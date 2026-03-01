// @module sgk/receipts/intent
// @exports IntentGateStatement, IntentGateReceipt, writeIntentReceipt, readIntentReceipt
// @entry roadmap

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface IntentGateStatement {
  statement: string;
  threshold: number;
  confidence: number;
  pass: boolean;
}

export interface IntentGateReceipt {
  schema_version: 1;
  type: 'intent-gate';
  gate: 'init' | 'term';
  runId: string;
  statements: IntentGateStatement[];
  overallPass: boolean;
  policyFlags: {
    allowUnevaluated: boolean;
    expandOnFail: boolean;
  };
  evaluatedAt: string;
  evidencePointers?: string[];
}

export function writeIntentReceipt(repoRoot: string, receipt: IntentGateReceipt): string {
  const dir = join(repoRoot, '.roadmap', 'runs', receipt.runId, 'intent');
  mkdirSync(dir, { recursive: true });
  const filename = receipt.gate === 'init' ? 'INIT.json' : 'TERM.json';
  const path = join(dir, filename);
  writeFileSync(path, JSON.stringify(receipt, null, 2) + '\n');
  return path;
}

export function readIntentReceipt(repoRoot: string, runId: string, gate: 'init' | 'term'): IntentGateReceipt | null {
  const filename = gate === 'init' ? 'INIT.json' : 'TERM.json';
  const path = join(repoRoot, '.roadmap', 'runs', runId, 'intent', filename);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}
