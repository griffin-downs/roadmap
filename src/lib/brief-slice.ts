// @module brief-slice
// @exports briefSlice, BriefSlice, AncestorContext, SpecContext
// @types BriefSlice, AncestorContext, SpecContext
// @entry roadmap

// Backward cone slice: walks DAG backward from a node,
// reads cached convention contexts, contracts by graph distance.
// Depth 1 = full cached context. Depth 2+ = convention summary only.

import type { Graph, NodeSpec } from '../protocol.ts';
import { consumeArtifact } from '../protocol.ts';
import { node } from '../core/access.ts';
import { readNodeCache, extractFileSummary, type NodeContextCache, type FileSummary } from './brief-cache.ts';

export interface SpecContext {
  /** Full task description from spec (no truncation) */
  description: string;
  /** Ambient files referenced by the node or spec inputs */
  ambient: string[];
}

export interface AncestorContext {
  /** Immediate predecessors: full cached file summaries */
  immediate: NodeContextCache[];
  /** Depth 2+: contracted convention summaries */
  heritage: Array<{
    nodeId: string;
    conventions: NodeContextCache['conventions'];
    depth: number;
  }>;
  /** Merged convention fingerprint from all ancestors */
  merged: {
    importStyle: string | null;
    exportStyle: string | null;
    namingHint: string | null;
  };
}

export interface BriefSlice {
  /** Layer 1: Spec context — why this node exists */
  specContext: SpecContext;
  /** Layer 2: Ancestor context — how predecessors built their part */
  ancestorContext: AncestorContext;
  /** Layer 3: Node contract — what to build */
  nodeContract: {
    produces: string[];
    consumes: string[];
    validate: readonly unknown[];
  };
  /** Layer 4: Produces preview — current state of files this node will create/modify */
  producesPreview: FileSummary[];
  /** Topology metadata */
  topology: {
    depth: number;
    descendantCount: number;
    batchSiblings: string[];
  };
}

/**
 * Walk backward from a node, collecting ancestors by depth.
 * Returns Map<depth, nodeId[]>.
 */
function walkBackwardCone(
  nodeId: string,
  dag: Graph<string>,
  maxDepth: number = 4,
): Map<number, string[]> {
  const layers = new Map<number, string[]>();
  const visited = new Set<string>();
  let frontier = [nodeId];
  let depth = 0;

  while (frontier.length > 0 && depth <= maxDepth) {
    const nextFrontier: string[] = [];
    const layer: string[] = [];

    for (const id of frontier) {
      if (visited.has(id) || id === nodeId) {
        // Still collect deps for the starting node
        if (id === nodeId) {
          visited.add(id);
          const n = node(dag, id);
          if (n) {
            for (const dep of n.deps) {
              if (!visited.has(dep)) nextFrontier.push(dep);
            }
          }
        }
        continue;
      }
      visited.add(id);
      layer.push(id);

      const n = node(dag, id);
      if (n) {
        for (const dep of n.deps) {
          if (!visited.has(dep)) nextFrontier.push(dep);
        }
      }
    }

    if (layer.length > 0) {
      layers.set(depth, layer);
    }

    frontier = nextFrontier;
    depth++;
  }

  return layers;
}

/**
 * Count all nodes reachable forward from this node (descendants).
 */
function countDescendants(nodeId: string, dag: Graph<string>): number {
  const visited = new Set<string>();
  const allNodes = Object.values(dag.nodes) as NodeSpec<string, string>[];

  // Build reverse adjacency: nodeId → nodes that depend on it
  const dependents = new Map<string, string[]>();
  for (const node of allNodes) {
    for (const dep of node.deps) {
      const list = dependents.get(dep) ?? [];
      list.push(node.id);
      dependents.set(dep, list);
    }
  }

  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const child of dependents.get(current) ?? []) {
      if (!visited.has(child)) queue.push(child);
    }
  }

  return visited.size - 1; // exclude self
}

/**
 * Find sibling nodes in the same batch (nodes at the same topological level
 * that share no edges with each other).
 */
