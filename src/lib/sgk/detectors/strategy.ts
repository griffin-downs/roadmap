// @module sgk/detectors/strategy
// @exports detectStrategyIgnorance, StrategyDetectorResult
// @entry roadmap

import { readStrategyReceipt } from '../receipts/strategy.ts';

// ── Types ────────────────────────────────────────────────────────────────────

export interface StrategyDetectorResult {
  check: 'strategy-selected';
  pass: boolean;
  evidence?: string;
}

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * Detect if a strategy was selected for this run.
 * Fails if no StrategySelectionReceipt exists for runId.
 */
export function detectStrategyIgnorance(repoRoot: string, runId: string): StrategyDetectorResult {
  const receipt = readStrategyReceipt(repoRoot, runId);
  if (!receipt) {
    return { check: 'strategy-selected', pass: false, evidence: `No strategy receipt found for run ${runId}` };
  }
  return { check: 'strategy-selected', pass: true, evidence: `Strategy ${receipt.strategyId} selected at ${receipt.selectedAt}` };
}
