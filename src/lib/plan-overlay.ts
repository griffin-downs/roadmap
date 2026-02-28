// @module plan-overlay
// @exports PlanOverlay, PlanOverlayScheduleEntry, buildPlanOverlay, loadPlanOverlay, isOverlayValid, writePlanOverlay
// @types PlanOverlay, PlanOverlayScheduleEntry
// @entry roadmap

// Plan overlay: binds a plan selection to clusters and schedule.
// Overlay invalidates when headSha (DAG content hash) changes.
// Schedule is deterministic from overlay clusters + DAG topology.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export interface PlanOverlayScheduleEntry {
  wave: number;
  clusterId: string;
  nodes: string[];
}

export interface PlanOverlay {
  schemaVersion: 1;
  headSha: string;        // sha256 of head.json content — overlay invalidates on change
  candidateId: string;    // which plan candidate this overlay was built for
  clusters: Array<{
    id: string;
    nodes: string[];
    produces: string[];
    consumes: string[];
  }>;
  schedule: PlanOverlayScheduleEntry[];
  builtAt: string;
  overlayHash: string;    // sha256 of deterministic overlay content
}

const OVERLAY_PATH = '.roadmap/plan-overlay.json';

function computeHeadSha(repoRoot: string): string | null {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  if (!existsSync(headPath)) return null;
  const content = readFileSync(headPath, 'utf-8');
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Build a plan overlay from a DAG, clusters, and schedule.
 * The overlay is deterministic from the inputs.
 */
export function buildPlanOverlay(
  repoRoot: string,
  candidateId: string,
  clusters: Array<{ id: string; nodes: string[]; produces: string[]; consumes: string[] }>,
  schedule: Array<{ wave: number; spawn: string[] }>,
): PlanOverlay {
  const headSha = computeHeadSha(repoRoot);
  if (!headSha) throw new Error('No head.json found — cannot build overlay');

  // Build schedule entries from wave + cluster mapping
  const scheduleEntries: PlanOverlayScheduleEntry[] = [];
  const clusterMap = new Map(clusters.map(c => [c.id, c]));

  for (const wave of schedule) {
    for (const clusterId of wave.spawn) {
      const cluster = clusterMap.get(clusterId);
      scheduleEntries.push({
        wave: wave.wave,
        clusterId,
        nodes: cluster ? cluster.nodes : [],
      });
    }
  }

  // Sort for determinism
  scheduleEntries.sort((a, b) => a.wave - b.wave || a.clusterId.localeCompare(b.clusterId));
  const sortedClusters = [...clusters].sort((a, b) => a.id.localeCompare(b.id));

  const overlayContent = JSON.stringify({ headSha, candidateId, clusters: sortedClusters, schedule: scheduleEntries });
  const overlayHash = createHash('sha256').update(overlayContent).digest('hex');

  return {
    schemaVersion: 1,
    headSha,
    candidateId,
    clusters: sortedClusters,
    schedule: scheduleEntries,
    builtAt: new Date().toISOString(),
    overlayHash,
  };
}

export function writePlanOverlay(repoRoot: string, overlay: PlanOverlay): string {
  const dir = join(repoRoot, '.roadmap');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const p = join(repoRoot, OVERLAY_PATH);
  writeFileSync(p, JSON.stringify(overlay, null, 2) + '\n');
  return p;
}

export function loadPlanOverlay(repoRoot: string): PlanOverlay | null {
  const p = join(repoRoot, OVERLAY_PATH);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Check if an overlay is still valid against the current DAG state.
 * Invalid when headSha has changed (DAG mutation).
 */
export function isOverlayValid(repoRoot: string, overlay: PlanOverlay): boolean {
  const currentSha = computeHeadSha(repoRoot);
  return currentSha === overlay.headSha;
}
