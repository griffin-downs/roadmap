// @module core/reconcile
// @exports reconcile, merge, mergeCheck, branch, branchWithWitness, analyze, modify, MergeConflict, BranchWitness, ModifyAnalysis
// @types MergeConflict, BranchWitness, ModifyAnalysis
// @entry roadmap

// Pure reconciliation, merge, branch, and modification algebra. Zero IO imports.

import type { Graph, Connection, Gap } from '../lib/protocol/types.ts';
import { consumeArtifact } from '../lib/protocol/types.ts';
import { flat, define, verify, check } from './graph.ts';
import type { Flat } from './graph.ts';

// --- buildGraph: single centralized cast for graph construction ---

function buildGraph<T extends string>(
  id: string, desc: string, init: string, term: string,
  nodes: Record<string, Flat>,
): Graph<T> {
  return { id, desc, init, term, nodes } as Graph<T>;
}

// --- reconcile ---

export function reconcile<T extends string>(
  g: Graph<T>, forward: readonly string[], backward: readonly string[],
): { connections: Connection[]; gaps: Gap[] } {
  const nm = new Map(flat(g).map(n => [n.id, n]));
  const connections: Connection[] = [];
  const gaps: Gap[] = [];

  for (const f of forward) {
    const fn = nm.get(f);
    if (!fn) continue;
    for (const b of backward) {
      const bn = nm.get(b);
      if (!bn) continue;
      const bnArtifacts = bn.consumes.map(consumeArtifact);
      const shared = fn.produces.filter(p => bnArtifacts.includes(p));
      if (shared.length) {
        for (const a of shared) connections.push({ forward: f, backward: b, artifact: a });
      } else {
        const m = bnArtifacts.filter(c => !fn.produces.includes(c));
        if (m.length) gaps.push({ between: [f, b], missing: m });
      }
    }
  }

  return { connections, gaps };
}

// --- Merge/branch witness types ---

export interface MergeConflict {
  type: 'node-id-collision';
  nodeId: string;
  left: unknown;
  right: unknown;
}

export interface BranchWitness {
  fromNode: string;
  includedNodes: string[];
  reachabilityReason: Record<string, string[]>;
}

// --- mergeCheck ---

export function mergeCheck<T1 extends string, T2 extends string>(
  g1: Graph<T1>,
  g2: Graph<T2>,
): MergeConflict[] {
  const ids1 = new Set(Object.keys(g1.nodes));
  const conflicts: MergeConflict[] = [];
  const g1Map = new Map(flat(g1).map(n => [n.id, n]));
  for (const n of flat(g2)) {
    if (ids1.has(n.id)) {
      conflicts.push({
        type: 'node-id-collision',
        nodeId: n.id,
        left: g1Map.get(n.id),
        right: n,
      });
    }
  }
  return conflicts;
}

// --- branchWithWitness ---

export function branchWithWitness<T extends string>(
  g: Graph<T>,
  fromNode: T,
): { graph: Graph<T>; witness: BranchWitness } {
  if (!g || !fromNode) throw new Error('Graph and fromNode required for branchWithWitness');
  if (!(fromNode in g.nodes)) throw new Error(`fromNode "${fromNode}" not in graph`);

  const nodes = flat(g);
  const reachabilityReason: Record<string, string[]> = {};
  const q: Array<{ id: string; path: string[] }> = [{ id: fromNode, path: [fromNode] }];
  const visited = new Set<string>();
  while (q.length) {
    const { id, path } = q.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    reachabilityReason[id] = path;
    const successors = nodes.filter(nd => nd.deps.includes(id)).map(nd => nd.id);
    for (const s of successors) {
      if (!visited.has(s)) q.push({ id: s, path: [...path, s] });
    }
  }

  const includedNodes = [...visited].sort((a, b) => a.localeCompare(b));

  const branchedNodes: Record<string, Flat> = {};
  for (const node of nodes) {
    if (visited.has(node.id)) branchedNodes[node.id] = node;
  }

  const branched = buildGraph<T>(
    `${g.id}:${fromNode}`,
    `Branch of ${g.desc} from ${fromNode}`,
    fromNode, g.term,
    branchedNodes,
  );

  const validated = define(branched);
  const errors = verify(validated);
  if (errors.length) throw new Error(`Branch validation failed: ${errors.join(', ')}`);

  return {
    graph: validated,
    witness: { fromNode, includedNodes, reachabilityReason },
  };
}

// --- merge ---

