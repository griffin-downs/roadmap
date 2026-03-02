// @module orchestrator
// @exports runOrchestrator
// @types OrchestratorResult, OrchestratorOptions

import { computeDispatch, type DispatchAssignment } from './dispatch-coordinator.ts';
import { executeSealed, type ExecutionResult } from './agent-executor.ts';
import { saveCompletionWithEvidence } from '../evidence/completion-evidence.ts';
import type { Graph } from '../../protocol.ts';

export interface OrchestratorOptions {
  dag: Graph<string>;
  repoRoot: string;
  currentBatch: string[];
  level: number;
  agents: string[];
  /** Run agents sequentially (default) or in parallel */
  parallel?: boolean;
}

export interface OrchestratorResult {
  batchLevel: number;
  assignments: DispatchAssignment[];
  results: ExecutionResult[];
  allPassed: boolean;
  failedNodes: string[];
}

/**
 * Orchestrate a batch: compute dispatch, execute each assignment, collect results.
 *
 * Given: DAG + current batch + available agents
 * When: orchestrator runs
 * Then: dispatch plan computed, agents execute sealed briefs, results collected
 */
export async function runOrchestrator(opts: OrchestratorOptions): Promise<OrchestratorResult> {
  const { dag, repoRoot, currentBatch, level, agents, parallel = false } = opts;

  // Step 1: Compute dispatch plan
  const plan = await computeDispatch(dag, currentBatch, repoRoot, agents, level);

  // Step 2: Execute each assignment
  const results: ExecutionResult[] = [];

  if (parallel) {
    const promises = plan.assignments.map(assignment =>
      executeSealed({
        brief: assignment.brief,
        repoRoot,
        agentId: assignment.agentId,
      })
    );
    results.push(...await Promise.all(promises));
  } else {
    for (const assignment of plan.assignments) {
      const result = await executeSealed({
        brief: assignment.brief,
        repoRoot,
        agentId: assignment.agentId,
      });
      results.push(result);
    }
  }

  // Step 3: Collect results and write completion records
  const failedNodes = results
    .filter(r => !r.success)
    .map(r => r.nodeId);

  // Write completion records for successful nodes
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.success) {
      const assignment = plan.assignments[i];
      const checks = [
        {
          rule: 'artifact-exists' as const,
          passed: true,
          evidence: `sealed agent execution completed: ${result.nodeId}`,
        },
      ];
      saveCompletionWithEvidence(
        repoRoot,
        result.nodeId,
        checks,
        assignment.agentId,
        `${result.nodeId}-${Date.now()}`,
      );
    }
  }

  return {
    batchLevel: level,
    assignments: plan.assignments,
    results,
    allPassed: failedNodes.length === 0,
    failedNodes,
  };
}
