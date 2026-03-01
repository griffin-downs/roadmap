// @module cluster-algorithm
// @exports AffinityMap, buildAffinityGraph, findAffinityComponents, klBisect, recursiveBisect, resolveCycles

export type AffinityMap = Map<string, Map<string, number>>;

// Build weighted affinity graph from produces/consumes relationships.
// w(A, B) += 1.0 when A produces what B consumes (direct data flow)
// w(A, B) += 0.5 when both A and B consume the same artifact (shared input)
export function buildAffinityGraph(
  nodes: Array<{ id: string; produces: readonly string[]; consumes: string[] }>,
): AffinityMap {
  const affinity: AffinityMap = new Map();
  for (const n of nodes) affinity.set(n.id, new Map());

  function add(a: string, b: string, w: number) {
    if (a === b) return;
    affinity.get(a)!.set(b, (affinity.get(a)!.get(b) ?? 0) + w);
    affinity.get(b)!.set(a, (affinity.get(b)!.get(a) ?? 0) + w);
  }

  // Direct data flow: producer → consumer edges (weight 1.0)
  const producers = new Map<string, string>(); // artifact → nodeId
  for (const n of nodes) {
    for (const art of n.produces) producers.set(art, n.id);
  }
  for (const n of nodes) {
    for (const art of n.consumes) {
      const producer = producers.get(art);
      if (producer && producer !== n.id) add(producer, n.id, 1.0);
    }
  }

  // Shared consumes: co-consumer edges (weight 0.5)
  const consumers = new Map<string, string[]>(); // artifact → [nodeIds]
  for (const n of nodes) {
    for (const art of n.consumes) {
      if (!consumers.has(art)) consumers.set(art, []);
      consumers.get(art)!.push(n.id);
    }
  }
  for (const nodeList of consumers.values()) {
    for (let i = 0; i < nodeList.length; i++) {
      for (let j = i + 1; j < nodeList.length; j++) {
        add(nodeList[i], nodeList[j], 0.5);
      }
    }
  }

  return affinity;
}

// Find connected components in the affinity graph (any non-zero edge = connected).
export function findAffinityComponents(nodeIds: string[], affinity: AffinityMap): string[][] {
  const parent = new Map(nodeIds.map(id => [id, id]));
  function find(x: string): string {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  }
  function union(x: string, y: string) {
    const rx = find(x), ry = find(y);
    if (rx !== ry) parent.set(rx, ry);
  }

  for (const id of nodeIds) {
    const edges = affinity.get(id);
    if (!edges) continue;
    for (const [neighbor, w] of edges) {
      if (w > 0 && parent.has(neighbor)) union(id, neighbor);
    }
  }

  const groups = new Map<string, string[]>();
  for (const id of nodeIds) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(id);
  }
  return [...groups.values()];
}

// Kernighan-Lin bisection: find near-optimal 2-way partition minimizing cut weight.
// Returns [partitionA, partitionB].
export function klBisect(nodeIds: string[], affinity: AffinityMap): [string[], string[]] {
  const n = nodeIds.length;
  if (n <= 1) return [nodeIds, []];
  if (n === 2) return [[nodeIds[0]], [nodeIds[1]]];

  const w = (a: string, b: string): number => affinity.get(a)?.get(b) ?? 0;

  // Initial partition: first half / second half (deterministic)
  const half = Math.floor(n / 2);
  let A = new Set(nodeIds.slice(0, half));
  let B = new Set(nodeIds.slice(half));

  let improved = true;
  while (improved) {
    improved = false;

    // Compute D[v] = external affinity - internal affinity for each node
    const D = new Map<string, number>();
    for (const v of nodeIds) {
      let ext = 0, int_ = 0;
      for (const [u, wvu] of (affinity.get(v) ?? new Map())) {
        if (!A.has(u) && !B.has(u)) continue; // not in current set
        if (A.has(v) === A.has(u)) int_ += wvu;
        else ext += wvu;
      }
      D.set(v, ext - int_);
    }

    // KL pass: find best sequence of swaps
    const locked = new Set<string>();
    const swaps: Array<[string, string, number]> = []; // [a, b, gain]
    const tempD = new Map(D);
    const tempA = new Set(A);
    const tempB = new Set(B);

    const iters = Math.min(tempA.size, tempB.size);
    for (let i = 0; i < iters; i++) {
      let bestGain = -Infinity;
      let bestA = '', bestB = '';

      for (const a of tempA) {
        if (locked.has(a)) continue;
        for (const b of tempB) {
          if (locked.has(b)) continue;
          const gain = tempD.get(a)! + tempD.get(b)! - 2 * w(a, b);
          if (gain > bestGain) { bestGain = gain; bestA = a; bestB = b; }
        }
      }

      if (!bestA) break;
      swaps.push([bestA, bestB, bestGain]);
      locked.add(bestA); locked.add(bestB);

      // Update D values for remaining unlocked nodes after virtual swap (a* ↔ b*)
      for (const u of tempA) {
        if (u === bestA || locked.has(u)) continue;
        tempD.set(u, tempD.get(u)! + 2 * w(u, bestA) - 2 * w(u, bestB));
      }
      for (const u of tempB) {
        if (u === bestB || locked.has(u)) continue;
        tempD.set(u, tempD.get(u)! + 2 * w(u, bestB) - 2 * w(u, bestA));
      }
    }

    // Find the prefix of swaps that maximizes cumulative gain
    let cumGain = 0, maxGain = 0, bestK = -1;
    for (let i = 0; i < swaps.length; i++) {
      cumGain += swaps[i][2];
      if (cumGain > maxGain) { maxGain = cumGain; bestK = i; }
    }

    if (maxGain > 0 && bestK >= 0) {
      // Apply the first bestK+1 swaps to the real partition
      for (let i = 0; i <= bestK; i++) {
        const [a, b] = swaps[i];
        A.delete(a); A.add(b);
        B.delete(b); B.add(a);
      }
      improved = true;
    }
  }

  return [[...A], [...B]];
}

