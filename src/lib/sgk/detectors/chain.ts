// @module sgk/detectors/chain
// @exports detectChainBreak, ChainDetectorResult
// @entry roadmap

import { checkIntentBinding } from '../intent-binding.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChainDetectorResult {
  check: 'chain-integrity';
  pass: boolean;
  evidence?: string;
}

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * Detect breaks in the receipt chain: strategy re-selected after init intent,
 * plan re-selected after init intent, or other drift.
 */
export function detectChainBreak(repoRoot: string, runId: string): ChainDetectorResult {
  const binding = checkIntentBinding(repoRoot, runId);

  if (!binding.details?.initIntentExists) {
    return { check: 'chain-integrity', pass: false, evidence: `No init intent receipt found for run ${runId}` };
  }

  if (binding.driftDetected) {
    const drifts: string[] = [];
    if (binding.details.strategyChanged) drifts.push('strategy re-selected after init intent');
    if (binding.details.planChanged) drifts.push('plan re-selected after init intent');
    if (binding.details.headChanged) drifts.push('HEAD moved after init intent');
    return { check: 'chain-integrity', pass: false, evidence: `Chain drift: ${drifts.join(', ')}` };
  }

  return { check: 'chain-integrity', pass: true, evidence: 'Receipt chain intact — no drift detected' };
}