export function merge<T1 extends string, T2 extends string>(
  g1: Graph<T1>,
  g2: Graph<T2>,
  connections: ReadonlyArray<{ g1Node: string; g2Node: string; artifact: string }>,
  initOverride?: string,
  termOverride?: string,
): Graph<T1 | T2> {
  if (!g1 || !g2) throw new Error('Both g1 and g2 required for merge');

  const conflicts = mergeCheck(g1, g2);
  if (conflicts.length) {
    const ids = conflicts.map(c => c.nodeId).join(', ');
    throw new Error(`Node ID conflicts: ${ids}. Pre-qualify node IDs before merge.`);
  }

  const mergedNodes: Record<string, Flat> = {};
  for (const n of flat(g1)) mergedNodes[n.id] = n;
  for (const n of flat(g2)) mergedNodes[n.id] = n;

  for (const conn of connections) {
    const g2Node = mergedNodes[conn.g2Node];
    if (!g2Node) throw new Error(`Connection g2Node "${conn.g2Node}" not found in g2`);
    if (!g2Node.deps.includes(conn.g1Node)) {
      g2Node.deps = [...g2Node.deps, conn.g1Node];
    }
  }

  const merged = buildGraph<T1 | T2>(
    `${g1.id}+${g2.id}`,
    `${g1.desc} → ${g2.desc}`,
    initOverride || g1.init,
    termOverride || g2.term,
    mergedNodes,
  );

  const validated = define(merged);
  const errors = verify(validated);
  if (errors.length) throw new Error(`Merge validation failed: ${errors.join(', ')}`);

  return validated;
}

// --- branch ---

export function branch<T extends string>(
  g: Graph<T>,
  fromNode: T,
): Graph<T> {
  return branchWithWitness(g, fromNode).graph;
}

// --- analyze ---

export interface ModifyAnalysis {
  dependents: string[];
  orphaned: string[];
  produces: string[];
  safe: boolean;
  reason: string;
}

export function analyze<T extends string>(g: Graph<T>, nodeId: string): ModifyAnalysis {
  const nodes = flat(g);
  const nm = new Map(nodes.map(n => [n.id, n]));
  const target = nm.get(nodeId);

  if (!target) {
    return {
      dependents: [],
      orphaned: [],
      produces: [],
      safe: false,
      reason: `Node "${nodeId}" not found`,
    };
  }

  const dependents = nodes.filter(n => n.deps.includes(nodeId)).map(n => n.id);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  nodeMap.delete(nodeId);

  let orphaned: string[] = [];
  try {
    const reachable = new Set<string>();
    const queue = [g.init];
    reachable.add(g.init);

    while (queue.length) {
      const id = queue.shift()!;
      const node = nodeMap.get(id);
      if (!node) break;

      for (const dep of node.deps) {
        if (!reachable.has(dep) && dep !== nodeId) {
          reachable.add(dep);
          queue.push(dep);
        }
      }
    }

    orphaned = [...nodeMap.keys()]
      .filter(id => !reachable.has(id) && id !== g.term)
      .sort();
  } catch {
    // Analysis failed
  }

  const safe = orphaned.length === 0 && nodeId !== g.init && nodeId !== g.term;
  const reason = safe
    ? `Leaf node with ${dependents.length} dependents (must update their consumes)`
    : orphaned.length > 0
      ? `Deletion orphans: ${orphaned.join(', ')}`
      : `Cannot delete ${nodeId}: critical node (init or term)`;

  return {
    dependents,
    orphaned,
    produces: [...target.produces],
    safe,
    reason,
  };
}

// --- modify ---

export function modify<T extends string>(
  g: Graph<T>,
  nodeId: string,
  action: 'delete' | 'skip',
): Graph<T> | Error {
  if (action === 'skip') {
    return g;
  }

  if (action !== 'delete') {
    return new Error(`Unknown action: ${action}`);
  }

  if (nodeId === g.init || nodeId === g.term) {
    return new Error(`Cannot delete ${nodeId}: cannot modify init or term`);
  }

  const modifiedNodes: Record<string, Flat> = {};
  for (const n of flat(g)) {
    if (n.id === nodeId) continue;
    modifiedNodes[n.id] = { ...n, deps: n.deps.filter(d => d !== nodeId) };
  }

  const modified = buildGraph<T>(
    `${g.id}:modified`,
    `${g.desc} (node "${nodeId}" deleted)`,
    g.init, g.term,
    modifiedNodes,
  );

  try {
    const cycles = flat(modified).filter(n => n.id).map(n => n.id);
    const kahn = [...cycles].sort();

    const defined = define(modified);
    const checkResult = check(defined);
    if (!checkResult.done) {
      return new Error(
        `Deletion breaks connectivity. Orphaned: ${checkResult.orphans?.join(', ') || 'unknown'}`,
      );
    }

    const verifyErrors = verify(defined);
    if (verifyErrors.length) {
      return new Error(`Deletion breaks contracts: ${verifyErrors.join(', ')}`);
    }

    return defined;
  } catch (e) {
    return new Error(`Deletion validation failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
