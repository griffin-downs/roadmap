// @module sgk/cli/dispatch-gates
// @exports DispatchGateResult, checkDispatchGates
// @entry roadmap

import { readStrategyReceipt } from '../receipts/strategy.ts';
import { readPlanReceipt } from '../receipts/plan.ts';
import { readIntentReceipt } from '../receipts/intent.ts';

export interface DispatchGateResult {
  ok: boolean;
  missing: string[];
  fix: string[];
}

export function checkDispatchGates(repoRoot: string, runId: string): DispatchGateResult {
  const missing: string[] = [];
  const fix: string[] = [];

  const strategy = readStrategyReceipt(repoRoot, runId);
  if (!strategy) {
    missing.push('STRATEGY_NOT_SELECTED');
    fix.push('Run strategy selection before dispatch');
  }

  const plan = readPlanReceipt(repoRoot, runId);
  if (!plan) {
    missing.push('PLAN_NOT_SELECTED');
    fix.push('Run plan selection before dispatch');
  }

  const initIntent = readIntentReceipt(repoRoot, runId, 'init');
  if (!initIntent) {
    missing.push('INIT_INTENT_MISSING');
    fix.push('Evaluate init intent gate before dispatch');
  } else if (!initIntent.overallPass) {
    missing.push('INIT_INTENT_FAILED');
    fix.push('Init intent gate did not pass — review statements or expand');
  }

  return { ok: missing.length === 0, missing, fix };
}
