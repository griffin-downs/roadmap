// @module plan-selection
// @exports PlanSelectReceipt, PlanSelectedPointer, isPlanSelectReceipt, isPlanSelectedPointer, PLAN_SELECT_RECEIPT_DIR, PLAN_SELECTED_POINTER, planSelectReceiptPath
// @types PlanSelectReceipt, PlanSelectedPointer
// @entry roadmap

// Plan selection receipt schema and pointer types for the governance kernel.
// Receipt fields record which candidate was selected, at which HEAD state, and why.

export interface PlanSelectReceipt {
  schemaVersion: 1;
  type: 'plan-select';
  headSha: string;      // git SHA of head.json at time of selection
  candidateId: string;  // which plan candidate was selected
  timestamp: string;    // ISO 8601
  note: string;         // why this plan was selected
  selectedBy?: string;  // user or agent id
}

export interface PlanSelectedPointer {
  receiptPath: string;  // relative path to the active receipt
  headSha: string;      // must match DAG current headSha
  candidateId: string;
  timestamp: string;
}

// Constants
export const PLAN_SELECT_RECEIPT_DIR = '.roadmap/receipts';
export const PLAN_SELECTED_POINTER = '.roadmap/PLAN_SELECTED.json';

// Type guards

export function isPlanSelectReceipt(x: unknown): x is PlanSelectReceipt {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    r['schemaVersion'] === 1 &&
    r['type'] === 'plan-select' &&
    typeof r['headSha'] === 'string' &&
    typeof r['candidateId'] === 'string' &&
    typeof r['timestamp'] === 'string' &&
    typeof r['note'] === 'string' &&
    (r['selectedBy'] === undefined || typeof r['selectedBy'] === 'string')
  );
}

export function isPlanSelectedPointer(x: unknown): x is PlanSelectedPointer {
  if (typeof x !== 'object' || x === null) return false;
  const p = x as Record<string, unknown>;
  return (
    typeof p['receiptPath'] === 'string' &&
    typeof p['headSha'] === 'string' &&
    typeof p['candidateId'] === 'string' &&
    typeof p['timestamp'] === 'string'
  );
}

// Helpers

/** Returns the receipt filename (relative within PLAN_SELECT_RECEIPT_DIR) for a given headSha. */
export function planSelectReceiptPath(headSha: string): string {
  return `${PLAN_SELECT_RECEIPT_DIR}/plan-select-${headSha.slice(0, 12)}.json`;
}

// Re-exports from receipts module for CLI convenience
export {
  writePlanSelectReceipt,
  loadPlanSelectReceipt,
  computeHeadSha,
  validatePlanSelection,
} from './receipts/plan-select.ts';
export { readPointer, writePointer, pointerValid } from './receipts/plan-selected-pointer.ts';
