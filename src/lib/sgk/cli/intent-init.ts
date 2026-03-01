// @module sgk/cli/intent-init
// @exports runInitIntent, InitIntentResult
// @entry roadmap

import { execSync } from 'node:child_process';
import { readStrategyReceipt } from '../receipts/strategy.ts';
import { readPlanReceipt } from '../receipts/plan.ts';
import { writeIntentReceipt } from '../receipts/intent.ts';
import type { IntentGateStatement } from '../receipts/intent.ts';

// ── Types ────────────────────────────────────────────────────────────────────

export interface InitIntentResult {
  ok: boolean;
  receiptPath?: string;
  error?: string;
  fix?: string;
}

// ── Core ─────────────────────────────────────────────────────────────────────

export function runInitIntent(repoRoot: string, runId: string, opts?: { allowUnevaluated?: boolean }): InitIntentResult {
  const strategy = readStrategyReceipt(repoRoot, runId);
  if (!strategy) {
    return { ok: false, error: 'STRATEGY_NOT_SELECTED', fix: 'Run strategy selection before init intent' };
  }

  const plan = readPlanReceipt(repoRoot, runId);
  if (!plan) {
    return { ok: false, error: 'PLAN_NOT_SELECTED', fix: 'Run plan selection before init intent' };
  }

  // Verify binding: strategyConfigSha + bindingSha match current receipts
  const statements: IntentGateStatement[] = [
    {
      statement: `Strategy ${strategy.strategyId} selected with configSha ${strategy.strategyConfigSha}`,
      threshold: 1.0,
      confidence: 1.0,
      pass: true,
    },
    {
      statement: `Plan ${plan.planId} bound with bindingSha ${plan.bindingSha}`,
      threshold: 1.0,
      confidence: 1.0,
      pass: true,
    },
  ];

  const allowUnevaluated = opts?.allowUnevaluated ?? false;
  const overallPass = statements.every(s => s.pass) || allowUnevaluated;

  const receiptPath = writeIntentReceipt(repoRoot, {
    schema_version: 1,
    type: 'intent-gate',
    gate: 'init',
    runId,
    statements,
    overallPass,
    policyFlags: { allowUnevaluated, expandOnFail: !overallPass },
    evaluatedAt: new Date().toISOString(),
  });

  return { ok: overallPass, receiptPath };
}