// Recursively bisect a component until all partitions fit within maxSize.
export function recursiveBisect(
  nodeIds: string[],
  affinity: AffinityMap,
  maxSize: number,
  topoIndex: Map<string, number>,
): string[][] {
  if (nodeIds.length === 0) return [];
  if (nodeIds.length <= maxSize) return [nodeIds];

  const [A, B] = klBisect(nodeIds, affinity);
  if (A.length === 0 || B.length === 0) {
    // Can't bisect further — force split by topo order
    const sorted = [...nodeIds].sort((a, b) => (topoIndex.get(a) ?? 0) - (topoIndex.get(b) ?? 0));
    const half = Math.ceil(sorted.length / 2);
    return [sorted.slice(0, half), sorted.slice(half)];
  }

  return [
    ...recursiveBisect(A, affinity, maxSize, topoIndex),
    ...recursiveBisect(B, affinity, maxSize, topoIndex),
  ];
}

// Detect cycles in the cluster dependency graph and merge clusters forming a cycle.
export function resolveCycles(
  clusters: Map<string, Set<string>>,
  nodeToCluster: Map<string, string>,
  flatById: Map<string, { produces: readonly string[]; consumes: string[] }>,
): Map<string, Set<string>> {
  const clusterIds = [...clusters.keys()];

  // Build cluster adjacency (A → B means A depends on B)
  const adj = new Map<string, Set<string>>();
  for (const id of clusterIds) adj.set(id, new Set());

  const artifactProducer = new Map<string, string>();
  for (const [cid, members] of clusters) {
    for (const nodeId of members) {
      const n = flatById.get(nodeId);
      if (!n) continue;
      for (const art of n.produces) artifactProducer.set(art, cid);
    }
  }

  for (const [cid, members] of clusters) {
    for (const nodeId of members) {
      const n = flatById.get(nodeId);
      if (!n) continue;
      for (const art of n.consumes) {
        const producerCluster = artifactProducer.get(art);
        if (producerCluster && producerCluster !== cid) adj.get(cid)!.add(producerCluster);
      }
    }
  }

  // Detect cycles via DFS. Merge all clusters in a SCC.
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const merged = new Map<string, string>(); // old cluster id → canonical id

  function canonical(id: string): string {
    let c = id;
    while (merged.has(c)) c = merged.get(c)!;
    return c;
  }

  function dfs(id: string, stack: string[]): boolean {
    if (inStack.has(id)) {
      // Found a cycle: merge all clusters from the cycle start to current
      const cycleStart = stack.indexOf(id);
      const cycleMembers = stack.slice(cycleStart);
      const root = cycleMembers[0];
      for (let i = 1; i < cycleMembers.length; i++) merged.set(cycleMembers[i], root);
      return true;
    }
    if (visited.has(id)) return false;
    visited.add(id);
    inStack.add(id);
    stack.push(id);
    for (const neighbor of adj.get(id) ?? []) {
      dfs(canonical(neighbor), stack);
    }
    stack.pop();
    inStack.delete(id);
    return false;
  }

  for (const id of clusterIds) dfs(canonical(id), []);

  if (merged.size === 0) return clusters;

  // Rebuild clusters with merges applied
  const result = new Map<string, Set<string>>();
  for (const [cid, members] of clusters) {
    const canon = canonical(cid);
    if (!result.has(canon)) result.set(canon, new Set());
    for (const m of members) result.get(canon)!.add(m);
  }

  // Rebuild nodeToCluster
  for (const [cid, members] of result) {
    for (const nodeId of members) nodeToCluster.set(nodeId, cid);
  }

  return result;
}
