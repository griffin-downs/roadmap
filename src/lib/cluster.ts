// @module cluster
// @exports buildClusters
// @types Cluster, ClusterResult
// @entry roadmap

import type { Graph, NodeSpec } from '../protocol.ts';
import { consumeArtifact, criticalPath } from '../protocol.ts';

export interface Cluster {
  id: string;
  nodes: string[];
  coupling: number;
  critical: boolean;
  context: string[];
}

export interface ClusterResult {
  clusters: Cluster[];
  agentCount: number;
}

interface Flat {
  id: string;
  produces: readonly string[];
  consumes: readonly string[];
}

function flat<T extends string>(g: Graph<T>): Flat[] {
  const nodes = Object.values(g.nodes) as NodeSpec<T>[];
  return nodes.map(n => ({
    id: n.id,
    produces: n.produces,
    consumes: n.consumes.map(consumeArtifact),
  }));
}

function buildCouplingGraph(nodes: Flat[]): Map<string, Map<string, number>> {
  const coupling = new Map<string, Map<string, number>>();

  for (const node of nodes) {
    coupling.set(node.id, new Map());
  }

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];

      const aProducesSet = new Set(a.produces);
      const bProducesSet = new Set(b.produces);
      const aConsumesSet = new Set(a.consumes);
      const bConsumesSet = new Set(b.consumes);

      let abWeight = 0;
      for (const art of aProducesSet) {
        if (bConsumesSet.has(art)) abWeight++;
      }

      let baWeight = 0;
      for (const art of bProducesSet) {
        if (aConsumesSet.has(art)) baWeight++;
      }

      // Symmetric: store both directions so deduplication in clusterCoupling (a < b by position) works correctly.
      if (abWeight > 0) {
        coupling.get(a.id)!.set(b.id, abWeight);
        coupling.get(b.id)!.set(a.id, abWeight);
      }
      if (baWeight > 0) {
        coupling.get(b.id)!.set(a.id, baWeight);
        coupling.get(a.id)!.set(b.id, baWeight);
      }
    }
  }

  return coupling;
}

function findConnectedComponents(
  nodes: Flat[],
  coupling: Map<string, Map<string, number>>,
): Map<string, Set<string>> {
  const parent = new Map<string, string>();

  for (const node of nodes) {
    parent.set(node.id, node.id);
  }

  function find(x: string): string {
    const p = parent.get(x)!;
    if (p !== x) {
      parent.set(x, find(p));
    }
    return parent.get(x)!;
  }

  function union(x: string, y: string): void {
    const px = find(x);
    const py = find(y);
    if (px !== py) {
      parent.set(px, py);
    }
  }

  for (const [nodeId, neighbors] of coupling.entries()) {
    for (const neighborId of neighbors.keys()) {
      union(nodeId, neighborId);
    }
  }

  const components = new Map<string, Set<string>>();
  for (const node of nodes) {
    const root = find(node.id);
    if (!components.has(root)) {
      components.set(root, new Set());
    }
    components.get(root)!.add(node.id);
  }

  return components;
}

function applyMaxSizeConstraint(
  components: Map<string, Set<string>>,
  criticalSet: Set<string>,
  maxSize: number,
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  let clusterId = 0;

  for (const component of components.values()) {
    if (component.size <= maxSize) {
      result.set(`cluster-${clusterId}`, component);
      clusterId++;
      continue;
    }

    const criticalFirst = [...component].sort((a, b) => {
      const aIsCritical = criticalSet.has(a) ? 0 : 1;
      const bIsCritical = criticalSet.has(b) ? 0 : 1;
      if (aIsCritical !== bIsCritical) return aIsCritical - bIsCritical;
      return a.localeCompare(b);
    });

    let current = new Set<string>();
    for (const nodeId of criticalFirst) {
      if (current.size >= maxSize) {
        result.set(`cluster-${clusterId}`, current);
        clusterId++;
        current = new Set();
      }
      current.add(nodeId);
    }

    if (current.size > 0) {
      result.set(`cluster-${clusterId}`, current);
      clusterId++;
    }
  }

  return result;
}

export function buildClusters<T extends string>(
  dag: Graph<T>,
  opts: { maxSize?: number } = {},
): ClusterResult {
  const nodes = flat(dag);
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  const nonStructuralNodes = nodes.filter(n => n.id !== dag.init && n.id !== dag.term);

  if (nonStructuralNodes.length === 0) {
    return { clusters: [], agentCount: 0 };
  }

  const coupling = buildCouplingGraph(nonStructuralNodes);
  const components = findConnectedComponents(nonStructuralNodes, coupling);

  const maxSize = opts.maxSize ?? Infinity;
  let clusterMap = applyMaxSizeConstraint(components, new Set(), maxSize);

  const cPath = criticalPath(dag);
  const criticalSet = new Set(cPath);

  const clusters: Cluster[] = [];

  for (const [, nodeSet] of clusterMap.entries()) {
    const nodeArray = [...nodeSet].sort();
    const clusterId = nodeArray[0];

    let clusterCoupling = 0;
    for (const a of nodeArray) {
      const aNeighbors = coupling.get(a) ?? new Map();
      for (const [b, weight] of aNeighbors.entries()) {
        if (nodeArray.includes(b) && a < b) {
          clusterCoupling += weight;
        }
      }
    }

    const contextSet = new Set<string>();
    for (const nodeId of nodeArray) {
      const node = nodeMap.get(nodeId);
      if (node) {
        for (const art of node.produces) {
          contextSet.add(art);
        }
        for (const art of node.consumes) {
          contextSet.add(art);
        }
      }
    }

    const isCritical = nodeArray.some(id => criticalSet.has(id));

    clusters.push({
      id: clusterId,
      nodes: nodeArray,
      coupling: clusterCoupling,
      critical: isCritical,
      context: [...contextSet].sort(),
    });
  }

  clusters.sort((a, b) => a.id.localeCompare(b.id));

  return {
    clusters,
    agentCount: clusters.length,
  };
}
