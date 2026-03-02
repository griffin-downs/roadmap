// @module agent-dispatch
// @exports DispatchCoordinator, generateDispatchPlan, assignAgentsToBatch
// @types DispatchPlan, AgentAssignment, DispatchConfig
// @entry roadmap/agent-dispatch

import type { Graph, Orientation } from '../../protocol';
import type { Brief, FinalHandoff } from '../brief';
import { getBrief } from '../brief';
import { BriefGate } from './brief-gate';

/**
 * Agent assignment: maps agent ID to node ID and generated brief
 */
export interface AgentAssignment {
  agentId: string;
  nodeId: string;
  brief: Brief;
  checkpoint?: string; // path to checkpoint file if resumed
}

/**
 * Dispatch plan: sealed briefs ready for agent execution
 */
export interface DispatchPlan {
  timestamp: string;
  batch: string[];
  batchLevel: number;
  assignments: AgentAssignment[];
  handoffChain: FinalHandoff[];
  totalNodes: number;
  completedNodes: number;
  ready: boolean;
  validationErrors: string[];
}

/**
 * Configuration for dispatch coordinator
 */
export interface DispatchConfig {
  repoRoot: string;
  assignmentStrategy?: 'round-robin' | 'lru'; // Defaults to round-robin
  maxAgentsPerBatch?: number; // Max concurrent agents per batch
  validateBriefs?: boolean; // Run BriefGate validation before dispatch
}

/**
 * DispatchCoordinator - orchestrates batch → briefs → agent assignments
 * Core of the sealed brief execution model.
 */
export class DispatchCoordinator {
  private dag: Graph<string>;
  private config: DispatchConfig;
  private briefGate: BriefGate;
  private agentPool: Map<string, number> = new Map(); // agent → last-used-time for LRU

  constructor(dag: Graph<string>, config: DispatchConfig) {
    this.dag = dag;
    this.config = { assignmentStrategy: 'round-robin', ...config };
    this.briefGate = new BriefGate();
  }

  /**
   * Generate dispatch plan for current batch
   * Returns sealed briefs ready for dispatch to agents
   */
  async generatePlan(orientation: Orientation): Promise<DispatchPlan> {
    const batch = orientation.position || [];
    const validationErrors: string[] = [];

    if (!batch || batch.length === 0) {
      return {
        timestamp: new Date().toISOString(),
        batch: [],
        batchLevel: orientation.level || 0,
        assignments: [],
        handoffChain: [],
        totalNodes: orientation.remaining.length + 1,
        completedNodes: this.countCompletedNodes(),
        ready: false,
        validationErrors: ['Empty batch — DAG may be complete'],
      };
    }

    // Assign agents to batch nodes
    const assignments = await this.assignAgents(batch);

    // Validate briefs if requested
    if (this.config.validateBriefs) {
      for (const assignment of assignments) {
        const result = this.briefGate.validate(assignment.brief);
        if (!result.passed) {
          validationErrors.push(
            `Brief ${assignment.nodeId}: ${result.errors.map(e => e.message).join('; ')}`
          );
        }
      }
    }

    return {
      timestamp: new Date().toISOString(),
      batch,
      batchLevel: orientation.level || 0,
      assignments,
      handoffChain: [], // TODO: collect from prior handoffs
      totalNodes: orientation.remaining.length + batch.length,
      completedNodes: this.countCompletedNodes(),
      ready: validationErrors.length === 0 && assignments.length > 0,
      validationErrors,
    };
  }

  /**
   * Assign agents to batch nodes using specified strategy
   */
  private async assignAgents(batch: string[]): Promise<AgentAssignment[]> {
    const assignments: AgentAssignment[] = [];
    const strategy = this.config.assignmentStrategy || 'round-robin';

    // Generate unique agent IDs for this batch
    const agents = this.generateAgentIds(batch.length);

    for (let i = 0; i < batch.length; i++) {
      const nodeId = batch[i];
      const agentId = strategy === 'lru' 
        ? this.selectAgentLRU(agents)
        : agents[i % agents.length];

      // Generate sealed brief for this node
      try {
        const brief = await getBrief(this.dag, nodeId, this.config.repoRoot);
        assignments.push({
          agentId,
          nodeId,
          brief,
        });
      } catch (e: unknown) {
        // Skip nodes with invalid briefs — let validation catch them
        assignments.push({
          agentId,
          nodeId,
          brief: {
            position: nodeId,
            mode: 'execute',
            produces: [],
            consumes: [],
            description: 'Brief generation failed',
            pattern: '',
            handoffJournal: [],
            remaining: 0,
          },
        });
      }
    }

    return assignments;
  }

  /**
   * Generate unique agent IDs for batch (format: agent-{batch}-{index})
   */
  private generateAgentIds(count: number): string[] {
    const timestamp = Date.now();
    return Array.from({ length: count }, (_, i) => 
      `agent-${timestamp}-${i}`
    );
  }

  /**
   * LRU agent selection: pick least-recently-used agent
   */
  private selectAgentLRU(agents: string[]): string {
    if (agents.length === 0) return 'agent-default';

    let lru = agents[0];
    let lruTime = this.agentPool.get(lru) ?? 0;

    for (const agent of agents.slice(1)) {
      const time = this.agentPool.get(agent) ?? 0;
      if (time < lruTime) {
        lru = agent;
        lruTime = time;
      }
    }

    // Update last-used time
    this.agentPool.set(lru, Date.now());
    return lru;
  }

  /**
   * Count nodes that have been completed (persisted to git-state or completed.json)
   */
  private countCompletedNodes(): number {
    // Simplified: would need to check completion store
    // For now, return 0 and rely on orientation.done from CLI
    return 0;
  }
}

/**
 * Standalone function: generate dispatch plan from batch
 * Returns sealed briefs ready for dispatch
 */
export async function generateDispatchPlan(
  dag: Graph<string>,
  orientation: Orientation,
  config: DispatchConfig,
): Promise<DispatchPlan> {
  const coordinator = new DispatchCoordinator(dag, config);
  return coordinator.generatePlan(orientation);
}

/**
 * Standalone function: assign agents to batch nodes
 * Simple round-robin by default
 */
export function assignAgentsToBatch(
  batch: string[],
  strategy: 'round-robin' | 'lru' = 'round-robin',
): string[] {
  const timestamp = Date.now();
  return batch.map((_, i) => `agent-${timestamp}-${i}`);
}
