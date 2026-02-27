// @module cluster
// @exports buildClusters
// @types Cluster, ClusterResult
// @entry roadmap

import type { Graph, NodeSpec } from '../protocol.ts';
import { consumeArtifact, order, criticalPath } from '../protocol.ts';
import { buildClustersSolver } from './cluster-solver.ts';

export interface CrossClusterDep {
  cluster: string;
  via: string[];
}

export interface Cluster {
  id: string;
  nodes: string[];
  internalOrder: string[];
  produces: string[];
  consumes: string[];
  crossClusterDeps: CrossClusterDep[];
  coupling: number;
  critical: boolean;
  context: string[];
}

export interface HubFile {
  path: string;
  consumers: number;
}

export interface ClusterResult {
  clusters: Cluster[];
  clusterCount: number;
  maxParallelClusters: number;
  agentCount: number;
  hubFiles?: HubFile[];
  solver?: 'min-cut' | 'union-find';
  cutWeight?: number;
}

// Union-find

class UnionFind {
  private parent = new Map<string, string>();
  private rank = new Map<string, number>();

  add(x: string): void {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
  }

  find(x: string): string {
    let p = this.parent.get(x)!;
    if (p !== x) {
      p = this.find(p);
      this.parent.set(x, p);
    }
    return p;
  }

  union(x: string, y: string): void {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx === ry) return;
    const rankX = this.rank.get(rx)!;
    const rankY = this.rank.get(ry)!;
    if (rankX < rankY) { this.parent.set(rx, ry); }
    else if (rankX > rankY) { this.parent.set(ry, rx); }
    else { this.parent.set(ry, rx); this.rank.set(rx, rankX + 1); }
  }

  components(): Map<string, Set<string>> {
    const groups = new Map<string, Set<string>>();
    for (const x of this.parent.keys()) {
      const root = this.find(x);
      if (!groups.has(root)) groups.set(root, new Set());
      groups.get(root)!.add(x);
    }
    return groups;
  }
}

// Detect hub files: artifact paths consumed by >= threshold distinct nodes
function detectHubs(
  nodes: Array<{ id: string; consumes: string[] }>,
  threshold: number,
): { hubs: Set<string>; hubFiles: HubFile[] } {
  const counts = new Map<string, Set<string>>();
  for (const n of nodes) {
    for (const art of n.consumes) {
      if (!counts.has(art)) counts.set(art, new Set());
      counts.get(art)!.add(n.id);
    }
  }
  const hubs = new Set<string>();
  const hubFiles: HubFile[] = [];
  for (const [path, consumers] of counts) {
    if (consumers.size >= threshold) {
      hubs.add(path);
      hubFiles.push({ path, consumers: consumers.size });
    }
  }
  hubFiles.sort((a, b) => b.consumers - a.consumers || a.path.localeCompare(b.path));
  return { hubs, hubFiles };
}

// Build bipartite graph: artifact → producer, artifact → consumers
// Union producer and each consumer for artifacts that appear in both.
// Edges through hub files are skipped when excludeHubs is provided.
function bipartiteUnion(
  nodes: Array<{ id: string; produces: readonly string[]; consumes: string[] }>,
  excludeHubs?: Set<string>,
): Map<string, Set<string>> {
  const uf = new UnionFind();
  for (const n of nodes) uf.add(n.id);

  const artifactProducer = new Map<string, string>();
  for (const n of nodes) {
    for (const art of n.produces) {
      artifactProducer.set(art, n.id);
    }
  }

  for (const n of nodes) {
    for (const art of n.consumes) {
      if (excludeHubs?.has(art)) continue;
      const producer = artifactProducer.get(art);
      if (producer && producer !== n.id) {
        uf.union(producer, n.id);
      }
    }
  }

  return uf.components();
}

function splitOversized(
  components: Map<string, Set<string>>,
  maxSize: number,
  topoIndex: Map<string, number>,
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  let idx = 0;

  for (const members of components.values()) {
    if (members.size <= maxSize) {
      result.set(`cluster-${idx++}`, members);
      continue;
    }
    // Split by topo order to preserve data-flow locality
    const sorted = [...members].sort((a, b) => (topoIndex.get(a) ?? 0) - (topoIndex.get(b) ?? 0));
    let current = new Set<string>();
    for (const nodeId of sorted) {
      if (current.size >= maxSize) {
        result.set(`cluster-${idx++}`, current);
        current = new Set();
      }
      current.add(nodeId);
    }
    if (current.size > 0) result.set(`cluster-${idx++}`, current);
  }

  return result;
}

