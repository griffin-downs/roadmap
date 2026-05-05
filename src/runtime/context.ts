// @module runtime/context
// @description Single IO boundary for the runtime layer. loadContext() reads all
//   filesystem state once; every downstream runtime function takes Context, not repoRoot.
// @exports Context, ChainState, HandoffMap, HandoffEntry, ChainLink, ExecutionReport, loadContext
// @types Context, ChainState, HandoffMap, HandoffEntry, ChainLink, ExecutionReport
// @entry roadmap

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { CompletionStore } from './completion.ts';
import type { ChainLink, ExecutionReport } from '../lib/chain.ts';
import type { FinalHandoff, InterimHandoff } from '../lib/handoff-types.ts';

// Re-export chain types so callers can import from context rather than chain.ts directly.
export type { ChainLink, ExecutionReport };
import { computeTrailMetrics, type TrailMetrics } from '../lib/trail-metrics.ts';

// --- Types ---

/** Loaded chain state from .roadmap/heads/*.json _lineage fields */
export interface ChainState {
  readonly links: readonly ChainLink[];
  /** Highest iteration number, or 0 if no chain entries */
  readonly iteration: number;
  /**
   * Desc of the root (iteration 0) archived DAG — the original intent of the chain.
   * Falls back to empty string if no archived heads exist.
   */
  readonly rootIntent: string;
}

/** A node's handoff data: final handoff plus any interim checkpoints */
export interface HandoffEntry {
  readonly nodeId: string;
  readonly final: FinalHandoff | null;
  readonly interims: readonly InterimHandoff[];
}

/** Map of nodeId → HandoffEntry for all nodes with handoff data */
export type HandoffMap = ReadonlyMap<string, HandoffEntry>;

/**
 * Runtime context: all IO-derived state needed by runtime functions.
 * Loaded once via loadContext(), threaded through all runtime calls.
 * Below this boundary (core/) is pure. Above (CLI) calls loadContext() once.
 */
export interface Context {
  /** Absolute path to repository root */
  readonly repoRoot: string;
  /** Completion store — receipt-based node completion tracking */
  readonly completion: CompletionStore;
  /** Chain state — convergence iteration history */
  readonly chain: ChainState;
  /** Handoff data — per-node final handoffs and interim checkpoints */
  readonly handoffs: HandoffMap;
  /** Trail-derived scoring metrics — velocity, batch duration, session metrics. Best-effort: undefined if trail.jsonl missing or unparseable */
  readonly scoring?: TrailMetrics;
}

// --- Loaders ---

/** Load chain state by scanning .roadmap/heads/*.json _lineage fields */
function loadChainState(repoRoot: string): ChainState {
  const headsDir = join(repoRoot, '.roadmap', 'heads');
  if (!existsSync(headsDir)) {
    return { links: [], iteration: 0, rootIntent: '' };
  }

  try {
    const files = readdirSync(headsDir).filter(f => f.endsWith('.json'));
    const links: ChainLink[] = [];
    /** desc per dagId — used to find root intent below */
    const descByDagId = new Map<string, string>();

    for (const file of files) {
      try {
        const content = readFileSync(join(headsDir, file), 'utf-8');
        const parsed = JSON.parse(content) as { id?: string; desc?: string; _lineage?: { iteration: number; predecessorId: string | null; completedAt: string; executionReport?: ExecutionReport } };
        if (!parsed._lineage) continue;
        const lin = parsed._lineage;
        const dagId = parsed.id ?? file.replace('.json', '');
        links.push({
          dagId,
          iteration: lin.iteration,
          predecessorId: lin.predecessorId,
          completedAt: lin.completedAt,
          successorDagId: null,
          executionReport: lin.executionReport,
        });
        if (parsed.desc) descByDagId.set(dagId, parsed.desc);
      } catch {
        // Skip malformed heads
      }
    }

    links.sort((a, b) => a.iteration - b.iteration);
    const iteration = links.length === 0 ? 0 : Math.max(...links.map(l => l.iteration));

    // rootIntent: desc from the lowest-iteration archived head
    let rootIntent = '';
    if (links.length > 0) {
      const rootLink = links[0]; // already sorted ascending
      rootIntent = descByDagId.get(rootLink.dagId) ?? '';
    }

    return { links, iteration, rootIntent };
  } catch {
    return { links: [], iteration: 0, rootIntent: '' };
  }
}

/** Load all handoff data from .roadmap/.handoff/ */
function loadHandoffs(repoRoot: string): HandoffMap {
  const handoffDir = join(repoRoot, '.roadmap', '.handoff');
  const entries = new Map<string, HandoffEntry>();

  if (!existsSync(handoffDir)) return entries;

  let files: string[];
  try {
    files = readdirSync(handoffDir).filter(f => f.endsWith('.json'));
  } catch {
    return entries;
  }

  // Partition files into finals and interims
  const finalFiles = files.filter(f => !f.includes('-interim-'));
  const interimFiles = files.filter(f => f.includes('-interim-'));

  // Index interims by nodeId
  const interimsByNode = new Map<string, InterimHandoff[]>();
  for (const f of interimFiles) {
    // Format: {nodeId}-interim-{timestamp}.json
    const match = f.match(/^(.+)-interim-.+\.json$/);
    if (!match) continue;
    const nodeId = match[1];
    try {
      const content = readFileSync(join(handoffDir, f), 'utf-8');
      const interim = JSON.parse(content) as InterimHandoff;
      if (!interimsByNode.has(nodeId)) interimsByNode.set(nodeId, []);
      interimsByNode.get(nodeId)!.push(interim);
    } catch {
      // Skip malformed interim files
    }
  }

  // Sort interims chronologically per node
  for (const interims of interimsByNode.values()) {
    interims.sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));
  }

  // Collect all node IDs from both finals and interims
  const nodeIds = new Set<string>();
  for (const f of finalFiles) {
    nodeIds.add(f.replace('.json', ''));
  }
  for (const nodeId of interimsByNode.keys()) {
    nodeIds.add(nodeId);
  }

  // Build entries
  for (const nodeId of nodeIds) {
    let final: FinalHandoff | null = null;
    const finalFile = `${nodeId}.json`;
    if (finalFiles.includes(finalFile)) {
      try {
        const content = readFileSync(join(handoffDir, finalFile), 'utf-8');
        final = JSON.parse(content) as FinalHandoff;
      } catch {
        // Skip malformed final handoff
      }
    }

    entries.set(nodeId, {
      nodeId,
      final,
      interims: interimsByNode.get(nodeId) ?? [],
    });
  }

  return entries;
}

// --- Public API ---

/**
 * Load all runtime context from filesystem. This is the single IO boundary:
 * call once at session start, then thread Context through all runtime functions.
 *
 * - Completions: .roadmap/completed.json (receipt-based)
 * - Chain: .roadmap/heads/*.json _lineage fields (convergence iteration history)
 * - Handoffs: .roadmap/.handoff/ (per-node final + interim checkpoints)
 *
 * Uses loadOrEmpty for completions so missing files don't throw.
 */
export function loadContext(repoRoot: string): Context {
  // Trail scoring is best-effort — if trail.jsonl is missing or malformed, scoring is undefined
  let scoring: TrailMetrics | undefined;
  try {
    scoring = computeTrailMetrics(repoRoot);
  } catch {
    // Best-effort: don't crash if trail metrics computation fails
  }

  return {
    repoRoot,
    completion: CompletionStore.loadOrEmpty(repoRoot),
    chain: loadChainState(repoRoot),
    handoffs: loadHandoffs(repoRoot),
    scoring,
  };
}
