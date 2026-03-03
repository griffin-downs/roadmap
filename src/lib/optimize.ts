// @module optimize
// @exports optimize, utilizationRatio, levelReport, bottleneckNodes
// @types OptimizeResult, LevelEntry, BottleneckEntry
// @entry roadmap

import type { Graph, OptimizeResult, LevelEntry, BottleneckEntry } from './protocol/types.ts';
import { define, verify, check, parallelOrder, criticalPath } from './protocol/operations.ts';

/**
 * Hallucinate-validate optimizer: minimize dependencies by checking which edges are removable.
 * For each dep edge, tries removing it and validates with define+check+verify.
 * Tracks which nodes have consumes declared (for enforcement strength).
 * Removes edges greedily in topo order.
 *
 * Complexity: O(E × (V+E)) — one define+check+verify per edge
 */
export function optimize<T extends string>(g: Graph<T>): OptimizeResult {
  const nodes = Object.values(g.nodes);
  const nodeIds = new Set<string>(nodes.map(n => (n as any).id));

  // Count enforcement: nodes with non-empty consumes
  const nodesCovered = nodes.filter(n => (n as any).consumes?.length > 0).length;
  const nodesUncovered = nodes.length - nodesCovered;

  // Collect all dep edges (from → to where to ∈ from.deps)
  const allEdges: Array<{ from: string; to: string }> = [];
  for (const node of nodes) {
    const n = node as any;
    if (!n.deps) continue;
    for (const dep of n.deps) {
      if (nodeIds.has(dep)) {
        allEdges.push({ from: n.id, to: dep });
      }
    }
  }

  const levelsBefore = parallelOrder(g).length;
  const batchesBefore = parallelOrder(g);
  const maxParallelismBefore = Math.max(...batchesBefore.map(b => b.length), 1);
  const utilizationBefore = nodes.length / (levelsBefore * maxParallelismBefore);

  // Try removing each edge independently
  const removable: Array<{ from: string; to: string }> = [];
  for (const edge of allEdges) {
    // Create modified graph without this edge
    const modified = structuredClone(g);
    const fromNode = (modified.nodes as any)[edge.from];
    if (!fromNode || !fromNode.deps) continue;

    const newDeps = fromNode.deps.filter((d: string) => d !== edge.to);
    fromNode.deps = newDeps;

    // Validate
    try {
      define(modified);
      const checkResult = check(modified);
      const verifyResult = verify(modified);

      // Edge is removable if validation passes
      if (checkResult.done && verifyResult.length === 0) {
        removable.push(edge);
      }
    } catch {
      // define() threw → cycle or structural error → edge is required
    }
  }

  // Apply all removable edges at once to get the minimal graph
  let g_min = structuredClone(g);
  for (const edge of removable) {
    const node = (g_min.nodes as any)[edge.from];
    if (node && node.deps) {
      node.deps = node.deps.filter((d: string) => d !== edge.to);
    }
  }

  const levelsAfter = parallelOrder(g_min).length;
  const batchesAfter = parallelOrder(g_min);
  const maxParallelismAfter = Math.max(...batchesAfter.map(b => b.length), 1);
  const utilizationAfter = nodes.length / (levelsAfter * maxParallelismAfter);

  return {
    removable,
    levelsBefore,
    levelsAfter,
    maxParallelismBefore,
    maxParallelismAfter,
    utilizationBefore,
    utilizationAfter,
    enforcement: { nodesCovered, nodesUncovered },
  };
}

/**
 * Compute utilization ratio: nodes / (levels × maxParallelism)
 * Range [0,1], where 1.0 = perfect utilization, 0 = highly sequential
 */
export function utilizationRatio<T extends string>(g: Graph<T>): number {
  const nodes = Object.values(g.nodes);
  const batches = parallelOrder(g);
  const levels = batches.length;
  const maxParallelism = Math.max(...batches.map(b => b.length), 1);
  return nodes.length / (levels * maxParallelism);
}

/**
 * Per-level metrics: which nodes are at each level, width, criticality
 */
export function levelReport<T extends string>(g: Graph<T>): LevelEntry[] {
  const batches = parallelOrder(g);
  const path = new Set(criticalPath(g));

  return batches.map((nodes, level) => ({
    level,
    nodes,
    width: nodes.length,
    onCriticalPath: nodes.some(n => path.has(n)),
  }));
}

/**
 * Identify bottleneck nodes: high fan-in or fan-out
 */
export function bottleneckNodes<T extends string>(g: Graph<T>): BottleneckEntry[] {
  const nodes = Object.values(g.nodes);
  const nodeMap = new Map(nodes.map(n => [(n as any).id, n as any]));
  const batches = parallelOrder(g);

  // Compute node → level
  const nodeLevels = new Map<string, number>();
  batches.forEach((batch, level) => {
    batch.forEach(n => nodeLevels.set(n, level));
  });

  // Compute fan-in and fan-out per node
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();

  for (const node of nodes) {
    const n = node as any;
    fanIn.set(n.id, 0);
    fanOut.set(n.id, n.deps?.length ?? 0);
  }

  // Fan-in: count predecessors that directly depend on me
  for (const node of nodes) {
    const n = node as any;
    for (const dep of n.deps ?? []) {
      fanIn.set(dep, (fanIn.get(dep) ?? 0) + 1);
    }
  }

  // Threshold: nodes with fan-in >= 2 or fan-out >= 2 (significant branching/merging)
  const bottlenecks: BottleneckEntry[] = [];
  for (const node of nodes) {
    const n = node as any;
    const inDegree = fanIn.get(n.id) ?? 0;
    const outDegree = fanOut.get(n.id) ?? 0;
    if (inDegree >= 2 || outDegree >= 2) {
      bottlenecks.push({
        id: n.id,
        level: nodeLevels.get(n.id) ?? -1,
        fanIn: inDegree,
        fanOut: outDegree,
      });
    }
  }

  return bottlenecks.sort((a, b) => (b.fanIn + b.fanOut) - (a.fanIn + a.fanOut));
}