export function buildClusters<T extends string>(
  dag: Graph<T>,
  opts: { maxSize?: number; excludeHubs?: number; useSolver?: boolean } = {},
): ClusterResult {
  if (opts.useSolver) {
    return buildClustersSolver(dag, { maxSize: opts.maxSize });
  }
  const allNodes = Object.values(dag.nodes) as NodeSpec<T>[];
  const nonStructural = allNodes.filter(n => n.id !== dag.init && n.id !== dag.term);

  if (nonStructural.length === 0) {
    return { clusters: [], clusterCount: 0, maxParallelClusters: 0, agentCount: 0 };
  }

  // Flatten — consumes resolved to artifact strings, ambient excluded
  const flat = nonStructural.map(n => ({
    id: n.id as string,
    produces: n.produces,
    consumes: n.consumes.map(consumeArtifact),
    deps: n.deps as readonly string[],
  }));

  // Global topo order for internalOrder computation
  const topoOrder = order(dag as Graph<string>);
  const topoIndex = new Map(topoOrder.map((id, i) => [id, i]));

  // Hub detection and exclusion
  let hubExclude: Set<string> | undefined;
  let detectedHubFiles: HubFile[] | undefined;
  if (opts.excludeHubs !== undefined) {
    const threshold = opts.excludeHubs;
    const { hubs, hubFiles } = detectHubs(flat, threshold);
    hubExclude = hubs.size > 0 ? hubs : undefined;
    detectedHubFiles = hubFiles;
  }

  // Bipartite union-find on produces/consumes artifact edges
  let components = bipartiteUnion(flat, hubExclude);

  // Apply max-size constraint
  const maxSize = opts.maxSize ?? Infinity;
  if (maxSize < Infinity) {
    components = splitOversized(components, maxSize, topoIndex);
  }

  // Node→cluster mapping
  const nodeToCluster = new Map<string, string>();

  // Build artifact producer/consumer indices for cross-cluster deps
  const artifactProducer = new Map<string, string>();
  const flatById = new Map(flat.map(n => [n.id, n]));
  for (const n of flat) {
    for (const art of n.produces) artifactProducer.set(art, n.id);
  }

  const cPath = criticalPath(dag);
  const criticalSet = new Set(cPath);

  // Assign stable cluster IDs (alphabetical first node)
  const componentEntries: Array<{ id: string; members: Set<string> }> = [];
  for (const members of components.values()) {
    const sorted = [...members].sort((a, b) => (topoIndex.get(a) ?? 0) - (topoIndex.get(b) ?? 0));
    componentEntries.push({ id: sorted[0], members });
  }
  componentEntries.sort((a, b) => a.id.localeCompare(b.id));

  for (const entry of componentEntries) {
    for (const nodeId of entry.members) nodeToCluster.set(nodeId, entry.id);
  }

  // Build clusters
  const clusters: Cluster[] = [];

  for (const { id: clusterId, members } of componentEntries) {
    const nodeArray = [...members];
    const internalOrder = nodeArray
      .sort((a, b) => (topoIndex.get(a) ?? 0) - (topoIndex.get(b) ?? 0));

    // Per-cluster produces and consumes
    const clusterProduces = new Set<string>();
    const clusterConsumes = new Set<string>();
    for (const nodeId of nodeArray) {
      const n = flatById.get(nodeId)!;
      for (const art of n.produces) clusterProduces.add(art);
      for (const art of n.consumes) clusterConsumes.add(art);
    }

    // Cross-cluster deps: artifacts consumed from outside this cluster
    const crossDeps = new Map<string, Set<string>>(); // targetClusterId → artifact[]
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

    // Coupling score: count of shared artifact edges within cluster
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

  // maxParallelClusters: width of widest level in cluster dependency graph
  // Build cluster DAG, then Kahn's to find level widths
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
    if (ready.length === 0) break; // cycle guard
    if (ready.length > maxParallel) maxParallel = ready.length;
    for (const id of ready) {
      remaining.delete(id);
      for (const succ of clusterFwd.get(id) ?? []) {
        deg.set(succ, (deg.get(succ) ?? 1) - 1);
      }
    }
  }

  const result: ClusterResult = {
    clusters,
    clusterCount: clusters.length,
    maxParallelClusters: maxParallel,
    agentCount: clusters.length,
  };

  if (detectedHubFiles?.length) {
    result.hubFiles = detectedHubFiles;
  }

  return result;
}
