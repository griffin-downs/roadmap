// @module cli-consolidation-init
// @exports ensureConsolidated
// @types ConsolidationInitResult
// @entry internal (called at CLI startup)

import * as fs from 'fs';
import * as path from 'path';
import { consolidateAllDAGs } from './dag-consolidator.ts';

export interface ConsolidationInitResult {
  consolidated: boolean;  // true if merge happened
  merged: boolean;        // same as consolidated (for clarity)
  count: number;          // number of DAGs found
  order: string[];        // topological execution order
  batches: string[][];    // parallel execution batches
  error?: string;         // error message if consolidation failed
}

/**
 * Consolidate all DAGs at CLI startup.
 *
 * This is called automatically before every CLI command to ensure:
 * - Multiple DAGs are merged into head.json
 * - Correct topological ordering (not alphabetical)
 * - Single source of truth for the roadmap
 * - Transparent to the user
 *
 * Idempotent: safe to call multiple times.
 * Single DAG: no-op (returns early).
 */
export async function ensureConsolidated(repoRoot: string): Promise<ConsolidationInitResult> {
  const roadmapDir = path.join(repoRoot, '.roadmap');
  const headPath = path.join(roadmapDir, 'head.json');

  // Discover all DAG files
  const files = fs.readdirSync(roadmapDir).filter((f) => f.endsWith('.json')).sort();

  // Filter for DAG files (skip system files)
  const systemFiles = new Set([
    'head.json',
    'head-index.json',
    'git-state.json',
    'hook-config.json',
    'iter.json',
    'recovery-state.json',
    'PLAN_SELECTED.json',
    'strategy.json',
    'rates.json',
    'spec-origin.json',
    'migration-receipt.json',
    'retired.json',
    'test-head.json',
  ]);

  const dagFiles = files.filter((f) => !systemFiles.has(f) && !f.startsWith('.') && !f.endsWith('.backup.json'));

  // Single DAG or no DAGs: no consolidation needed
  if (dagFiles.length <= 1) {
    return {
      consolidated: false,
      merged: false,
      count: dagFiles.length,
      order: [],
      batches: [],
    };
  }

  // Multiple DAGs: consolidate
  try {
    const result = await consolidateAllDAGs(repoRoot);

    // Write consolidated DAG to head.json
    fs.writeFileSync(headPath, JSON.stringify(result.merged, null, 2));

    // Update baseSha to current git HEAD
    try {
      const { execSync } = require('child_process');
      const baseSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();

      const head = JSON.parse(fs.readFileSync(headPath, 'utf-8'));
      head.baseSha = baseSha;
      fs.writeFileSync(headPath, JSON.stringify(head, null, 2));
    } catch {
      // baseSha update is best-effort, don't fail on git errors
    }

    return {
      consolidated: true,
      merged: true,
      count: result.merged.id ? result.sourceFiles.length : 0,
      order: result.executionOrder,
      batches: result.executionBatches,
    };
  } catch (err) {
    return {
      consolidated: false,
      merged: false,
      count: dagFiles.length,
      order: [],
      batches: [],
      error: `Consolidation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
