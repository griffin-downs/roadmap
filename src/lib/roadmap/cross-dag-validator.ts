// @module consolidation
// @exports validateCrossDAGDependencies, validatePropagation, CrossDAGValidationError
// @types CrossDAGIssue, CrossDAGValidationResult

import { verify } from '../../protocol.ts';
import type { Graph, NodeSpec } from '../../protocol.ts';
import type { MergeResult } from './dag-consolidator.ts';

export interface CrossDAGIssue {
  type: 'unresolved-consume' | 'dangling-dep' | 'propagation-broken' | 'phase-barrier-violation';
  nodeId: string;
  message: string;
  artifact?: string;
  phase?: string;
  evidence?: string[];
}

export interface CrossDAGValidationResult {
  valid: boolean;
  issues: CrossDAGIssue[];
  timestamp: string;
}

export class CrossDAGValidationError extends Error {
  code: string;
  context: Record<string, any>;

  constructor(
    code: string,
    message: string,
    context: Record<string, any> = {}
  ) {
    super(message);
    this.name = 'CrossDAGValidationError';
    this.code = code;
    this.context = context;
  }
}

/**
 * Validate inter-DAG dependencies in a merged graph
 * Checks:
 * 1. All consumes are satisfied by predecessor produces
 * 2. No dangling cross-DAG references
 * 3. Phase boundaries don't introduce gaps
 * 4. Propagated constraints preserved across merges
 */
export function validateCrossDAGDependencies(
  mergeResult: MergeResult
): CrossDAGValidationResult {
  const issues: CrossDAGIssue[] = [];
  const { merged, phases, connections } = mergeResult;

  // First: run protocol-level verification
  try {
    verify(merged);
  } catch (err: any) {
    issues.push({
      type: 'unresolved-consume',
      nodeId: 'merged-graph',
      message: `Protocol verification failed: ${err.message}`,
      evidence: [err.context?.entry || ''],
    });
  }

  // Build phase membership map
  const nodeToPhase = new Map<string, string>();
  for (const [phaseId, nodeIds] of Object.entries(phases)) {
    nodeIds.forEach((nodeId) => nodeToPhase.set(nodeId, phaseId));
  }

  // Build phase index map
  const phaseIndex = new Map<string, number>();
  let index = 0;
  Object.keys(phases).forEach((phaseId) => {
    phaseIndex.set(phaseId, index++);
  });

  // Check each node for cross-DAG violations
  for (const [nodeId, nodeSpec] of Object.entries(merged.nodes)) {
    const currentPhase = nodeToPhase.get(nodeId);

    // Validate consumes against predecessors
    for (const consume of nodeSpec.consumes) {
      const artifact = typeof consume === 'string' ? consume : consume.artifact;
      const resolvedBy = typeof consume === 'string' ? undefined : consume.resolvedBy;

      // Find which predecessor produces this artifact
      let producedBy: string | undefined;
      for (const [predId, predSpec] of Object.entries(merged.nodes)) {
        if ((predSpec.produces || []).includes(artifact)) {
          producedBy = predId;
          break;
        }
      }

      if (!producedBy && !resolvedBy) {
        issues.push({
          type: 'unresolved-consume',
          nodeId,
          message: `No producer found for artifact: ${artifact}`,
          artifact,
          phase: currentPhase,
        });
      } else if (producedBy) {
        // Verify producer is in same or earlier phase
        const prodPhase = nodeToPhase.get(producedBy);
        if (prodPhase && currentPhase && phaseIndex.get(prodPhase)! >= phaseIndex.get(currentPhase)!) {
          issues.push({
            type: 'phase-barrier-violation',
            nodeId,
            message: `Consumer in phase ${currentPhase} depends on producer ${producedBy} in same/later phase ${prodPhase}`,
            artifact,
            phase: currentPhase,
            evidence: [`Consumer: ${nodeId}`, `Producer: ${producedBy}`],
          });
        }
      }
    }

    // Validate dep references exist and are in graph
    for (const dep of nodeSpec.deps) {
      if (!(dep in merged.nodes)) {
        issues.push({
          type: 'dangling-dep',
          nodeId,
          message: `Dependency ${dep} does not exist in merged graph`,
          phase: currentPhase,
        });
      }
    }
  }

  // Validate connections are maintained
  for (const conn of connections) {
    const fromPhaseNodes = phases[conn.from] || [];
    const toPhaseNodes = phases[conn.to] || [];

    // Verify at least one node from 'from' phase has produces overlap with 'to' phase consumes
    const fromProduces = new Set<string>();
    fromPhaseNodes.forEach((nodeId) => {
      (merged.nodes[nodeId]?.produces || []).forEach((p) => fromProduces.add(p));
    });

    const toConsumes = new Set<string>();
    toPhaseNodes.forEach((nodeId) => {
      (merged.nodes[nodeId]?.consumes || []).forEach((c) => {
        const artifact = typeof c === 'string' ? c : c.artifact;
        toConsumes.add(artifact);
      });
    });

    const overlap = Array.from(fromProduces).filter((p) => toConsumes.has(p));
    if (overlap.length === 0) {
      issues.push({
        type: 'propagation-broken',
        nodeId: `${conn.from}-to-${conn.to}`,
        message: `Connection between ${conn.from} and ${conn.to} no longer valid: ${conn.reason}`,
        phase: conn.from,
        evidence: [`Expected overlap from connection reason: ${conn.reason}`],
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Validate that propagated constraints are preserved
 * Checks that artifact-exists rules propagated from terminal nodes
 * have corresponding produce statements in the merged graph
 */
export function validatePropagation(
  mergeResult: MergeResult
): CrossDAGValidationResult {
  const issues: CrossDAGIssue[] = [];
  const { merged } = mergeResult;

  // Traverse merged graph and check all propagated rules
  for (const [nodeId, nodeSpec] of Object.entries(merged.nodes)) {
    for (const rule of nodeSpec.validate) {
      // Check if this is a propagated artifact-exists rule
      if (
        rule.type === 'artifact-exists' &&
        (rule as any)._propagatedFrom
      ) {
        const propagatedFrom = (rule as any)._propagatedFrom;
        const targetPath = rule.path || rule.target;

        // Verify the source node produces something that leads to this artifact
        const sourceNode = merged.nodes[propagatedFrom];
        if (!sourceNode) {
          issues.push({
            type: 'propagation-broken',
            nodeId,
            message: `Propagated rule references non-existent source node: ${propagatedFrom}`,
            phase: 'unknown',
          });
          continue;
        }

        // Verify the artifact is actually produced somewhere upstream
        if (targetPath && !isArtifactProduced(merged, nodeId, targetPath)) {
          issues.push({
            type: 'propagation-broken',
            nodeId,
            message: `Propagated artifact ${targetPath} not produced by any upstream node`,
            artifact: targetPath,
            evidence: [`Propagation source: ${propagatedFrom}`],
          });
        }
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Helper: check if an artifact is produced by any node in the dependency chain
 */
function isArtifactProduced(
  graph: Graph<string>,
  nodeId: string,
  artifact: string
): boolean {
  const node = graph.nodes[nodeId];
  if (!node) return false;

  // Check if any dependency produces it
  for (const dep of node.deps) {
    const depNode = graph.nodes[dep];
    if (depNode && (depNode.produces || []).includes(artifact)) {
      return true;
    }
    // Recurse up the chain
    if (isArtifactProduced(graph, dep, artifact)) {
      return true;
    }
  }

  return false;
}
