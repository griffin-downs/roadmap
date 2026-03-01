// @module sgk/mine
// @exports mineRun, MineRunOpts
// @entry roadmap

import { writeMineReceipt } from './receipts/mine.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface MineRunOpts {
  runId: string;
  repoRoot: string;
  toolCallLog?: Array<{ tool: string; durationMs: number; nodeId?: string }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * Aggregate tool call telemetry into a MiningReceipt.
 * Computes: tool call counts, latency p50/p95, hotspot nodes, friction nodes.
 */
export function mineRun(opts: MineRunOpts): string {
  const log = opts.toolCallLog ?? [];

  // Tool call counts
  const toolCallCounts: Record<string, number> = {};
  for (const entry of log) {
    toolCallCounts[entry.tool] = (toolCallCounts[entry.tool] ?? 0) + 1;
  }

  // Latency percentiles
  const durations = log.map(e => e.durationMs).sort((a, b) => a - b);
  const latencyP50Ms = percentile(durations, 50);
  const latencyP95Ms = percentile(durations, 95);

  // Hotspot nodes: top 3 by call count
  const nodeCounts: Record<string, number> = {};
  for (const entry of log) {
    if (entry.nodeId) {
      nodeCounts[entry.nodeId] = (nodeCounts[entry.nodeId] ?? 0) + 1;
    }
  }
  const hotspots = Object.entries(nodeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);

  // Friction nodes: nodes with >1 tool call on same operation (tool)
  const nodeToolPairs: Record<string, Set<string>> = {};
  for (const entry of log) {
    if (entry.nodeId) {
      const key = `${entry.nodeId}:${entry.tool}`;
      if (!nodeToolPairs[entry.nodeId]) nodeToolPairs[entry.nodeId] = new Set();
      nodeToolPairs[entry.nodeId].add(key);
    }
  }
  const frictionSet = new Set<string>();
  for (const entry of log) {
    if (entry.nodeId) {
      const key = `${entry.nodeId}:${entry.tool}`;
      const count = log.filter(e => e.nodeId === entry.nodeId && e.tool === entry.tool).length;
      if (count > 1) frictionSet.add(entry.nodeId);
    }
  }
  const friction = [...frictionSet];

  return writeMineReceipt(opts.repoRoot, {
    schema_version: 1,
    type: 'mining',
    runId: opts.runId,
    toolCallCounts,
    latencyP50Ms,
    latencyP95Ms,
    hotspots,
    friction,
    minedAt: new Date().toISOString(),
  });
}
