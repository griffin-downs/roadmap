// @module agent-dispatch/task-worktree
// @exports onTaskOwnerSet, onTaskCompleted, TaskWorktreeResult
// @entry roadmap/agent-dispatch

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getBrief } from '../brief.ts';
import type { Graph } from '../protocol/types.ts';

// --- Types ---

export interface WorktreeInfo {
  worktreePath: string;
  branch: string;
  cwd: string;
  taskId: string;
  agentId: string;
  produces: string[];
  consumes: string[];
  createdAt: string;
}

export interface TaskWorktreeResult {
  taskId: string;
  agentId: string;
  worktree: WorktreeInfo | null;
  brief: {
    position: string;
    mode: string;
    produces: string[];
    consumes: string[];
    description: string;
  } | null;
  error: string | null;
}

// --- Helpers ---

function git(cmd: string, cwd: string): string {
  return execSync(`git ${cmd}`, { cwd, stdio: 'pipe', timeout: 10000 }).toString().trim();
}

function gitSafe(cmd: string, cwd: string): string {
  try { return git(cmd, cwd); } catch { return ''; }
}

function loadDAGNode(repoRoot: string, taskId: string): { produces: string[]; consumes: string[] } {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  if (!existsSync(headPath)) return { produces: [], consumes: [] };
  const dag = JSON.parse(readFileSync(headPath, 'utf-8'));
  const node = dag.nodes?.[taskId];
  if (!node) return { produces: [], consumes: [] };
  return {
    produces: node.produces ?? [],
    consumes: (node.consumes ?? []).map((c: string | { artifact: string }) =>
      typeof c === 'string' ? c : c.artifact,
    ),
  };
}

// --- Core API ---

/**
 * Called when TaskUpdate sets owner on a task.
 * Auto-creates worktree + loads brief into worktree context.
 */
export async function onTaskOwnerSet(
  repoRoot: string,
  taskId: string,
  agentId: string,
): Promise<TaskWorktreeResult> {
  let worktree: WorktreeInfo | null = null;
  let brief: TaskWorktreeResult['brief'] = null;

  // Create worktree
  try {
    const worktreeBase = join(repoRoot, '.claude', 'worktrees');
    const worktreePath = join(worktreeBase, taskId);
    const shortId = randomUUID().slice(0, 8);
    const branch = `feat/agent-${shortId}/${taskId}`;

    if (!existsSync(worktreeBase)) mkdirSync(worktreeBase, { recursive: true });

    // Return existing if already created
    if (existsSync(worktreePath)) {
      const briefPath = join(worktreePath, '.roadmap', `brief-${taskId}.json`);
      if (existsSync(briefPath)) {
        worktree = JSON.parse(readFileSync(briefPath, 'utf-8')) as WorktreeInfo;
      }
    } else {
      git(`worktree add "${worktreePath}" -b "${branch}"`, repoRoot);

      const { produces, consumes } = loadDAGNode(repoRoot, taskId);
      const createdAt = new Date().toISOString();

      worktree = {
        worktreePath,
        branch,
        cwd: resolve(worktreePath),
        taskId,
        agentId,
        produces,
        consumes,
        createdAt,
      };

      // Write brief into worktree
      const briefDir = join(worktreePath, '.roadmap');
      if (!existsSync(briefDir)) mkdirSync(briefDir, { recursive: true });
      writeFileSync(join(briefDir, `brief-${taskId}.json`), JSON.stringify(worktree, null, 2) + '\n');
    }
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
    // Brief loading is non-fatal
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
  if (!existsSync(worktreePath)) {
    return { cleaned: false, branch: null, missingArtifacts };
  }

  const branch = gitSafe('rev-parse --abbrev-ref HEAD', worktreePath);
  gitSafe(`worktree remove "${worktreePath}" --force`, repoRoot);
  if (branch && branch.startsWith('feat/agent-')) {
    gitSafe(`branch -D "${branch}"`, repoRoot);
  }

  return {
    cleaned: true,
    branch: branch || null,
    missingArtifacts,
  };
}
