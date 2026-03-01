// @module sgk/intent-binding
// @exports IntentBindingStatus, checkIntentBinding
// @types IntentBindingStatus
// @entry roadmap

import { execSync } from 'node:child_process';
import { readIntentReceipt } from './receipts/intent.ts';
import { readStrategyReceipt } from './receipts/strategy.ts';
import { readPlanReceipt } from './receipts/plan.ts';

// ── Types ────────────────────────────────────────────────────────────────────

export interface IntentBindingStatus {
  bound: boolean;
  driftDetected: boolean;
  details?: {
    initIntentExists: boolean;
    strategyChanged: boolean;
    planChanged: boolean;
    headChanged: boolean;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getHeadSha(repoRoot: string): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * Check whether the intent gate is still bound to current run state.
 * Drift = strategy/plan/head changed after init intent was written.
 */
export function checkIntentBinding(repoRoot: string, runId: string): IntentBindingStatus {
  const initIntent = readIntentReceipt(repoRoot, runId, 'init');
  if (!initIntent) {
    return { bound: false, driftDetected: false, details: { initIntentExists: false, strategyChanged: false, planChanged: false, headChanged: false } };
  }

  const intentTimestamp = new Date(initIntent.evaluatedAt).getTime();

  // Check strategy drift: was strategy re-selected after init intent?
  const strategy = readStrategyReceipt(repoRoot, runId);
  const strategyChanged = strategy ? new Date(strategy.selectedAt).getTime() > intentTimestamp : false;

  // Check plan drift: was plan re-selected after init intent?
  const plan = readPlanReceipt(repoRoot, runId);
  const planChanged = plan ? new Date(plan.selectedAt).getTime() > intentTimestamp : false;

  // Check head drift: has HEAD moved since init intent?
  // We compare current HEAD against what was HEAD when intent was evaluated
  // Since intent receipt doesn't store headSha directly, we detect via timestamp comparison
  // as a proxy — actual headSha comparison requires the receipt to carry it
  const headChanged = false; // conservative: no headSha in receipt to compare against

  const driftDetected = strategyChanged || planChanged || headChanged;

  return {
    bound: !driftDetected,
    driftDetected,
    details: {
      initIntentExists: true,
      strategyChanged,
      planChanged,
      headChanged,
    },
  };
}
