// @module sgk/cli/intent-term
// @exports runTermIntent, TermIntentResult
// @entry roadmap

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readIntentReceipt, writeIntentReceipt } from '../receipts/intent.ts';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TermIntentResult {
  ok: boolean;
  receiptPath?: string;
  error?: string;
  fix?: string;
}

// ── Core ─────────────────────────────────────────────────────────────────────

export function runTermIntent(repoRoot: string, runId: string, opts?: { allowUnevaluated?: boolean }): TermIntentResult {
  // 1. Verify init intent exists and passed
  const initReceipt = readIntentReceipt(repoRoot, runId, 'init');
  if (!initReceipt) {
    return { ok: false, error: 'INIT_INTENT_MISSING', fix: 'Run init intent gate before term intent' };
  }
  if (!initReceipt.overallPass) {
    return { ok: false, error: 'INIT_INTENT_FAILED', fix: 'Init intent gate did not pass — review statements or expand' };
  }

  // 2. Collect evidence pointers from display + mine receipts if present
  const evidencePointers: string[] = [];
  const displayPath = join(repoRoot, '.roadmap', 'runs', runId, 'display', 'DISPLAY.json');
  if (existsSync(displayPath)) evidencePointers.push(displayPath);
  const minePath = join(repoRoot, '.roadmap', 'runs', runId, 'mine', 'MINE.json');
  if (existsSync(minePath)) evidencePointers.push(minePath);

  const allowUnevaluated = opts?.allowUnevaluated ?? false;

  // 3. Carry forward init statements as term evaluation basis
  const overallPass = initReceipt.overallPass || allowUnevaluated;

  const receiptPath = writeIntentReceipt(repoRoot, {
    schema_version: 1,
    type: 'intent-gate',
    gate: 'term',
    runId,
    statements: initReceipt.statements,
    overallPass,
    policyFlags: { allowUnevaluated, expandOnFail: !overallPass },
    evaluatedAt: new Date().toISOString(),
    evidencePointers: evidencePointers.length > 0 ? evidencePointers : undefined,
  });

  return { ok: overallPass, receiptPath };
}
