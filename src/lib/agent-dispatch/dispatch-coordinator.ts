// @module agent-dispatch
// @exports DispatchCoordinator, generateDispatchAssignments, assignAgentsToNodes, DispatchCoordinator
// @types DispatchAssignment, DispatchPlan, SealedBrief, AgentAssignment
// @entry roadmap/dispatch-system

import type { Graph, NodeSpec } from '../../protocol.ts';
import type { Brief, ValidationRule } from './brief-gate.ts';

/**
 * Agent assignment: maps node to assigned agent with sealed brief.
 */
export interface AgentAssignment {
  nodeId: string;
  agentId: string;
  brief: Brief;
}

/**
 * Full dispatch plan: all assignments for a batch.
 */
export interface DispatchPlan {
  dagId: string;
  batchIndex: number;
  timestamp: string;
  assignments: AgentAssignment[];
  totalNodes: number;
}

/**
 * For backwards compatibility with existing code that uses DispatchAssignment.
 */
export interface DispatchAssignment extends AgentAssignment {
  estimatedDuration?: number;
}

/**
 * DispatchCoordinator — orchestrate batch computation and sealed brief generation.
 * Read roadmap batch → assign agents → generate sealed briefs → return assignments.
 */
export class DispatchCoordinator {
  private nodeIdCounter = 0;

  constructor(private dag: Graph<string>) {}

  /**
   * Generate assignments for a batch of nodes.
   * Each node gets a unique agent ID (agent-<nodeId>-<suffix>).
   * Sealed briefs contain only consumes/produces, no DAG structure.
   *
   * @param batch Array of node IDs to dispatch
   * @param batchIndex Zero-indexed batch number
   */
  generateAssignments(batch: string[], batchIndex: number): AgentAssignment[] {
    const assignments: AgentAssignment[] = [];

    for (let i = 0; i < batch.length; i++) {
      const nodeId = batch[i];
      const node = this.dag.nodes[nodeId as keyof typeof this.dag.nodes];

      if (!node) {
        throw new Error(`Node not found in DAG: ${nodeId}`);
      }

      const agentId = this.generateAgentId(nodeId);
      const brief = this.sealBrief(node, nodeId);

      assignments.push({
        nodeId,
        agentId,
        brief,
      });
    }

    return assignments;
  }

  /**
   * Generate a dispatch plan for a batch.
   * @param batch Array of node IDs to dispatch
   * @param batchIndex Zero-indexed batch number
   */
  plan(batch: string[], batchIndex: number): DispatchPlan {
    const assignments = this.generateAssignments(batch, batchIndex);

    return {
      dagId: this.dag.id,
      batchIndex,
      timestamp: new Date().toISOString(),
      assignments,
      totalNodes: batch.length,
    };
  }

  /**
   * Generate a unique agent ID for a node.
   */
  private generateAgentId(nodeId: string): string {
    this.nodeIdCounter++;
    // Format: agent-<nodeId>-<counter>
    // E.g., agent-dispatch-coordinator-impl-0001
    const paddedCounter = String(this.nodeIdCounter).padStart(4, '0');
    return `agent-${nodeId}-${paddedCounter}`;
  }

  /**
   * Create a sealed brief from a node spec.
   * Sealed brief contains ONLY consumes/produces and validation rules.
   * No DAG structure, no dependencies, no internal graph details.
   */
  private sealBrief(node: NodeSpec<string>, nodeId: string): Brief {
    return {
      position: nodeId,
      produces: node.produces.slice(),
      consumes: node.consumes.map(c => (typeof c === 'string' ? c : c.artifact)),
      description: node.desc,
      idempotent: node.idempotent,
      validate: node.validate.slice(),
    };
  }
}

/**
 * Convenience function: generate dispatch assignments for a batch.
 * @param dag The roadmap DAG
 * @param batch Array of node IDs in current batch
 * @param batchIndex Zero-indexed batch number
 */
export function generateDispatchAssignments(
  dag: Graph<string>,
  batch: string[],
  batchIndex: number
): AgentAssignment[] {
  const coordinator = new DispatchCoordinator(dag);
  return coordinator.generateAssignments(batch, batchIndex);
}

/**
 * Convenience function: assign agents to nodes and generate plan.
 * @param dag The roadmap DAG
 * @param batch Array of node IDs in current batch
 * @param batchIndex Zero-indexed batch number
 */
export function assignAgentsToNodes(
  dag: Graph<string>,
  batch: string[],
  batchIndex: number
): DispatchPlan {
  const coordinator = new DispatchCoordinator(dag);
  return coordinator.plan(batch, batchIndex);
}

/**
 * Validate dispatch plan integrity.
 * Ensures all nodes are assigned, all assignments have valid briefs.
 */
export function validateDispatchPlan(
  plan: DispatchPlan,
  expectedNodes: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (plan.totalNodes !== expectedNodes.length) {
    errors.push(
      `Plan totalNodes (${plan.totalNodes}) != expected (${expectedNodes.length})`
    );
  }

  if (plan.assignments.length !== expectedNodes.length) {
    errors.push(
      `Plan assignments count (${plan.assignments.length}) != expected (${expectedNodes.length})`
    );
  }

  const assignedNodeIds = new Set(plan.assignments.map(a => a.nodeId));

  for (const nodeId of expectedNodes) {
    if (!assignedNodeIds.has(nodeId)) {
      errors.push(`Node not assigned: ${nodeId}`);
    }
  }

  // Check for duplicate assignments
  const seenNodeIds = new Set<string>();
  for (const assignment of plan.assignments) {
    if (seenNodeIds.has(assignment.nodeId)) {
      errors.push(`Duplicate assignment: ${assignment.nodeId}`);
    }
    seenNodeIds.add(assignment.nodeId);
  }

  // Validate each brief
  for (const assignment of plan.assignments) {
    const brief = assignment.brief;

    if (!brief.position) {
      errors.push(`Assignment ${assignment.nodeId}: missing position`);
    }

    if (!Array.isArray(brief.produces) || brief.produces.length === 0) {
      errors.push(`Assignment ${assignment.nodeId}: produces list empty or invalid`);
    }

    if (!Array.isArray(brief.consumes)) {
      errors.push(`Assignment ${assignment.nodeId}: consumes must be array`);
    }

    if (!brief.description) {
      errors.push(`Assignment ${assignment.nodeId}: missing description`);
    }

    if (typeof brief.idempotent !== 'boolean') {
      errors.push(`Assignment ${assignment.nodeId}: idempotent must be boolean`);
    }

    if (!Array.isArray(brief.validate)) {
      errors.push(`Assignment ${assignment.nodeId}: validate rules missing or invalid`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
