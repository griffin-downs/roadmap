// @module trail-metrics
// @exports computeTrailMetrics, loadTrailEntries
// @types TrailMetrics, BatchMetrics, NodeMetrics
// @entry roadmap/trail-metrics
//
// Roadmap-native performance metrics derived from trail.jsonl + claims.json.
// No regent dependency — works in any execution context.
// Used as the baseline layer of evidence.json; agent transcript data enriches
// but is never required for the convergence check to function.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadClaims } from './claims/claims.ts';

export interface NodeMetrics {
  nodeId: string;
  owner?: string;
  claimedAt?: string;     // ISO — from claims.json at compute time
  completedAt?: string;   // ISO — from trail 'complete' entry ts
  durationMs?: number;    // completedAt - claimedAt (undefined if either missing)
}

export interface BatchMetrics {
  level: number;
  nodes: string[];        // all node IDs at this level per trail entries
  startedAt?: string;     // ISO — earliest claimedAt across batch nodes
  completedAt?: string;   // ISO — latest completedAt across batch nodes
  wallClockMs?: number;   // completedAt - startedAt (undefined if either missing)
  nodeMetrics: NodeMetrics[];
  orientCallCount: number; // orient calls recorded at this level
}

export interface TrailMetrics {
  source: 'trail';        // sentinel — distinguishes from agent-enriched metrics
  dagId?: string;
  iteration: number;      // from .roadmap/iter.json (0 if file absent)
  batches: BatchMetrics[];
  totalWallClockMs?: number;   // span of first startedAt to last completedAt
  orientCallCount: number;     // total orient calls in trail
  completeCallCount: number;   // total complete calls in trail
  entryCount: number;          // total trail entries parsed
}

export interface TrailEntry {
  ts: string;
  cmd: string;
  note?: string;
  repo?: string;
  position?: string[];
  level?: number;
  dagId?: string;
  detail?: Record<string, unknown>;
}

// --- Readers ---

export function loadTrailEntries(repoRoot: string): TrailEntry[] {
  const path = join(repoRoot, '.roadmap', 'trail.jsonl');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .flatMap(line => {
      try { return [JSON.parse(line) as TrailEntry]; }
      catch { return []; }
    });
}

function loadIterState(repoRoot: string): number {
  const path = join(repoRoot, '.roadmap', 'iter.json');
  if (!existsSync(path)) return 0;
  try { return (JSON.parse(readFileSync(path, 'utf-8')) as { iteration: number }).iteration ?? 0; }
  catch { return 0; }
}

// --- Core computation ---

export function computeTrailMetrics(repoRoot: string): TrailMetrics {
  const entries = loadTrailEntries(repoRoot);
  const claims = loadClaims(repoRoot);
  const iteration = loadIterState(repoRoot);

  // Group complete entries by level
  const completeByLevel = new Map<number, TrailEntry[]>();
  const orientByLevel = new Map<number, number>();
  let dagId: string | undefined;
  let completeCallCount = 0;
  let orientCallCount = 0;

  for (const e of entries) {
    if (e.dagId && !dagId) dagId = e.dagId;

    if (e.cmd === 'orient' || e.cmd === 'position') {
      orientCallCount++;
      if (e.level !== undefined) {
        orientByLevel.set(e.level, (orientByLevel.get(e.level) ?? 0) + 1);
      }
    }

    if (e.cmd === 'complete' && e.level !== undefined) {
      completeCallCount++;
      const bucket = completeByLevel.get(e.level) ?? [];
      bucket.push(e);
      completeByLevel.set(e.level, bucket);
    }
  }

  // Build per-batch metrics
  const batches: BatchMetrics[] = [];
  for (const [level, completes] of [...completeByLevel.entries()].sort(([a], [b]) => a - b)) {
    const nodeMetrics: NodeMetrics[] = completes.map(e => {
      const nodeId = (e.detail?.nodeId as string | undefined) ?? 'unknown';
      const claim = claims[nodeId];
      const completedAt = e.ts;
      const claimedAt = claim?.claimedAt;
      const owner = (e.detail?.owner as string | undefined) ?? claim?.owner;
      const durationMs = claimedAt && completedAt
        ? new Date(completedAt).getTime() - new Date(claimedAt).getTime()
        : undefined;
      return { nodeId, owner, claimedAt, completedAt, durationMs };
    });

    const startedAt = nodeMetrics
      .map(n => n.claimedAt)
      .filter(Boolean)
      .sort()[0];
    const completedAt = nodeMetrics
      .map(n => n.completedAt)
      .filter(Boolean)
      .sort()
      .at(-1);
    const wallClockMs = startedAt && completedAt
      ? new Date(completedAt).getTime() - new Date(startedAt).getTime()
      : undefined;

    batches.push({
      level,
      nodes: nodeMetrics.map(n => n.nodeId),
      startedAt,
      completedAt,
      wallClockMs,
      nodeMetrics,
      orientCallCount: orientByLevel.get(level) ?? 0,
    });
  }

  // Total wall-clock: earliest batch startedAt → latest batch completedAt
  const allStarts = batches.map(b => b.startedAt).filter(Boolean).sort();
  const allEnds = batches.map(b => b.completedAt).filter(Boolean).sort();
  const firstStart = allStarts[0];
  const lastEnd = allEnds.at(-1);
  const totalWallClockMs = firstStart && lastEnd
    ? new Date(lastEnd).getTime() - new Date(firstStart).getTime()
    : undefined;

  return {
    source: 'trail',
    dagId,
    iteration,
    batches,
    totalWallClockMs,
    orientCallCount,
    completeCallCount,
    entryCount: entries.length,
  };
}
