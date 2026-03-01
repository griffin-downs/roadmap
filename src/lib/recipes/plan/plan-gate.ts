// @module plan-gate
// @exports requirePlanGate
// @types PlanGateResult
// @entry roadmap

import type { PlanSelectedPointer } from '../../receipts/plan-selected-pointer.ts';
import { pointerValid } from '../../receipts/plan-selected-pointer.ts';

export type PlanGateResult =
  | { ok: true; pointer: PlanSelectedPointer }
  | { ok: false; reason: string; fix: string };

const FIX = 'roadmap plan select <id> --note "reason"';

export function requirePlanGate(repoRoot: string): PlanGateResult {
  const result = pointerValid(repoRoot);
  if (result.valid && result.pointer) {
    return { ok: true, pointer: result.pointer };
  }
  return {
    ok: false,
    reason: result.reason ?? 'Plan selection invalid',
    fix: FIX,
  };
}
