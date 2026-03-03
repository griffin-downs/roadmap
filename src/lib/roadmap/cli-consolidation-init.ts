// @module cli-consolidation-init
// @exports ensureConsolidated
// @types ConsolidationInitResult
// @entry internal (called at CLI startup)

import * as fs from 'fs';
import * as path from 'path';
import { consolidateAllDAGs } from './dag-consolidator.ts';
import { hasSpecOriginSync, SPEC_ORIGIN_PATH } from '../intake/spec-origin.ts';

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
 * Intake enforcement: auto-discovery consolidation is disabled.
 * Consolidation only runs when:
 * - Explicit spec paths are provided via consolidateFromSpecs()
 * - Each spec has a valid spec-origin
 *
 * Idempotent: safe to call multiple times.
 * Single DAG: no-op (returns early).
 */
export async function ensureConsolidated(repoRoot: string): Promise<ConsolidationInitResult> {
  const roadmapDir = path.join(repoRoot, '.roadmap');

  if (!fs.existsSync(roadmapDir)) {
    return { consolidated: false, merged: false, count: 0, order: [], batches: [] };
  }

  // No auto-discovery: consolidation requires explicit spec paths.
  // This function now only validates that existing head.json is consistent.
  const headPath = path.join(roadmapDir, 'head.json');
  if (fs.existsSync(headPath)) {
    return { consolidated: false, merged: false, count: 1, order: [], batches: [] };
  }

  return { consolidated: false, merged: false, count: 0, order: [], batches: [] };
}

/**
 * Consolidate from explicit spec paths.
 * Each spec must have a valid spec-origin.json.
 * No auto-discovery — caller provides exact paths.
 */
export async function consolidateFromSpecs(
  repoRoot: string,
  specPaths: string[],
): Promise<ConsolidationInitResult> {
  if (specPaths.length === 0) {
    return {
      consolidated: false, merged: false, count: 0, order: [], batches: [],
      error: 'No spec paths provided. Use: roadmap consolidate --specs <path1>,<path2>',
    };
  }

  // Validate each spec has origin
  for (const sp of specPaths) {
    const specDir = path.dirname(path.resolve(repoRoot, sp));
    const originPath = path.join(specDir, 'spec-origin.json');
    // Check spec-origin exists at repo level (all specs share the origin)
    if (!hasSpecOriginSync(repoRoot)) {
      return {
        consolidated: false, merged: false, count: specPaths.length, order: [], batches: [],
        error: `Missing spec-origin for consolidation. Each spec must be created via the intake pipeline. Missing: ${SPEC_ORIGIN_PATH}`,
      };
    }
  }

  const roadmapDir = path.join(repoRoot, '.roadmap');
  const headPath = path.join(roadmapDir, 'head.json');

  try {
    const result = await consolidateAllDAGs(repoRoot);

    fs.writeFileSync(headPath, JSON.stringify(result.merged, null, 2));

    // Update baseSha to current git HEAD
    try {
      const { execSync } = require('child_process');
      const baseSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();
      const head = JSON.parse(fs.readFileSync(headPath, 'utf-8'));
      head.baseSha = baseSha;
      fs.writeFileSync(headPath, JSON.stringify(head, null, 2));
    } catch {
      // baseSha update is best-effort
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
      consolidated: false, merged: false, count: specPaths.length, order: [], batches: [],
      error: `Consolidation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
