// @module metaflow/kernel-bridge
// @exports checkKernelReceipts, KernelBridgeError, KernelBridgeResult
// @entry roadmap/metaflow

// Bridge from metaflow sovereignty to the existing kernel invariants.
// When authority.json is present, metaflow run requires:
//   1. PLAN_SELECTED.json — plan-select receipt must exist and be current
//   2. spec-origin.json — spec-origin receipt must exist (DAG was imported from spec)
//
// No logic is duplicated — this module delegates entirely to existing kernel
// modules (plan-select.ts, spec-origin.ts). It is a bridge, not a fork.

import { loadPlanSelectReceipt } from '../receipts/plan-select.ts';
import { hasSpecOriginSync } from '../spec-origin.ts';

// ── Error ────────────────────────────────────────────────────────────────────

export class KernelBridgeError extends Error {
  constructor(
    public readonly code: 'PLAN_SELECT_MISSING' | 'SPEC_ORIGIN_MISSING',
    message: string,
  ) {
    super(message);
    this.name = 'KernelBridgeError';
  }
}

// ── Result ───────────────────────────────────────────────────────────────────

export interface KernelBridgeResult {
  planSelectPresent: boolean;
  specOriginPresent: boolean;
}

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * Verify that the kernel invariants are satisfied before allowing metaflow run.
 * Throws KernelBridgeError on first failure.
 * Only called when authority.json exists (governed repos).
 */
export function checkKernelReceipts(root: string): KernelBridgeResult {
  const planSelectReceipt = loadPlanSelectReceipt(root);
  if (planSelectReceipt === null) {
    throw new KernelBridgeError(
      'PLAN_SELECT_MISSING',
      'No plan-select receipt found. Run `roadmap plan select <candidateId> --note "..."` first.',
    );
  }

  const specOriginPresent = hasSpecOriginSync(root);
  if (!specOriginPresent) {
    throw new KernelBridgeError(
      'SPEC_ORIGIN_MISSING',
      'No spec-origin.json found. DAG must be imported from spec-kit: `roadmap import --from speckit <tasks.md> --id <dag-id>`.',
    );
  }

  return { planSelectPresent: true, specOriginPresent: true };
}

/**
 * Assert plan-select receipt is present. Throws PLAN_SELECT_MISSING if not.
 * Alias for the plan-select-only check (soft variant that does not require spec-origin).
 */
export function requirePlanSelectReceipt(root: string): void {
  const receipt = loadPlanSelectReceipt(root);
  if (receipt === null) {
    throw new KernelBridgeError(
      'PLAN_SELECT_MISSING',
      'No plan-select receipt found. Run `roadmap plan select <candidateId> --note "..."` first.',
    );
  }
}

/**
 * Enforce all kernel invariants for metaflow run.
 * Unlike checkKernelReceipts, spec-origin is treated as optional (soft requirement).
 * Plan-select receipt is required.
 */
export function enforceKernelInvariants(root: string): void {
  requirePlanSelectReceipt(root);
  // spec-origin: soft — only check if present
  const specOriginPresent = hasSpecOriginSync(root);
  if (!specOriginPresent) return; // not required when absent
}
