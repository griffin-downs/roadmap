// @module convergence/gap-trajectory
// @description Compute gap trajectory across archived DAG iterations
// @exports IterationSnapshot, GapTrajectory, computeGapTrajectory

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../../protocol.ts';
import { detectGaps } from '../terminal-audit/detected.ts';
import type { GapEntry } from '../terminal-audit/detected.ts';
import { loadChain } from '../chain.ts';
import type { ChainLink } from '../chain.ts';

export interface IterationSnapshot {
  dagId: string;
  iteration: number;
  gapCount: number;
  gapsByType: Record<string, number>;
}

export interface GapTrajectory {
  iterations: IterationSnapshot[];
  resolved: GapEntry[];
  persistent: GapEntry[];
  new: GapEntry[];
  trend: 'converging' | 'stable' | 'diverging';
  reductionRate: number;
}

const HEAD_FILE = '.roadmap/head.json';
const HEADS_DIR = '.roadmap/heads';

/** Match a GapEntry by type + artifact for set-difference operations. */
function gapKey(g: GapEntry): string {
  return `${g.type}::${g.artifact}`;
}

/**
 * Try to load a JSON file as a Graph<string>.
 * Archived heads may use older formats (entries[] instead of nodes{}).
 * Returns null if the file can't be interpreted as a valid Graph.
 */
