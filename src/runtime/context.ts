// @module runtime/context
// @description Single IO boundary for the runtime layer. loadContext() reads all
//   filesystem state once; every downstream runtime function takes Context, not repoRoot.
// @exports Context, ChainState, HandoffMap, HandoffEntry, loadContext
// @types Context, ChainState, HandoffMap, HandoffEntry
// @entry roadmap

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { CompletionStore } from './completion.ts';
import type { ChainLink } from '../lib/chain.ts';
import type { FinalHandoff, InterimHandoff } from '../lib/brief.ts';
import { computeTrailMetrics, type TrailMetrics } from '../lib/trail-metrics.ts';

// --- Types ---

/** Loaded chain state from .roadmap/chain.jsonl */
export interface ChainState {
  readonly links: readonly ChainLink[];
  /** Highest iteration number, or 0 if no chain entries */
  readonly iteration: number;
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

/** Load chain state from .roadmap/chain.jsonl */
function loadChainState(repoRoot: string): ChainState {
  const chainPath = join(repoRoot, '.roadmap', 'chain.jsonl');
  if (!existsSync(chainPath)) {
    return { links: [], iteration: 0 };
  }

  try {
    const content = readFileSync(chainPath, 'utf-8');
    const links: ChainLink[] = content
      .split('\n')
      .filter(line => line.trim() !== '')
      .map(line => JSON.parse(line) as ChainLink);

    const iteration = links.length === 0
      ? 0
      : Math.max(...links.map(l => l.iteration));

    return { links, iteration };
  } catch {
    return { links: [], iteration: 0 };
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
 * - Chain: .roadmap/chain.jsonl (convergence iteration history)
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
