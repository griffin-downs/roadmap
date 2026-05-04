// @module make-validation
// @exports collectMakeErrors
//
// Collects ALL validation failures from roadmap make before reporting.
// Instead of throwing on first error, gathers every violation into an errors[] array.

import type { Graph } from './protocol/types.ts';
import { define, verify, check } from '../protocol.ts';
import {
  validateTerminalIntentGate,
  validateInitIntentGate,
  validateConsumesNonEmpty,
  validateConsumesHaveProducer,
} from './validate-dag.ts';

// ── Types ──────────────────────────────────────────────────────────────────

export interface MakeError {
  gate: 'define' | 'verify' | 'check' | 'terminal-intent' | 'init-intent' | 'consumes-non-empty' | 'consumes-has-producer';
  node?: string;
  message: string;
  fix: string;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Collect ALL validation failures from roadmap make.
 * Runs all validation checks (define, verify, check, intent gates)
 * without throwing, returning all errors found.
 */
export function collectMakeErrors(
  dag: any,
  opts?: { skipTerminalIntent?: boolean }
): MakeError[] {
  const errors: MakeError[] = [];

  // 1. Structural validation (define)
  try {
    define(dag);
  } catch (e) {
    errors.push({
      gate: 'define',
      message: e instanceof Error ? e.message : String(e),
      fix: 'Fix structural errors: check for cycles, missing init/term nodes',
    });
  }

  // 2. Contract validation (verify)
  try {
    const verifyErrors = verify(dag);
    if (verifyErrors.length > 0) {
      for (const err of verifyErrors) {
        errors.push({
          gate: 'verify',
          message: typeof err === 'string' ? err : (err as any).message ?? String(err),
          fix: 'Ensure all consumed artifacts are produced by predecessor nodes',
        });
      }
    }
  } catch (e) {
    errors.push({
      gate: 'verify',
      message: e instanceof Error ? e.message : String(e),
      fix: 'Fix verification errors in node dependencies',
    });
  }

  // 3. Reachability validation (check)
  try {
    const checkResult = check(dag);
    if (!checkResult.done) {
      errors.push({
        gate: 'check',
        message: `Reachability check failed: ${checkResult.orphans.join('; ')}`,
        fix: 'Ensure all nodes are reachable from init to term',
      });
    }
  } catch (e) {
    errors.push({
      gate: 'check',
      message: e instanceof Error ? e.message : String(e),
      fix: 'Fix reachability errors in the DAG',
    });
  }

  // 4. Terminal intent gate validation
  if (!opts?.skipTerminalIntent) {
    try {
      const terminalError = validateTerminalIntentGate(dag);
      if (terminalError) {
        errors.push({
          gate: 'terminal-intent',
          node: terminalError.node,
          message: terminalError.message,
          fix: terminalError.fix,
        });
      }
    } catch (e) {
      errors.push({
        gate: 'terminal-intent',
        message: e instanceof Error ? e.message : String(e),
        fix: 'Fix terminal intent gate errors',
      });
    }
  }

  // 5. Init intent gate validation (warning only — not a hard block)
  // Init-boundary nodes with concrete produces don't need a plan-clarity affirmation.
  // The terminal reflection prompt is the real checkpoint.
  try {
    const initError = validateInitIntentGate(dag);
    if (initError) {
      errors.push({
        gate: 'init-intent' as any,
        node: initError.node,
        message: initError.message,
        fix: initError.fix,
        severity: 'warning',
      } as any);
    }
  } catch (e) {
    errors.push({
      gate: 'init-intent' as any,
      message: e instanceof Error ? e.message : String(e),
      fix: 'Fix init intent gate errors',
      severity: 'warning',
    } as any);
  }

  // 6. Empty-consumes on non-init nodes (v2 rule · gate-without-data-flow)
  try {
    const r = validateConsumesNonEmpty(dag);
    for (const msg of r.errors) {
      errors.push({
        gate: 'consumes-non-empty',
        message: msg,
        fix: 'Add at least one consumes entry — wire upstream produces or a ratification receipt.',
      });
    }
  } catch (e) {
    errors.push({
      gate: 'consumes-non-empty',
      message: e instanceof Error ? e.message : String(e),
      fix: 'Fix consumes-non-empty validation errors',
    });
  }

  // 7. Every consumes path must have a producer (v2 rule · reachability)
  try {
    const r = validateConsumesHaveProducer(dag);
    for (const msg of r.errors) {
      errors.push({
        gate: 'consumes-has-producer',
        message: msg,
        fix: 'Either add a producing node for the path, or correct the consumes path.',
      });
    }
  } catch (e) {
    errors.push({
      gate: 'consumes-has-producer',
      message: e instanceof Error ? e.message : String(e),
      fix: 'Fix consumes-has-producer validation errors',
    });
  }

  return errors;
}