function findBatchSiblings(nodeId: string, dag: Graph<string>): string[] {
  // Compute depth of each node via BFS from init
  const depths = new Map<string, number>();
  const queue: Array<[string, number]> = [[dag.init, 0]];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const [id, d] = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const existing = depths.get(id);
    depths.set(id, existing !== undefined ? Math.max(existing, d) : d);

    const allNodes = Object.values(dag.nodes) as NodeSpec<string, string>[];
    for (const node of allNodes) {
      if (node.deps.includes(id) && !visited.has(node.id)) {
        queue.push([node.id, d + 1]);
      }
    }
  }

  const myDepth = depths.get(nodeId);
  if (myDepth === undefined) return [];

  return Array.from(depths.entries())
    .filter(([id, d]) => d === myDepth && id !== nodeId)
    .map(([id]) => id);
}

/**
 * Merge convention fingerprints from multiple ancestors.
 * First non-null value wins (closest ancestor takes precedence).
 */
function mergeConventions(
  caches: Array<{ conventions: NodeContextCache['conventions']; depth: number }>,
): AncestorContext['merged'] {
  // Sort by depth ascending (closest first)
  const sorted = [...caches].sort((a, b) => a.depth - b.depth);

  let importStyle: string | null = null;
  let exportStyle: string | null = null;
  let namingHint: string | null = null;

  for (const c of sorted) {
    if (!importStyle && c.conventions.importStyle) importStyle = c.conventions.importStyle;
    if (!exportStyle && c.conventions.exportStyle) exportStyle = c.conventions.exportStyle;
    if (!namingHint && c.conventions.namingHint) namingHint = c.conventions.namingHint;
  }

  return { importStyle, exportStyle, namingHint };
}

/**
 * Compute the backward cone slice for a node.
 * Assembles three layers: spec context, ancestor context, node contract.
 */
export function briefSlice(
  nodeId: string,
  dag: Graph<string>,
  repoRoot: string,
): BriefSlice {
  const spec = node(dag, nodeId);
  if (!spec) {
    throw new Error(`briefSlice: node not found: ${nodeId}`);
  }

  // Layer 1: Spec context
  const specContext: SpecContext = {
    description: spec.desc,
    ambient: (spec as any).ambient ?? [],
  };

  // Layer 2: Ancestor context via backward cone
  const cone = walkBackwardCone(nodeId, dag);
  const immediate: NodeContextCache[] = [];
  const heritage: AncestorContext['heritage'] = [];
  const allConventions: Array<{ conventions: NodeContextCache['conventions']; depth: number }> = [];

  for (const [depth, nodeIds] of cone.entries()) {
    for (const ancestorId of nodeIds) {
      const cache = readNodeCache(ancestorId, repoRoot);
      if (!cache) continue;

      if (depth === 1) {
        // Immediate predecessors: full context
        immediate.push(cache);
      } else {
        // Depth 2+: convention summary only
        heritage.push({
          nodeId: ancestorId,
          conventions: cache.conventions,
          depth,
        });
      }

      allConventions.push({ conventions: cache.conventions, depth });
    }
  }

  const ancestorContext: AncestorContext = {
    immediate,
    heritage,
    merged: mergeConventions(allConventions),
  };

  // Layer 3: Node contract
  const nodeContract = {
    produces: [...spec.produces],
    consumes: spec.consumes.map((c: any) => consumeArtifact(c)),
    validate: spec.validate,
  };

  // Layer 4: Produces preview — sample existing files the node will create/modify.
  // Critical for init nodes (no ancestors) and modification nodes.
  const producesPreview: FileSummary[] = [];
  for (const produce of spec.produces) {
    const summary = extractFileSummary(produce, repoRoot);
    if (summary) producesPreview.push(summary);
  }

  // Topology metadata
  const topology = {
    depth: Math.max(...Array.from(cone.keys()), 0),
    descendantCount: countDescendants(nodeId, dag),
    batchSiblings: findBatchSiblings(nodeId, dag),
  };

  return { specContext, ancestorContext, nodeContract, producesPreview, topology };
}
