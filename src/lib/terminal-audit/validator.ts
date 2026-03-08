// @module terminal-audit/validator
// @description Terminal audit — computed report + gap detection (informational, no gate)
// @exports TerminalAuditContext, runAudit

import type { Graph } from '../../protocol.ts';
import type { CompletionRecordWithEvidence } from '../evidence/completion-evidence.ts';
import { computeReport, type ComputedReport } from './computed.ts';
import { detectGaps, type DetectionResult } from './detected.ts';

// --- Types ---

/** Informational audit context: mechanical analysis + gap detection */
export interface TerminalAuditContext {
  computed: ComputedReport;
  detected: DetectionResult;
}

// --- Run audit (informational) ---

/**
 * Run terminal audit: compute report + detect gaps.
 * Returns informational summary — not a gate, not a blocker.
 */
export function runAudit(
  dag: Graph<string>,
  records: Map<string, CompletionRecordWithEvidence>,
  exists: (artifact: string) => boolean,
): TerminalAuditContext {
  const computed = computeReport(dag, records, exists);
  const detected = detectGaps(dag);
  return { computed, detected };
}
