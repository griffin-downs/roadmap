// @module protocol-distributed
// @exports loadDistributedState, aggregateMetrics, findBottlenecks, crossRepoOrientation, detectPatterns
// @types RepoState, DistributedState, CrossRepoBottleneck, PatternMatch, PatternReport
// @entry roadmap/distributed

import * as fs from 'fs';
import * as path from 'path';
import { orient, define } from './protocol.ts';
import type { Graph, Orientation } from './protocol.ts';
import { CompletionStore } from './lib/protocol/index.ts';
import { mergeMultiWay } from './lib/roadmap/dag-consolidator.ts';
import type { DAGFile, PhaseConnection } from './lib/roadmap/dag-consolidator.ts';
import { buildDAGDependencyGraph } from './lib/roadmap/dag-dependency-resolver.ts';
import type { DAGDependencyGraph } from './lib/roadmap/dag-dependency-resolver.ts';
import { MetricsExtractor } from './metrics-extractor.ts';
import type { MetricsSummary } from './metrics-extractor.ts';

// --- Types ---

export interface RepoState {
  root: string;
  dag: Graph<string>;
  orientation: Orientation;
  metrics: MetricsSummary | null;
  error?: string;
}

export interface DistributedState {
  repos: RepoState[];
  merged: Graph<string>;
  depGraph: DAGDependencyGraph;
  connections: PhaseConnection[];
  syncedAt: string;
  skipped: { root: string; reason: string }[];
}

export interface CrossRepoBottleneck {
  repo: string;
  nodeId: string;
  blockedBy: { repo: string; nodeId: string; artifact: string }[];
}

export interface PatternMatch {
  pattern: string;
  repos: string[];
  nodeIds: string[];
  confidence: number;
}

export interface PatternReport {
  structuralPatterns: PatternMatch[];
  bottleneckPatterns: PatternMatch[];
  velocityOutliers: { repo: string; velocity: number; avgVelocity: number }[];
  timestamp: string;
}

// --- Helpers ---

function loadHeadJson(repoRoot: string): Graph<string> | null {
  const headPath = path.join(repoRoot, '.roadmap', 'head.json');
  if (!fs.existsSync(headPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(headPath, 'utf-8'));
    define(raw); // validate structure
    return raw;
  } catch {
    return null;
  }
}

function orientRepo(dag: Graph<string>, repoRoot: string): Orientation {
  // Use receipt-based completion if available, else empty store
  try {
    const store = CompletionStore.load(repoRoot);
    return orient(dag, store);
  } catch {
    return orient(dag, CompletionStore.empty());
  }
}

function loadRepoMetrics(repoRoot: string): MetricsSummary | null {
  const trailPath = path.join(repoRoot, '.roadmap', 'trail.jsonl');
  if (!fs.existsSync(trailPath)) return null;
  try {
    return MetricsExtractor.fromFile(trailPath).summary();
  } catch {
    return null;
  }
}

function nodeSignature(node: { produces?: readonly string[]; consumes?: readonly any[]; validate?: readonly any[] }): string {
  const pCount = node.produces?.length ?? 0;
  const cCount = node.consumes?.length ?? 0;
  const vTypes = (node.validate ?? []).map((v: any) => v.type ?? 'unknown').sort().join(',');
  return `p${pCount}:c${cCount}:v[${vTypes}]`;
}

// --- Core Functions ---

/**
 * Load distributed state from multiple repo roots.
 * Per-repo failures are non-fatal: skipped repos appear in `skipped`.
 */
export function loadDistributedState(repoRoots: string[]): DistributedState {
  const repos: RepoState[] = [];
  const skipped: { root: string; reason: string }[] = [];
  const dagFiles: DAGFile[] = [];

  for (const root of repoRoots) {
    const absRoot = path.resolve(root);
    const dag = loadHeadJson(absRoot);
    if (!dag) {
      skipped.push({ root: absRoot, reason: 'missing or invalid head.json' });
      continue;
    }

    const orientation = orientRepo(dag, absRoot);
    const metrics = loadRepoMetrics(absRoot);

    repos.push({ root: absRoot, dag, orientation, metrics });
    dagFiles.push({
      path: path.join(absRoot, '.roadmap', 'head.json'),
      name: `${dag.id}.json`,
      content: dag,
    });
  }

  if (dagFiles.length === 0) {
    return {
      repos: [],
      merged: { id: 'empty', desc: 'no repos loaded', init: 'init', term: 'term', nodes: { init: { id: 'init', desc: '', produces: [], consumes: [], deps: [], validate: [] }, term: { id: 'term', desc: '', produces: [], consumes: [], deps: ['init'], validate: [] } } } as unknown as Graph<string>,
      depGraph: { dags: new Map(), dependencies: new Map(), order: [], hasCycle: false },
      connections: [],
      syncedAt: new Date().toISOString(),
      skipped,
    };
  }

  const mergeResult = mergeMultiWay(dagFiles);
  const dags = dagFiles.map(f => f.content);
  const depGraph = buildDAGDependencyGraph(dags);

  return {
    repos,
    merged: mergeResult.merged,
    depGraph,
    connections: mergeResult.connections,
    syncedAt: new Date().toISOString(),
    skipped,
  };
}

/**
 * Aggregate metrics across repos by combining trail.jsonl files.
 */
export function aggregateMetrics(repoRoots: string[]): MetricsSummary {
  const trailPaths = repoRoots
    .map(r => path.join(path.resolve(r), '.roadmap', 'trail.jsonl'))
    .filter(p => fs.existsSync(p));
  return MetricsExtractor.fromFiles(...trailPaths).summary();
}

/**
 * Find cross-repo bottlenecks: nodes blocked by incomplete nodes in other repos.
 */
