// @module agent-dispatch
// @exports Orchestrator, runOrchestrator, OrchestratorResult
// @types OrchestratorResult, OrchestratorConfig
// @entry roadmap/agent-dispatch

import type { DispatchPlan, AgentAssignment } from './dispatch-coordinator.ts';
import { AgentExecutor, executeSealed, type ExecutionResult } from './agent-executor.ts';
import { loadJournal, loadFinal, saveFinal } from './handoff-journal.ts';
import type { FinalHandoff } from '../brief.ts';

/**
 * OrchestratorConfig - runtime configuration
 */
export interface OrchestratorConfig {
  repoRoot: string;
  parallel?: boolean; // Run agents in parallel (default: sequential)
  timeoutMs?: number; // Timeout per agent execution
}

/**
 * OrchestratorResult - aggregated outcome
 */
export interface OrchestratorResult {
  timestamp: string;
  batchLevel: number;
  batchSize: number;
  completedCount: number;
  failedCount: number;
  results: ExecutionResult[];
  handoffChain: FinalHandoff[]; // Collected handoffs from all agents
  allPassed: boolean;
  failedNodes: string[];
  summary: string;
}

/**
 * Orchestrator - conductor of sealed agent execution
 * Coordinates brief dispatch, agent execution, result collection
 */
export class Orchestrator {
  private config: OrchestratorConfig;

  constructor(config: OrchestratorConfig) {
    this.config = { parallel: false, ...config };
  }

  /**
   * Run orchestration on dispatch plan
   * Executes all assignments and collects results
   */
  async execute(plan: DispatchPlan): Promise<OrchestratorResult> {
    const startTime = new Date();
    const results: ExecutionResult[] = [];

    // Execute all assignments
    if (this.config.parallel) {
      results.push(...await this.executeParallel(plan.assignments));
    } else {
      results.push(...await this.executeSequential(plan.assignments));
    }

    // Collect handoff chain
    const handoffChain = await this.collectHandoffs(plan.assignments);

    // Analyze results
    const failedNodes = results
      .filter(r => !r.success)
      .map(r => r.nodeId);
    const completedCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    const summary =
      failedCount === 0
        ? `Batch ${plan.batchLevel}: all ${plan.assignments.length} agents completed`
        : `Batch ${plan.batchLevel}: ${completedCount}/${plan.assignments.length} completed, ${failedCount} failed`;

    const endTime = new Date();

    return {
      timestamp: startTime.toISOString(),
      batchLevel: plan.batchLevel,
      batchSize: plan.assignments.length,
      completedCount,
      failedCount,
      results,
      handoffChain,
      allPassed: failedCount === 0,
      failedNodes,
      summary,
    };
  }

  /**
   * Execute assignments sequentially
   */
  private async executeSequential(assignments: AgentAssignment[]): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const assignment of assignments) {
      const result = await this.executeAssignment(assignment);
      results.push(result);
    }

    return results;
  }

  /**
   * Execute assignments in parallel
   */
  private async executeParallel(assignments: AgentAssignment[]): Promise<ExecutionResult[]> {
    const promises = assignments.map(assignment => this.executeAssignment(assignment));
    return Promise.all(promises);
  }

  /**
   * Execute single assignment
   */
  private async executeAssignment(assignment: AgentAssignment): Promise<ExecutionResult> {
    try {
      // Execute via sealed brief contract
      const result = await executeSealed({
        brief: assignment.brief,
        repoRoot: this.config.repoRoot,
        agentId: assignment.agentId,
      });

      return result;
    } catch (e) {
      const error = e as Error;
      return {
        nodeId: assignment.nodeId,
        agentId: assignment.agentId,
        success: false,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        wallTimeMs: 0,
        producedCount: 0,
        handoff: {
          timestamp: new Date().toISOString(),
          progress: 0,
          discovered: [`Orchestrator error: ${error.message}`],
          blockers: [error.message],
          currentFile: '',
          summary: `Failed to execute: ${error.message}`,
          keyDecisions: [],
          gotchas: [error.message],
          nextNodeEntry: {
            consumes: [],
            ready: false,
            blockers: [error.message],
          },
        },
        error: error.message,
      };
    }
  }

  /**
   * Collect handoff chain from all completed agents
   */
  private async collectHandoffs(assignments: AgentAssignment[]): Promise<FinalHandoff[]> {
    const handoffs: FinalHandoff[] = [];

    for (const assignment of assignments) {
      try {
        // Load handoff chain for this node
        const interim = loadJournal(this.config.repoRoot, assignment.nodeId);
        const finalHandoff = loadFinal(this.config.repoRoot, assignment.nodeId);
        if (interim.length > 0 && finalHandoff) {
          // Add final handoff from journal
          handoffs.push(finalHandoff);
        }
      } catch {
        // No handoff for this node — skip
      }
    }

    return handoffs;
  }
}

/**
 * Standalone orchestrator function
 * Executes a dispatch plan and returns aggregated results
 */
export async function runOrchestrator(
  plan: DispatchPlan,
  config: OrchestratorConfig,
): Promise<OrchestratorResult> {
  const orchestrator = new Orchestrator(config);
  return orchestrator.execute(plan);
}
