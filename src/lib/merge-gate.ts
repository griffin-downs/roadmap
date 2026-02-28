// @module merge-gate
// @exports ReceiptCheck, MergeGateError, MergeGateResult, RequiredReceiptType, REQUIRED_RECEIPTS, isMergeGateResult, formatMergeGateError
// @types ReceiptCheck, MergeGateError, MergeGateResult, RequiredReceiptType
// @entry roadmap

/** Receipt types that the merge gate can check for. */
export type RequiredReceiptType = 'plan-select' | 'spec-origin' | 'kernel-verify' | 'intake' | 'no-orphans';

/** Default required receipts — spec-origin and intake are conditional. */
export const REQUIRED_RECEIPTS: readonly RequiredReceiptType[] = ['plan-select', 'kernel-verify', 'no-orphans'] as const;

/** Result of checking a single receipt's existence. */
export interface ReceiptCheck {
  receiptName: string;
  found: boolean;
  path?: string;
  required: boolean;
}

/** Structured error from a merge gate evaluation. */
export interface MergeGateError {
  code: string;
  message: string;
  fix: string[];
}

/** Aggregate result of running the merge gate against a target branch. */
export interface MergeGateResult {
  pass: boolean;
  target: string;
  checkedAt: string;
  checks: ReceiptCheck[];
  errors: MergeGateError[];
  headSha: string;
}

/** Type guard for MergeGateResult. */
export function isMergeGateResult(x: unknown): x is MergeGateResult {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.pass === 'boolean' &&
    typeof r.target === 'string' &&
    typeof r.checkedAt === 'string' &&
    Array.isArray(r.checks) &&
    Array.isArray(r.errors) &&
    typeof r.headSha === 'string'
  );
}

/** Human-readable summary of merge gate failures with fix hints. */
export function formatMergeGateError(result: MergeGateResult): string {
  if (result.pass) return `merge-gate: PASS (${result.target} @ ${result.headSha.slice(0, 7)})`;

  const lines: string[] = [
    `merge-gate: FAIL (${result.target} @ ${result.headSha.slice(0, 7)})`,
  ];

  for (const err of result.errors) {
    lines.push(`  [${err.code}] ${err.message}`);
    for (const fix of err.fix) {
      lines.push(`    fix: ${fix}`);
    }
  }

  const missing = result.checks.filter(c => c.required && !c.found);
  if (missing.length > 0) {
    lines.push(`  missing receipts: ${missing.map(c => c.receiptName).join(', ')}`);
  }

  return lines.join('\n');
}
