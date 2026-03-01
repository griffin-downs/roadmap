// @module sgk/cli/close-gates
// @exports CloseGateResult, checkCloseGates
// @entry roadmap

import { readIntentReceipt } from '../receipts/intent.js';
import { readMineReceipt } from '../receipts/mine.js';
import { readAuditReceipt } from '../receipts/audit.js';

export interface CloseGateResult {
  ok: boolean;
  missing: string[];
  fix: string[];
}

export function checkCloseGates(repoRoot: string, runId: string): CloseGateResult {
  const missing: string[] = [];
  const fix: string[] = [];

  const termIntent = readIntentReceipt(repoRoot, runId, 'term');
  if (!termIntent) {
    missing.push('TERM_INTENT_MISSING');
    fix.push('Evaluate term intent gate before closing run');
  } else if (!termIntent.overallPass) {
    missing.push('TERM_INTENT_FAILED');
    fix.push('Term intent gate did not pass — review statements or expand');
  }

  const mine = readMineReceipt(repoRoot, runId);
  if (!mine) {
    missing.push('MINE_RECEIPT_MISSING');
    fix.push('Run mining analysis before closing run');
  }

  const audit = readAuditReceipt(repoRoot, runId);
  if (!audit) {
    missing.push('AUDIT_RECEIPT_MISSING');
    fix.push('Run audit before closing run');
  } else if (!audit.overallPass) {
    missing.push('AUDIT_FAILED');
    fix.push('Audit did not pass — review verdicts and fix failures');
  }

  return { ok: missing.length === 0, missing, fix };
}
