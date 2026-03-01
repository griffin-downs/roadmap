// @module dispatch
// @exports DispatchPlan, DispatchWorktree, DispatchApplyResult, createDispatchPlan, applyDispatchPlan, loadDispatchPlan, dispatchStatus
// @types DispatchPlan, DispatchWorktree, DispatchApplyResult
// @entry roadmap

// Dispatch planning: build a plan that assigns clusters to worktrees
// and workers. Does not spawn agents — only writes the plan.

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { PlanOverlay } from './plan-overlay.ts';

export interface DispatchWorktree {
  id: string;
  clusterId: string;
  nodes: string[];
  worktreePath?: string;   // resolved at apply time
  owner?: string;          // assigned worker
}

export interface DispatchPlan {
  schemaVersion: 1;
  headSha: string;
  overlayHash: string;
  worktrees: DispatchWorktree[];
  workers: number;
  createdAt: string;
  planHash: string;
}

export interface DispatchApplyResult {
  applied: boolean;
  planHash: string;
  worktrees: DispatchWorktree[];
  receiptPath: string;
}

const DISPATCH_DIR = '.roadmap/dispatch';

function dispatchDir(repoRoot: string): string {
  const dir = join(repoRoot, DISPATCH_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Create a dispatch plan from an overlay.
 * Distributes clusters round-robin across N workers.
 */
export function createDispatchPlan(
  repoRoot: string,
  overlay: PlanOverlay,
  opts?: { workers?: number },
): DispatchPlan {
  const workers = opts?.workers ?? overlay.clusters.length;

  // Create worktrees from schedule order (wave priority)
  const worktrees: DispatchWorktree[] = [];
  const scheduledClusters = overlay.schedule.map(s => s.clusterId);

  // Include all clusters, scheduled ones first
  const allClusterIds = new Set(overlay.clusters.map(c => c.id));
  const orderedIds = [...new Set([...scheduledClusters, ...allClusterIds])];

  for (let i = 0; i < orderedIds.length; i++) {
    const clusterId = orderedIds[i];
    const cluster = overlay.clusters.find(c => c.id === clusterId);
    if (!cluster) continue;

    worktrees.push({
      id: `wt-${clusterId}`,
      clusterId,
      nodes: cluster.nodes,
      owner: `worker-${(i % workers) + 1}`,
    });
  }

  const planContent = JSON.stringify({ headSha: overlay.headSha, overlayHash: overlay.overlayHash, worktrees, workers });
  const planHash = createHash('sha256').update(planContent).digest('hex');

  const plan: DispatchPlan = {
    schemaVersion: 1,
    headSha: overlay.headSha,
    overlayHash: overlay.overlayHash,
    worktrees,
    workers,
    createdAt: new Date().toISOString(),
    planHash,
  };

  // Write plan
  const dir = dispatchDir(repoRoot);
  writeFileSync(join(dir, `plan-${planHash.slice(0, 12)}.json`), JSON.stringify(plan, null, 2) + '\n');

  return plan;
}

/**
 * Apply a dispatch plan — writes a receipt marking the plan as active.
 */
export function applyDispatchPlan(
  repoRoot: string,
  plan: DispatchPlan,
): DispatchApplyResult {
  const dir = dispatchDir(repoRoot);
  const receiptPath = join(dir, `apply-${plan.planHash.slice(0, 12)}.json`);

  const receipt = {
    type: 'dispatch-apply',
    planHash: plan.planHash,
    appliedAt: new Date().toISOString(),
    worktrees: plan.worktrees.length,
    workers: plan.workers,
  };
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');

  return {
    applied: true,
    planHash: plan.planHash,
    worktrees: plan.worktrees,
    receiptPath,
  };
}

/**
 * Load the most recent dispatch plan.
 */
export function loadDispatchPlan(repoRoot: string): DispatchPlan | null {
  const dir = join(repoRoot, DISPATCH_DIR);
  if (!existsSync(dir)) return null;

  const planFiles = readdirSync(dir)
    .filter(f => f.startsWith('plan-') && f.endsWith('.json'))
    .sort()
    .reverse();

  if (planFiles.length === 0) return null;

  try {
    return JSON.parse(readFileSync(join(dir, planFiles[0]), 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Get dispatch status — summarize worktree assignments.
 */
export function dispatchStatus(repoRoot: string): {
  hasPlan: boolean;
  planHash?: string;
  worktrees: DispatchWorktree[];
  workers: number;
  applied: boolean;
} {
  const plan = loadDispatchPlan(repoRoot);
  if (!plan) return { hasPlan: false, worktrees: [], workers: 0, applied: false };

  const dir = join(repoRoot, DISPATCH_DIR);
  const applyFiles = existsSync(dir)
    ? readdirSync(dir).filter(f => f.startsWith('apply-'))
    : [];
  const applied = applyFiles.some(f => f.includes(plan.planHash.slice(0, 12)));

  return {
    hasPlan: true,
    planHash: plan.planHash.slice(0, 12),
    worktrees: plan.worktrees,
    workers: plan.workers,
    applied,
  };
}