function tryLoadGraph(filePath: string): Graph<string> | null {
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));

    // Standard format: has id, init, term, nodes
    if (raw.id && raw.init && raw.term && raw.nodes && typeof raw.nodes === 'object') {
      return raw as Graph<string>;
    }

    // Legacy format: has entries[] array instead of nodes{} map
    if (raw.id && raw.entries && Array.isArray(raw.entries)) {
      const nodes: Record<string, unknown> = {};
      let init: string | undefined;
      let term: string | undefined;

      for (const entry of raw.entries) {
        if (!entry.id) continue;
        // Ensure required fields with defaults
        nodes[entry.id] = {
          id: entry.id,
          desc: entry.desc ?? '',
          produces: entry.produces ?? [],
          consumes: entry.consumes ?? [],
          deps: entry.deps ?? [],
          validate: entry.validate ?? [],
          idempotent: entry.idempotent ?? true,
        };
        // Heuristic: first entry with no deps is init, last is term
        if (entry.deps && entry.deps.length === 0 && !init) {
          init = entry.id;
        }
      }

      // Last entry is term (convention: init → ... → term)
      const lastEntry = raw.entries[raw.entries.length - 1];
      if (lastEntry?.id) term = lastEntry.id;

      if (init && term && Object.keys(nodes).length > 0) {
        return {
          id: raw.id,
          desc: raw.desc ?? '',
          init,
          term,
          nodes,
        } as Graph<string>;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/** Build an IterationSnapshot from a DAG. */
function snapshotFromDag(dag: Graph<string>, dagId: string, iteration: number): IterationSnapshot {
  const { gaps } = detectGaps(dag);
  const gapsByType: Record<string, number> = {};
  for (const gap of gaps) {
    gapsByType[gap.type] = (gapsByType[gap.type] ?? 0) + 1;
  }
  return {
    dagId,
    iteration,
    gapCount: gaps.length,
    gapsByType,
  };
}

/**
 * Compute gap trajectory across chain history.
 *
 * 1. Load current head.json as the current DAG
 * 2. Run detectGaps(currentDag) for current gaps
 * 3. Load chain.jsonl via loadChain(repoRoot) to get iteration history
 * 4. For each ChainLink, load the archived DAG from .roadmap/heads/<dagId>.json
 * 5. Run detectGaps() on each archived DAG to get historical gap snapshots
 * 6. Build iterations[] array with per-iteration gap counts
 * 7. Compare current gaps vs most recent predecessor
 * 8. Compute trend and reductionRate
 */
export function computeGapTrajectory(repoRoot: string): GapTrajectory {
  const iterations: IterationSnapshot[] = [];
  let currentGaps: GapEntry[] = [];
  let currentDagId = 'unknown';

  // Step 1–2: Load current head.json and detect gaps
  const headPath = join(repoRoot, HEAD_FILE);
  if (existsSync(headPath)) {
    const currentDag = tryLoadGraph(headPath);
    if (currentDag) {
      currentDagId = currentDag.id;
      const detected = detectGaps(currentDag);
      currentGaps = detected.gaps;
    }
  }

  // Step 3: Load chain history
  const chain = loadChain(repoRoot);

  // Step 4–5: Load archived DAGs and compute snapshots
  // Sort chain by iteration for chronological order
  const sortedChain = [...chain].sort((a, b) => a.iteration - b.iteration);

  for (const link of sortedChain) {
    const archivePath = join(repoRoot, HEADS_DIR, `${link.dagId}.json`);
    const dag = tryLoadGraph(archivePath);
    if (!dag) continue;
    iterations.push(snapshotFromDag(dag, link.dagId, link.iteration));
  }

  // If no chain exists, scan .roadmap/heads/ directly for any archived DAGs
  if (chain.length === 0) {
    const headsDir = join(repoRoot, HEADS_DIR);
    if (existsSync(headsDir)) {
      const files = readdirSync(headsDir).filter(f => f.endsWith('.json')).sort();
      let idx = 0;
      for (const file of files) {
        const dagPath = join(headsDir, file);
        const dag = tryLoadGraph(dagPath);
        if (!dag) continue;
        // Skip if this is the same as current head (not yet archived)
        if (dag.id === currentDagId) continue;
        iterations.push(snapshotFromDag(dag, dag.id, idx));
        idx++;
      }
    }
  }

  // Step 6: Add current DAG as the latest iteration
  const currentIteration = iterations.length > 0
    ? Math.max(...iterations.map(s => s.iteration)) + 1
    : 0;

  const currentGapsByType: Record<string, number> = {};
  for (const gap of currentGaps) {
    currentGapsByType[gap.type] = (currentGapsByType[gap.type] ?? 0) + 1;
  }
  const currentSnapshot: IterationSnapshot = {
    dagId: currentDagId,
    iteration: currentIteration,
    gapCount: currentGaps.length,
    gapsByType: currentGapsByType,
  };
  iterations.push(currentSnapshot);

  // Step 7: Compare current vs predecessor
  let resolved: GapEntry[] = [];
  let persistent: GapEntry[] = [];
  let newGaps: GapEntry[] = [];
  let predecessorGapCount = 0;

  if (iterations.length >= 2) {
    // Predecessor is second-to-last in iterations
    const predecessorSnapshot = iterations[iterations.length - 2];
    predecessorGapCount = predecessorSnapshot.gapCount;

    // Load predecessor DAG to get its actual gap entries
    let predecessorGaps: GapEntry[] = [];

    // Try from chain first
    const predLink = sortedChain.find(l => l.dagId === predecessorSnapshot.dagId);
    if (predLink) {
      const predPath = join(repoRoot, HEADS_DIR, `${predLink.dagId}.json`);
      const predDag = tryLoadGraph(predPath);
      if (predDag) {
        predecessorGaps = detectGaps(predDag).gaps;
      }
    } else {
      // Try direct file load from heads/
      const predPath = join(repoRoot, HEADS_DIR, `${predecessorSnapshot.dagId}.json`);
      const predDag = tryLoadGraph(predPath);
      if (predDag) {
        predecessorGaps = detectGaps(predDag).gaps;
      }
    }

    const predKeys = new Set(predecessorGaps.map(gapKey));
    const currKeys = new Set(currentGaps.map(gapKey));

    resolved = predecessorGaps.filter(g => !currKeys.has(gapKey(g)));
    persistent = currentGaps.filter(g => predKeys.has(gapKey(g)));
    newGaps = currentGaps.filter(g => !predKeys.has(gapKey(g)));
  } else {
    // Only one iteration (current) — everything is new
    newGaps = [...currentGaps];
  }

  // Step 8: Compute trend
  let trend: 'converging' | 'stable' | 'diverging';
  if (iterations.length <= 1) {
    trend = 'stable';
  } else if (currentSnapshot.gapCount < predecessorGapCount) {
    trend = 'converging';
  } else if (currentSnapshot.gapCount > predecessorGapCount) {
    trend = 'diverging';
  } else {
    trend = 'stable';
  }

  // Step 9: Compute reductionRate
  let reductionRate = 0;
  if (predecessorGapCount > 0) {
    reductionRate = (predecessorGapCount - currentSnapshot.gapCount) / predecessorGapCount;
  }

  return {
    iterations,
    resolved,
    persistent,
    new: newGaps,
    trend,
    reductionRate,
  };
}