export function findBottlenecks(state: DistributedState): CrossRepoBottleneck[] {
  const bottlenecks: CrossRepoBottleneck[] = [];

  // Build producer index: artifact → { repo, nodeId, complete }
  const producers = new Map<string, { repo: string; nodeId: string; complete: boolean }[]>();
  for (const rs of state.repos) {
    const doneNodes = new Set(rs.orientation.done);
    for (const [nodeId, node] of Object.entries(rs.dag.nodes)) {
      if (node.produces) {
        for (const art of node.produces) {
          if (!producers.has(art)) producers.set(art, []);
          producers.get(art)!.push({ repo: rs.root, nodeId, complete: doneNodes.has(nodeId) });
        }
      }
    }
  }

  // For each repo's current batch, check if consumes depend on other repo's incomplete node
  for (const rs of state.repos) {
    for (const nodeId of rs.orientation.position) {
      const node = rs.dag.nodes[nodeId];
      if (!node?.consumes) continue;

      const blockedBy: CrossRepoBottleneck['blockedBy'] = [];
      for (const c of node.consumes) {
        const artifact = typeof c === 'string' ? c : (c as any).artifact;
        const prods = producers.get(artifact) ?? [];
        for (const prod of prods) {
          if (prod.repo !== rs.root && !prod.complete) {
            blockedBy.push({ repo: prod.repo, nodeId: prod.nodeId, artifact });
          }
        }
      }

      if (blockedBy.length > 0) {
        bottlenecks.push({ repo: rs.root, nodeId, blockedBy });
      }
    }
  }

  return bottlenecks;
}

/**
 * Per-repo orientation in context of the merged DAG.
 * Augments each repo's local orientation with cross-repo blocking info.
 */
export function crossRepoOrientation(state: DistributedState): Map<string, Orientation & { crossRepoBlocked: CrossRepoBottleneck[] }> {
  const bottlenecks = findBottlenecks(state);
  const result = new Map<string, Orientation & { crossRepoBlocked: CrossRepoBottleneck[] }>();

  for (const rs of state.repos) {
    const repoBottlenecks = bottlenecks.filter(b => b.repo === rs.root);
    result.set(rs.root, { ...rs.orientation, crossRepoBlocked: repoBottlenecks });
  }

  return result;
}

/**
 * Detect recurring patterns across distributed DAGs.
 * Compares node shapes (produces/consumes/validate signatures) and velocity metrics.
 */
export function detectPatterns(states: DistributedState[]): PatternReport {
  const structuralPatterns: PatternMatch[] = [];
  const bottleneckPatterns: PatternMatch[] = [];

  // Structural: find common node signatures across repos
  const sigIndex = new Map<string, { repo: string; nodeId: string }[]>();
  for (const state of states) {
    for (const rs of state.repos) {
      for (const [nodeId, node] of Object.entries(rs.dag.nodes)) {
        const sig = nodeSignature(node);
        if (!sigIndex.has(sig)) sigIndex.set(sig, []);
        sigIndex.get(sig)!.push({ repo: rs.root, nodeId });
      }
    }
  }

  for (const [sig, entries] of sigIndex) {
    const uniqueRepos = [...new Set(entries.map(e => e.repo))];
    if (uniqueRepos.length >= 2) {
      structuralPatterns.push({
        pattern: sig,
        repos: uniqueRepos,
        nodeIds: entries.map(e => e.nodeId),
        confidence: Math.min(1, uniqueRepos.length / states.reduce((sum, s) => sum + s.repos.length, 0)),
      });
    }
  }

  // Bottleneck: find recurring bottleneck artifacts across states
  const bottleneckArtifacts = new Map<string, { repo: string; nodeId: string }[]>();
  for (const state of states) {
    const bns = findBottlenecks(state);
    for (const bn of bns) {
      for (const blocker of bn.blockedBy) {
        if (!bottleneckArtifacts.has(blocker.artifact)) bottleneckArtifacts.set(blocker.artifact, []);
        bottleneckArtifacts.get(blocker.artifact)!.push({ repo: blocker.repo, nodeId: blocker.nodeId });
      }
    }
  }

  for (const [artifact, entries] of bottleneckArtifacts) {
    const uniqueRepos = [...new Set(entries.map(e => e.repo))];
    if (entries.length >= 2) {
      bottleneckPatterns.push({
        pattern: `bottleneck:${artifact}`,
        repos: uniqueRepos,
        nodeIds: entries.map(e => e.nodeId),
        confidence: Math.min(1, entries.length / 5),
      });
    }
  }

  // Velocity outliers: repos significantly above/below average
  const velocityOutliers: PatternReport['velocityOutliers'] = [];
  const allVelocities: { repo: string; velocity: number }[] = [];
  for (const state of states) {
    for (const rs of state.repos) {
      if (rs.metrics && rs.metrics.avgCompletionVelocity > 0) {
        allVelocities.push({ repo: rs.root, velocity: rs.metrics.avgCompletionVelocity });
      }
    }
  }

  if (allVelocities.length >= 2) {
    const avg = allVelocities.reduce((s, v) => s + v.velocity, 0) / allVelocities.length;
    for (const v of allVelocities) {
      const ratio = v.velocity / avg;
      if (ratio < 0.5 || ratio > 2.0) {
        velocityOutliers.push({ repo: v.repo, velocity: v.velocity, avgVelocity: avg });
      }
    }
  }

  return {
    structuralPatterns: structuralPatterns.sort((a, b) => b.confidence - a.confidence),
    bottleneckPatterns: bottleneckPatterns.sort((a, b) => b.confidence - a.confidence),
    velocityOutliers,
    timestamp: new Date().toISOString(),
  };
}
