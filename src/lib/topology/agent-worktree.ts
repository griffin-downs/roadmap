// @module topology/agent-worktree
// @exports createAgentWorktree, cleanupAgentWorktree, AgentWorktreeResult, listAgentWorktrees
// @entry roadmap/topology

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface AgentWorktreeResult {
  worktreePath: string;
  branch: string;
  cwd: string;
  taskId: string;
  agentId: string;
  produces: string[];
  consumes: string[];
  createdAt: string;
}

export interface WorktreeInfo {
  taskId: string;
  agentId: string;
  branch: string;
  worktreePath: string;
  createdAt: string;
}

// --- Helpers ---

function git(cmd: string, cwd: string): string {
  return execSync(`git ${cmd}`, { cwd, stdio: 'pipe', timeout: 10000 }).toString().trim();
}

function gitSafe(cmd: string, cwd: string): string {
  try {
    return git(cmd, cwd);
  } catch {
    return '';
  }
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
 * Create an isolated worktree for an agent to work on a task.
 * Creates: .claude/worktrees/<task-id>/ with branch feat/agent-<uuid>/<task-id>
 */
export function createAgentWorktree(
  repoRoot: string,
  agentId: string,
  taskId: string,
): AgentWorktreeResult {
  const worktreeBase = join(repoRoot, '.claude', 'worktrees');
  const worktreePath = join(worktreeBase, taskId);
  const shortId = randomUUID().slice(0, 8);
  const branch = `feat/agent-${shortId}/${taskId}`;

  // Ensure .claude/worktrees/ exists
  if (!existsSync(worktreeBase)) mkdirSync(worktreeBase, { recursive: true });

  // Guard: worktree already exists
  if (existsSync(worktreePath)) {
    // Read existing brief if present
    const briefPath = join(worktreePath, '.roadmap', `brief-${taskId}.json`);
    if (existsSync(briefPath)) {
      const existing = JSON.parse(readFileSync(briefPath, 'utf-8'));
      return existing as AgentWorktreeResult;
    }
    throw new Error(`Worktree already exists at ${worktreePath}. Clean up first: roadmap agent cleanup ${taskId}`);
  }

  // Create worktree + branch from HEAD
  git(`worktree add "${worktreePath}" -b "${branch}"`, repoRoot);

  // Load node spec for produces/consumes
  const { produces, consumes } = loadDAGNode(repoRoot, taskId);
  const createdAt = new Date().toISOString();

  const result: AgentWorktreeResult = {
    worktreePath,
    branch,
    cwd: resolve(worktreePath),
    taskId,
    agentId,
    produces,
    consumes,
    createdAt,
  };

  // Write brief into the worktree for agent reference
  const briefDir = join(worktreePath, '.roadmap');
  if (!existsSync(briefDir)) mkdirSync(briefDir, { recursive: true });
  writeFileSync(
    join(briefDir, `brief-${taskId}.json`),
    JSON.stringify(result, null, 2) + '\n',
  );

  return result;
}

/**
 * Remove a worktree and optionally delete its branch.
 */
export function cleanupAgentWorktree(repoRoot: string, taskId: string): { cleaned: boolean; branch: string | null } {
  const worktreePath = join(repoRoot, '.claude', 'worktrees', taskId);

  if (!existsSync(worktreePath)) {
    return { cleaned: false, branch: null };
  }

  // Find the branch name before removing
  const branch = gitSafe('rev-parse --abbrev-ref HEAD', worktreePath);

  // Remove worktree (force to handle uncommitted changes)
  gitSafe(`worktree remove "${worktreePath}" --force`, repoRoot);

  // Delete the local branch if it was agent-scoped
  if (branch && branch.startsWith('feat/agent-')) {
    gitSafe(`branch -D "${branch}"`, repoRoot);
  }

  return { cleaned: true, branch: branch || null };
}

/**
 * List all agent worktrees in .claude/worktrees/
 */
export function listAgentWorktrees(repoRoot: string): WorktreeInfo[] {
  const worktreeBase = join(repoRoot, '.claude', 'worktrees');
  if (!existsSync(worktreeBase)) return [];

  const entries = readdirSync(worktreeBase);
  const results: WorktreeInfo[] = [];

  for (const entry of entries) {
    const entryPath = join(worktreeBase, entry);
    if (!statSync(entryPath).isDirectory()) continue;

    const briefPath = join(entryPath, '.roadmap', `brief-${entry}.json`);
    if (existsSync(briefPath)) {
      try {
        const brief = JSON.parse(readFileSync(briefPath, 'utf-8'));
        results.push({
          taskId: brief.taskId,
          agentId: brief.agentId,
          branch: brief.branch,
          worktreePath: brief.worktreePath,
          createdAt: brief.createdAt,
        });
      } catch {
        // Malformed brief — skip
      }
    } else {
      // No brief — infer from git
      const branch = gitSafe('rev-parse --abbrev-ref HEAD', entryPath);
      results.push({
        taskId: entry,
        agentId: 'unknown',
        branch: branch || 'unknown',
        worktreePath: entryPath,
        createdAt: 'unknown',
      });
    }
  }

  return results;
}
