// @module agent-dispatch/task-worktree
// @exports onTaskOwnerSet, onTaskCompleted, TaskWorktreeResult
// @entry roadmap/agent-dispatch

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAgentWorktree, cleanupAgentWorktree, type AgentWorktreeResult } from '../topology/agent-worktree.ts';
import { getBrief } from '../brief.ts';
import type { Graph } from '../protocol/types.ts';

export interface TaskWorktreeResult {
  taskId: string;
  agentId: string;
  worktree: AgentWorktreeResult | null;
  brief: {
    position: string;
    mode: string;
    produces: string[];
    consumes: string[];
    description: string;
  } | null;
  error: string | null;
}

/**
 * Called when TaskUpdate sets owner on a task.
 * Auto-creates worktree + loads brief into worktree context.
 */
export async function onTaskOwnerSet(
  repoRoot: string,
  taskId: string,
  agentId: string,
): Promise<TaskWorktreeResult> {
  let worktree: AgentWorktreeResult | null = null;
  let brief: TaskWorktreeResult['brief'] = null;

  // Create worktree
  try {
    worktree = createAgentWorktree(repoRoot, agentId, taskId);
  } catch (e) {
    return {
      taskId,
      agentId,
      worktree: null,
      brief: null,
      error: `Worktree creation failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // Load brief from DAG if available
  try {
    const headPath = join(repoRoot, '.roadmap', 'head.json');
    if (existsSync(headPath)) {
      const dag: Graph<string> = JSON.parse(readFileSync(headPath, 'utf-8'));
      if (dag.nodes && taskId in dag.nodes) {
        const fullBrief = await getBrief(dag, taskId, repoRoot);
        brief = {
          position: fullBrief.position,
          mode: fullBrief.mode,
          produces: fullBrief.produces,
          consumes: fullBrief.consumes,
          description: fullBrief.description,
        };
      }
    }
  } catch {
    // Brief loading is non-fatal — worktree still exists
  }

  return { taskId, agentId, worktree, brief, error: null };
}

/**
 * Called when TaskUpdate sets status=completed on a task.
 * Verifies produces artifacts exist, auto-cleans worktree.
 */
export function onTaskCompleted(
  repoRoot: string,
  taskId: string,
): { cleaned: boolean; branch: string | null; missingArtifacts: string[] } {
  const worktreePath = join(repoRoot, '.claude', 'worktrees', taskId);

  // Check produces artifacts if brief exists
  const missingArtifacts: string[] = [];
  const briefPath = join(worktreePath, '.roadmap', `brief-${taskId}.json`);
  if (existsSync(briefPath)) {
    try {
      const brief = JSON.parse(readFileSync(briefPath, 'utf-8'));
      for (const artifact of brief.produces ?? []) {
        if (!existsSync(join(worktreePath, artifact))) {
          missingArtifacts.push(artifact);
        }
      }
    } catch {
      // Brief unreadable — skip artifact check
    }
  }

  // Cleanup worktree
  const result = cleanupAgentWorktree(repoRoot, taskId);

  return {
    cleaned: result.cleaned,
    branch: result.branch,
    missingArtifacts,
  };
}
