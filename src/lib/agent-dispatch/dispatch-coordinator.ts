// @module dispatch-coordinator
// @exports computeDispatch
// @types DispatchAssignment

import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getBrief } from '../brief.ts';
import { validateBrief } from './brief-gate.ts';
import type { Graph } from '../../protocol.ts';
import type { Brief } from '../brief.ts';

export interface DispatchAssignment {
  agentId: string;
  nodeId: string;
  brief: Brief;
  estimatedDuration?: number;
}

interface DispatchPlan {
  timestamp: string;
  currentBatch: string[];
  level: number;
  assignments: DispatchAssignment[];
  validated: boolean;
}

/**
 * Compute dispatch plan: assign agents to nodes with sealed briefs
 *
 * Given: DAG at current position with N pending nodes in current batch
 * When: orchestrator requests dispatch plan
 * Then: return assignment mapping each agent to a sealed brief
 */
export async function computeDispatch(
  dag: Graph<string>,
  currentBatch: string[],
  repoRoot: string,
  availableAgents: string[],
  level: number,
): Promise<DispatchPlan> {
  const assignments: DispatchAssignment[] = [];
  const availableConsumes: Map<string, boolean> = new Map();

  // Load completed.json to check which files are available
  const completedPath = join(repoRoot, '.roadmap', 'completed.json');
  let completed: Record<string, any> = {};
  try {
    const data = readFileSync(completedPath, 'utf-8');
    completed = JSON.parse(data);
  } catch {
    // completed.json may not exist yet
  }

  // For each node in batch, get brief and assign to agent
  let agentIndex = 0;
  for (const nodeId of currentBatch) {
    // Get sealed brief for this node
    const brief = await getBrief(dag, nodeId, repoRoot);

    // Validate brief contract
    const consumes = brief.consumes.map(file => ({
      file,
      available: completed[nodeId]?.produces?.includes(file) ?? false,
    }));
    const validation = validateBrief(brief, consumes);

    if (!validation.valid) {
      throw new Error(
        `Brief validation failed for ${nodeId}: ${validation.errors.join('; ')}`
      );
    }

    // Assign to next available agent (round-robin)
    const agentId = availableAgents[agentIndex % availableAgents.length];
    assignments.push({
      agentId,
      nodeId,
      brief,
      estimatedDuration: 300, // default 5 minutes
    });

    agentIndex++;
  }

  // Validate no node assigned twice
  const assignedNodes = new Set(assignments.map(a => a.nodeId));
  if (assignedNodes.size !== assignments.length) {
    throw new Error('Duplicate node assignments detected');
  }

  // Write dispatch plan
  const plan: DispatchPlan = {
    timestamp: new Date().toISOString(),
    currentBatch,
    level,
    assignments,
    validated: true,
  };

  const dispatchDir = join(repoRoot, '.dispatch');
  try {
    require('node:fs').mkdirSync(dispatchDir, { recursive: true });
  } catch {
    // Already exists
  }

  writeFileSync(
    join(dispatchDir, 'plan.json'),
    JSON.stringify(plan, null, 2)
  );

  return plan;
}
