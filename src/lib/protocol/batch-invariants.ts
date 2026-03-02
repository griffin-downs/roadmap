// @module protocol/batch-invariants
// @exports assertContiguousBatch, assertClaimability, assertRetirementConsistency, validateBatchInvariants
// Batch position invariant enforcement: validate that batch positions are sound

import type { Graph, Orientation } from './types.ts';
import type { CompletionRecord } from '../evidence/completion-evidence.ts';

/**
 * Batch invariant: position must be contiguous in topological order.
 * No gaps allowed (e.g., [A, C] where B is unblocked is invalid).
 *
 * Precondition: Orientation.position is already sorted by parallelOrder()
 */
export function assertContiguousBatch<T extends string>(
  g: Graph<T>,
  position: string[],
): { valid: boolean; error?: string } {
  if (!position.length) return { valid: true }; // empty batch at term is OK

  // Collect all unblocked nodes at this level
  const depsOf = new Map<string, string[]>();
  const nodes = Object.values(g.nodes) as any[];

  for (const node of nodes) {
    depsOf.set(node.id, node.deps || []);
  }

  // For each node in position, its deps must either:
  // 1. Be completed (not in position), or
  // 2. Be in position (concurrent)
  const positionSet = new Set(position);
  const allNodeIds = new Set(nodes.map(n => n.id));
  const doneButNotInPosition = new Set<string>();

  for (const nodeId of position) {
    const deps = depsOf.get(nodeId) || [];
    for (const dep of deps) {
      if (!allNodeIds.has(dep)) continue; // skip synthetic nodes
      if (!positionSet.has(dep) && !doneButNotInPosition.has(dep)) {
        // Dep is not in position and not yet marked done
        // This is invalid (non-contiguous)
        return {
          valid: false,
          error: `Batch is non-contiguous: "${nodeId}" depends on "${dep}" which is neither in position nor completed`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Batch invariant: all nodes in the batch must be claimable.
 * A node is claimable if all its dependencies are completed.
 */
export function assertClaimability<T extends string>(
  g: Graph<T>,
  position: string[],
  completedNodeIds: Set<string>,
): { valid: boolean; unclaimable?: string[] } {
  const unclaimable: string[] = [];
  const depsOf = new Map<string, string[]>();
  const nodes = Object.values(g.nodes) as any[];

  for (const node of nodes) {
    depsOf.set(node.id, node.deps || []);
  }

  for (const nodeId of position) {
    const deps = depsOf.get(nodeId) || [];
    for (const dep of deps) {
      if (!completedNodeIds.has(dep)) {
        unclaimable.push(nodeId);
        break;
      }
    }
  }

  return unclaimable.length === 0
    ? { valid: true }
    : { valid: false, unclaimable };
}

/**
 * Batch invariant: retired nodes must not reappear in current batch.
 * Once a node is retired, it should never be in a future position.
 *
 * Precondition: Assumes a retirement tracking system exists
 * (not yet in place; this validates the principle)
 */
export function assertRetirementConsistency(
  position: string[],
  retiredNodeIds: Set<string>,
): { valid: boolean; error?: string } {
  for (const nodeId of position) {
    if (retiredNodeIds.has(nodeId)) {
      return {
        valid: false,
        error: `Batch contains retired node: "${nodeId}"`,
      };
    }
  }
  return { valid: true };
}

/**
 * Compound validation: check all batch invariants at once.
 *
 * Returns aggregated result:
 * - valid: true if all invariants pass
 * - errors: array of per-invariant violations
 */
export function validateBatchInvariants<T extends string>(
  g: Graph<T>,
  position: string[],
  completedNodeIds: Set<string>,
  retiredNodeIds: Set<string> = new Set(),
): {
  valid: boolean;
  errors: Array<{ invariant: string; error: string }>;
} {
  const errors: Array<{ invariant: string; error: string }> = [];

  const contiguousCheck = assertContiguousBatch(g, position);
  if (!contiguousCheck.valid) {
    errors.push({ invariant: 'contiguous-batch', error: contiguousCheck.error! });
  }

  const claimabilityCheck = assertClaimability(g, position, completedNodeIds);
  if (!claimabilityCheck.valid) {
    errors.push({
      invariant: 'claimability',
      error: `Nodes are not claimable: ${claimabilityCheck.unclaimable?.join(', ')}`,
    });
  }

  const retirementCheck = assertRetirementConsistency(position, retiredNodeIds);
  if (!retirementCheck.valid) {
    errors.push({ invariant: 'retirement-consistency', error: retirementCheck.error! });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Diagnostic helper: explain why a batch is invalid.
 *
 * Returns human-readable explanation + fix suggestions.
 */
export function diagnoseBatchInvariantViolation(
  g: Graph<T>,
  position: string[],
  completedNodeIds: Set<string>,
  retiredNodeIds: Set<string> = new Set(),
): {
  summary: string;
  violations: Array<{
    invariant: string;
    description: string;
    nodes: string[];
    suggestion: string;
  }>;
} {
  const violations: Array<any> = [];

  const contiguous = assertContiguousBatch(g, position);
  if (!contiguous.valid) {
    violations.push({
      invariant: 'non-contiguous batch',
      description: contiguous.error,
      nodes: position,
      suggestion: 'Ensure all dependency nodes are either completed or in the same batch',
    });
  }

  const claimable = assertClaimability(g, position, completedNodeIds);
  if (!claimable.valid) {
    violations.push({
      invariant: 'unclaimable nodes',
      description: `Nodes have incomplete dependencies: ${claimable.unclaimable?.join(', ')}`,
      nodes: claimable.unclaimable || [],
      suggestion: 'Complete dependencies before claiming nodes in this batch',
    });
  }

  const retired = assertRetirementConsistency(position, retiredNodeIds);
  if (!retired.valid) {
    violations.push({
      invariant: 'retired node in batch',
      description: retired.error,
      nodes: position.filter(n => retiredNodeIds.has(n)),
      suggestion: 'Remove retired nodes from the current batch',
    });
  }

  return {
    summary: violations.length
      ? `${violations.length} batch invariant violation(s) detected`
      : 'All batch invariants satisfied',
    violations,
  };
}
