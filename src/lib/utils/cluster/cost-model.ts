// @module cluster-cost-model
// @exports computeCutWeight, buildClustersSolver

import type { Graph } from '../../../protocol.ts';
import { consumeArtifact, order, criticalPath } from '../../../protocol.ts';
import type { Cluster, ClusterResult, CrossClusterDep } from './cluster.ts';
import type { AffinityMap } from './algorithm.ts';
import { buildAffinityGraph, findAffinityComponents, recursiveBisect, resolveCycles } from './algorithm.ts';

// Compute total weight of edges crossing cluster boundaries.
export function computeCutWeight(
  nodeToCluster: Map<string, string>,
  affinity: AffinityMap,
): number {
  let total = 0;
  for (const [a, edges] of affinity) {
    const ca = nodeToCluster.get(a);
    for (const [b, w] of edges) {
      if (a >= b) continue; // count each edge once
      const cb = nodeToCluster.get(b);
      if (ca !== cb) total += w;
    }
  }
  return total;
}

export function buildClustersSolver<T extends string>(
  dag: Graph<T>,
  opts: { maxSize?: number } = {},
): ClusterResult & { solver: 'min-cut'; cutWeight: number } {
  const allNodes = Object.values(dag.nodes) as Array<{ id: string; produces: readonly string[]; consumes: readonly any[]; deps: readonly string[]; ambient?: readonly string[] }>;
  const nonStructural = allNodes.filter(n => n.id !== dag.init && n.id !== dag.term);

  if (nonStructural.length === 0) {
    return { clusters: [], clusterCount: 0, maxParallelClusters: 0, agentCount: 0, solver: 'min-cut', cutWeight: 0 };
  }

  const flat = nonStructural.map(n => ({
    id: n.id,
    produces: n.produces,
    consumes: n.consumes.map(consumeArtifact),
    deps: n.deps,
  }));

  const topoOrder = order(dag as Graph<string>);
  const topoIndex = new Map(topoOrder.map((id, i) => [id, i]));
  const flatById = new Map(flat.map(n => [n.id, n]));

  const affinity = buildAffinityGraph(flat);
  const nodeIds = flat.map(n => n.id);

  // Step 1: find natural connected components in affinity graph
  const naturalComponents = findAffinityComponents(nodeIds, affinity);

  // Step 2: recursively bisect components exceeding maxSize
  const maxSize = opts.maxSize ?? Infinity;
  let partitions: string[][];
  if (maxSize < Infinity) {
    partitions = naturalComponents.flatMap(comp =>
      comp.length > maxSize ? recursiveBisect(comp, affinity, maxSize, topoIndex) : [comp],
    );
  } else {
    partitions = naturalComponents;
  }

  // Step 3: build cluster map, assign stable IDs (topo-first node in cluster)
  const components = new Map<string, Set<string>>();
  for (const partition of partitions) {
    const sorted = [...partition].sort((a, b) => (topoIndex.get(a) ?? 0) - (topoIndex.get(b) ?? 0));
    components.set(sorted[0], new Set(sorted));
  }

  // Step 4: build nodeToCluster map
  const nodeToCluster = new Map<string, string>();
  for (const [cid, members] of components) {
    for (const nodeId of members) nodeToCluster.set(nodeId, cid);
  }

  // Step 5: resolve cycles in cluster dependency graph
  const resolvedComponents = resolveCycles(components, nodeToCluster, flatById as any);

  // Step 6: compute cut weight
  const cutWeight = computeCutWeight(nodeToCluster, affinity);

  // Step 7: compute critical path
  const cPath = criticalPath(dag);
  const criticalSet = new Set(cPath);

  // Step 8: build artifact producer index for cross-cluster deps
  const artifactProducer = new Map<string, string>(); // artifact → nodeId
  for (const n of flat) {
    for (const art of n.produces) artifactProducer.set(art, n.id);
  }

  // Step 9: sort entries deterministically
  const componentEntries: Array<{ id: string; members: Set<string> }> = [];
  for (const [id, members] of resolvedComponents) {
    const sorted = [...members].sort((a, b) => (topoIndex.get(a) ?? 0) - (topoIndex.get(b) ?? 0));
    componentEntries.push({ id: sorted[0], members }); // re-assign stable id after merges
  }
  componentEntries.sort((a, b) => a.id.localeCompare(b.id));

  // Rebuild nodeToCluster with final stable IDs
  for (const entry of componentEntries) {
    for (const nodeId of entry.members) nodeToCluster.set(nodeId, entry.id);
  }

  // Step 10: build Cluster objects
  const clusters: Cluster[] = [];

  for (const { id: clusterId, members } of componentEntries) {
    const nodeArray = [...members].sort((a, b) => (topoIndex.get(a) ?? 0) - (topoIndex.get(b) ?? 0));
    const internalOrder = [...nodeArray];

    const clusterProduces = new Set<string>();
    const clusterConsumes = new Set<string>();
    for (const nodeId of nodeArray) {
      const n = flatById.get(nodeId)!;
      for (const art of n.produces) clusterProduces.add(art);
      for (const art of n.consumes) clusterConsumes.add(art);
    }

    const crossDeps = new Map<string, Set<string>>();
    for (const nodeId of nodeArray) {
      const n = flatById.get(nodeId)!;
      for (const art of n.consumes) {
        const producer = artifactProducer.get(art);
        if (!producer) continue;
        const producerCluster = nodeToCluster.get(producer);
        if (!producerCluster || producerCluster === clusterId) continue;
        if (!crossDeps.has(producerCluster)) crossDeps.set(producerCluster, new Set());
        crossDeps.get(producerCluster)!.add(art);
      }
    }

    const crossClusterDeps: CrossClusterDep[] = [...crossDeps.entries()]
      .map(([cluster, arts]) => ({ cluster, via: [...arts].sort() }))
      .sort((a, b) => a.cluster.localeCompare(b.cluster));

    let coupling = 0;
    const producesSet = new Set<string>();
    for (const nodeId of nodeArray) {
      const n = flatById.get(nodeId)!;
      for (const art of n.produces) producesSet.add(art);
    }
    for (const nodeId of nodeArray) {
      const n = flatById.get(nodeId)!;
      for (const art of n.consumes) {
        if (producesSet.has(art)) coupling++;
      }
    }

    const isCritical = nodeArray.some(id => criticalSet.has(id));
    const context = [...new Set([...clusterProduces, ...clusterConsumes])].sort();

    clusters.push({
      id: clusterId,
      nodes: [...internalOrder],
      internalOrder: [...internalOrder],
      produces: [...clusterProduces].sort(),
      consumes: [...clusterConsumes].sort(),
      crossClusterDeps,
      coupling,
      critical: isCritical,
      context,
    });
  }

  // Step 11: compute maxParallelClusters via Kahn's level BFS on cluster DAG
  const clusterIds = clusters.map(c => c.id);
  const clusterInDeg = new Map<string, number>(clusterIds.map(id => [id, 0]));
  const clusterFwd = new Map<string, string[]>(clusterIds.map(id => [id, []]));

  for (const c of clusters) {
    for (const dep of c.crossClusterDeps) {
      clusterInDeg.set(c.id, (clusterInDeg.get(c.id) ?? 0) + 1);
      clusterFwd.get(dep.cluster)?.push(c.id);
    }
  }

  let maxParallel = 0;
  const remaining = new Set(clusterIds);
  const deg = new Map(clusterInDeg);

  while (remaining.size > 0) {
    const ready = [...remaining].filter(id => deg.get(id) === 0);
    if (ready.length === 0) break;
    if (ready.length > maxParallel) maxParallel = ready.length;
    for (const id of ready) {
      remaining.delete(id);
      for (const succ of clusterFwd.get(id) ?? []) {
        deg.set(succ, (deg.get(succ) ?? 1) - 1);
      }
    }
  }

  return {
    clusters,
    clusterCount: clusters.length,
    maxParallelClusters: maxParallel,
    agentCount: clusters.length,
    solver: 'min-cut',
    cutWeight,
  };
}
