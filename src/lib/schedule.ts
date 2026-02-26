// @module schedule
// @exports buildSchedule
// @types SpawnWave, ScheduleResult
// @entry roadmap

// Computes cluster spawn order from critical path + inter-cluster dependencies.
// Wave 0 = clusters with no inter-cluster dependencies.
// Wave N = clusters depending only on waves 0..N-1.
// Within each wave, critical clusters listed first.

import type { Graph } from '../protocol.ts';
import { criticalPath } from '../protocol.ts';
import type { ClusterResult } from './cluster.ts';

export interface SpawnWave {
  wave: number;
  spawn: string[];   // cluster IDs, critical-first within wave
  reason: string;
}

export interface ScheduleResult {
  waves: SpawnWave[];
  pipelineDepth: number;    // total wave count
  maxConcurrency: number;   // max clusters in a single wave
  criticalPath: string[];   // cluster IDs that contain critical-path nodes, in order
}

export function buildSchedule<T extends string>(
  dag: Graph<T>,
  clusters: ClusterResult,
): ScheduleResult {
  const { clusters: cs } = clusters;
  const critNodes = new Set(criticalPath(dag));

  // Map cluster id → Cluster
  const byId = new Map(cs.map(c => [c.id, c]));

  // Build inter-cluster dependency graph:
  // cluster B depends on cluster A if any node in B consumes an artifact produced by a node in A.
  const nodeToCluster = new Map<string, string>();
  for (const c of cs) {
    for (const n of c.nodes) nodeToCluster.set(n, c.id);
  }

  // Collect all produces per node from the DAG
  const nodeProduces = new Map<string, Set<string>>();
  const nodeConsumes = new Map<string, Set<string>>();
  for (const node of Object.values(dag.nodes) as any[]) {
    nodeProduces.set(node.id, new Set(node.produces ?? []));
    nodeConsumes.set(node.id, new Set(node.consumes ?? []));
  }

  // For each cluster, compute which clusters it depends on
  const clusterDeps = new Map<string, Set<string>>();
  for (const c of cs) {
    clusterDeps.set(c.id, new Set());
  }

  for (const c of cs) {
    for (const nodeId of c.nodes) {
      const consumes = nodeConsumes.get(nodeId) ?? new Set();
      for (const artifact of consumes) {
        // Find which node produces this artifact
        for (const other of cs) {
          if (other.id === c.id) continue;
          for (const otherNode of other.nodes) {
            if (nodeProduces.get(otherNode)?.has(artifact)) {
              clusterDeps.get(c.id)!.add(other.id);
            }
          }
        }
      }
    }
  }

  // Wave assignment: Kahn's algorithm on cluster graph
  const inDeg = new Map<string, number>(cs.map(c => [c.id, clusterDeps.get(c.id)!.size]));
  const waves: SpawnWave[] = [];

  let remaining = new Set(cs.map(c => c.id));
  let waveNum = 0;

  while (remaining.size > 0) {
    const ready = [...remaining].filter(id => inDeg.get(id) === 0);
    if (ready.length === 0) break; // cycle guard — shouldn't happen with valid DAG

    // Critical clusters first within each wave
    ready.sort((a, b) => {
      const ac = byId.get(a)!.critical ? 0 : 1;
      const bc = byId.get(b)!.critical ? 0 : 1;
      return ac - bc || a.localeCompare(b);
    });

    const deps = ready.flatMap(id => [...(clusterDeps.get(id) ?? [])]);
    const uniqueDeps = [...new Set(deps)];
    const reason = uniqueDeps.length === 0
      ? 'no inter-cluster dependencies'
      : `depends on: ${uniqueDeps.join(', ')}`;

    waves.push({ wave: waveNum, spawn: ready, reason });

    for (const id of ready) {
      remaining.delete(id);
      // Decrement in-degree for successors
      for (const other of remaining) {
        if (clusterDeps.get(other)?.has(id)) {
          inDeg.set(other, inDeg.get(other)! - 1);
        }
      }
    }
    waveNum++;
  }

  // Critical path at cluster level: ordered subset of clusters that contain critical nodes
  const critClusterIds = cs
    .filter(c => c.critical)
    .map(c => c.id);

  // Order critical clusters by their wave (same order they'd execute)
  const clusterWave = new Map<string, number>();
  for (const w of waves) {
    for (const id of w.spawn) clusterWave.set(id, w.wave);
  }
  critClusterIds.sort((a, b) => (clusterWave.get(a) ?? 0) - (clusterWave.get(b) ?? 0));

  return {
    waves,
    pipelineDepth: waves.length,
    maxConcurrency: Math.max(...waves.map(w => w.spawn.length), 0),
    criticalPath: critClusterIds,
  };
}
