// @module protocol/operations
// @exports define, verify, check, reconcile, order, parallelOrder, batchConflicts, orient, advanceBatch, readyNodes, nextBatch, criticalPath, mergeCheck, branchWithWitness, merge, branch, analyze, modify, modifyAndCommit
// @types LoopSignal, PlanReceipt, Orientation, ReadyNode, NextBatch, BatchConflict, MergeConflict, BranchWitness, ModifyAnalysis, ModificationRecord

import type {
  Graph, NodeSpec, ConsumeSpec, Connection, Gap, IntentDiagnosis,
  ValidationCheck, ValidationResult, IntentFailure, IntentJudgment,
} from './types.ts';
import { consumeArtifact, consumeResolvedBy } from './types.ts';
import { CompletionStore } from '../../runtime/completion.ts';

// --- Internal: flat iteration over mapped type ---

type Flat = { id: string; produces: readonly string[]; consumes: readonly string[]; deps: readonly string[]; mode?: 'execute' | 'plan'; expandedFrom?: string; loopTarget?: string; convergenceCheck?: { maxCoverageDelta?: number; requireEmptyProposals?: boolean; minWallClockDeltaMs?: number }; ambient?: readonly string[]; track?: number; affects?: readonly string[] };

function flat<T extends string>(g: Graph<T>): Flat[] {
  return Object.values(g.nodes) as Flat[];
}

function fwd(nodes: Flat[]): Map<string, string[]> {
  const m = new Map(nodes.map(n => [n.id, [] as string[]]));
  for (const n of nodes) for (const d of n.deps) m.get(d)?.push(n.id);
  return m;
}

// --- Cycle detection (Kahn's). Returns nodes in cycle, empty if acyclic. ---

function detectCycles(nodes: Flat[]): string[] {
  const valid = new Set(nodes.map(n => n.id));
  const a = fwd(nodes);
  const deg = new Map(nodes.map(n => [n.id, n.deps.filter(d => valid.has(d)).length]));
  const q = [...deg].filter(([, d]) => d === 0).map(([id]) => id);
  let v = 0;
  while (q.length) {
    const n = q.shift()!;
    v++;
    for (const s of a.get(n) ?? []) {
      const d = deg.get(s)! - 1;
      deg.set(s, d);
      if (d === 0) q.push(s);
    }
  }
  return v < nodes.length ? [...deg].filter(([, d]) => d > 0).map(([id]) => id) : [];
}

// --- BFS reachability ---

function reach(nodes: Flat[], from: string, to: string): boolean {
  if (from === to) return true;
  const a = fwd(nodes);
  const seen = new Set<string>();
  const q = [from];
  while (q.length) {
    const n = q.shift()!;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const s of a.get(n) ?? []) {
      if (s === to) return true;
      q.push(s);
    }
  }
  return false;
}

// --- define: validate structure ---
// Throws on: cycle, missing init/term. Does NOT check consumes (use verify() for that).

const CONVERGENCE_CHECK_KEYS = new Set(['maxCoverageDelta', 'requireEmptyProposals', 'minWallClockDeltaMs']);

export function define<T extends string>(g: Graph<T>): Graph<T> {
  const nodes = flat(g);
  const ids = new Set(nodes.map(n => n.id));

  if (!ids.has(g.init)) throw new Error(`init "${g.init}" not in nodes`);
  if (!ids.has(g.term)) throw new Error(`term "${g.term}" not in nodes`);
  if (g.init === g.term) throw new Error(`init and term cannot be the same node`);

  const c = detectCycles(nodes);
  if (c.length) throw new Error(`Cycle in "${g.id}": ${c.join(', ')}`);

  // Validate convergenceCheck keys — unknown keys are silently wrong, catch them early.
  for (const n of nodes) {
    if (!n.convergenceCheck) continue;
    const unknown = Object.keys(n.convergenceCheck).filter(k => !CONVERGENCE_CHECK_KEYS.has(k));
    if (unknown.length) throw new Error(`Node "${n.id}" convergenceCheck has unknown keys: ${unknown.join(', ')} — valid keys: ${[...CONVERGENCE_CHECK_KEYS].join(', ')}`);
  }

  // Validate track/affects
  for (const n of nodes) {
    const spec = n as unknown as { track?: unknown; affects?: unknown };
    if (spec.track !== undefined) {
      if (typeof spec.track !== 'number' || !Number.isInteger(spec.track) || spec.track < 0) {
        throw new Error(`Node "${n.id}" track must be a non-negative integer, got: ${spec.track}`);
      }
    }
    if (spec.affects !== undefined) {
      if (!Array.isArray(spec.affects)) {
        throw new Error(`Node "${n.id}" affects must be an array`);
      }
      for (const a of spec.affects) {
        if (typeof a !== 'string' || a.length === 0) {
          throw new Error(`Node "${n.id}" affects entries must be non-empty strings`);
        }
      }
    }
  }

  return g;
}

// --- verify: validate contracts ---
// Returns unsatisfied consumes. Empty = all contracts satisfied.

export function verify<T extends string>(g: Graph<T>): string[] {
  const nodes = flat(g);
  const ids = new Set(nodes.map(n => n.id));
  const nm = new Map(nodes.map(n => [n.id, n]));
  const errors: string[] = [];

  for (const node of nodes) {
    if (!node.consumes.length) continue;
    const preds = new Set<string>();
    const q = [...node.deps.filter(d => ids.has(d))];
    while (q.length) {
      const p = q.shift()!;
      if (preds.has(p)) continue;
      preds.add(p);
      for (const d of nm.get(p)?.deps ?? []) if (ids.has(d)) q.push(d);
    }
    const available = new Set([...preds].flatMap(p => nm.get(p)?.produces ?? []));
    for (const c of node.consumes) {
      const artifact = consumeArtifact(c);
      const resolver = consumeResolvedBy(c);
      if (available.has(artifact)) continue;
      // Acknowledged pending: suppress warning if resolver node exists in the DAG
      if (resolver && ids.has(resolver)) continue;
      errors.push(`"${node.id}" consumes "${artifact}" — no predecessor produces it`);
    }
  }

  return errors;
}

// --- check: termination ---
// Every node reachable from init AND can reach term.

export function check<T extends string>(g: Graph<T>): { done: boolean; orphans: string[] } {
  const nodes = flat(g);
  const ids = new Set(nodes.map(n => n.id));
  const orphans: string[] = [];

  // Init must reach term.
  if (!reach(nodes, g.init, g.term)) orphans.push(`${g.term}: unreachable from ${g.init}`);

  for (const n of nodes) {
    if (n.id === g.init || n.id === g.term) continue;
    if (!reach(nodes, g.init, n.id)) orphans.push(`${n.id}: unreachable from ${g.init}`);
    else if (!reach(nodes, n.id, g.term)) orphans.push(`${n.id}: cannot reach ${g.term}`);

    // loopTarget must reference an existing node — a typo produces a silent dead loop.
    if (n.loopTarget && !ids.has(n.loopTarget)) {
      orphans.push(`${n.id}: loopTarget "${n.loopTarget}" does not exist in this graph`);
    }
  }
  // Check term node loopTarget too.
  const termNode = nodes.find(n => n.id === g.term);
  if (termNode?.loopTarget && !ids.has(termNode.loopTarget)) {
    orphans.push(`${g.term}: loopTarget "${termNode.loopTarget}" does not exist in this graph`);
  }
  return { done: orphans.length === 0, orphans };
}

// --- reconcile: find where forward.produces meets backward.consumes ---

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

// --- order: topological sort ---

// Default comparator: lexicographic by node id (FR-DET-001)
const lexCmp = (a: string, b: string) => a.localeCompare(b);

export function order<T extends string>(g: Graph<T>, cmp: (a: string, b: string) => number = lexCmp): string[] {
  const nodes = flat(g);
  const valid = new Set(nodes.map(n => n.id));
  const a = fwd(nodes);
  const deg = new Map(nodes.map(n => [n.id, n.deps.filter(d => valid.has(d)).length]));
  const q = [...deg].filter(([, d]) => d === 0).map(([id]) => id).sort(cmp);
  const out: string[] = [];
  while (q.length) {
    q.sort(cmp);
    const n = q.shift()!;
    out.push(n);
    for (const s of a.get(n) ?? []) {
      const d = deg.get(s)! - 1;
      deg.set(s, d);
      if (d === 0) q.push(s);
    }
  }
  if (out.length < nodes.length) throw new Error('Cycle detected');
  return out;
}

// --- parallelOrder: batched topological sort ---
// Groups mutually independent nodes into concurrent execution batches.
// Each batch can run in parallel; batches execute sequentially.

export function parallelOrder<T extends string>(g: Graph<T>, cmp: (a: string, b: string) => number = lexCmp): string[][] {
  const nodes = flat(g);
  const valid = new Set(nodes.map(n => n.id));
  const a = fwd(nodes);
  const deg = new Map(nodes.map(n => [n.id, n.deps.filter(d => valid.has(d)).length]));
  const batches: string[][] = [];

  let ready = [...deg].filter(([, d]) => d === 0).map(([id]) => id);
  while (ready.length) {
    // Sort within batch by comparator policy (FR-DET-001)
    batches.push(ready.sort(cmp));
    const next: string[] = [];
    for (const n of ready) {
      for (const s of a.get(n) ?? []) {
        const d = deg.get(s)! - 1;
        deg.set(s, d);
        if (d === 0) next.push(s);
      }
    }
    ready = next;
  }

  const visited = batches.flat().length;
  if (visited < nodes.length) throw new Error('Cycle detected');
  return batches;
}

// --- batchConflicts: detect resource conflicts within parallel batches ---
// Two nodes in the same batch that write the same file will clobber each other
// if assigned to different agents. This finds those conflicts.

export interface BatchConflict {
  level: number;
  file: string;
  writers: string[];     // produces overlap: multiple nodes write same file
  type: 'produces-overlap' | 'consumes-produces-race';
}

export function batchConflicts<T extends string>(g: Graph<T>): BatchConflict[] {
  const batches = parallelOrder(g);
  const nodes = flat(g);
  const nm = new Map(nodes.map(n => [n.id, n]));
  const conflicts: BatchConflict[] = [];

  for (let level = 0; level < batches.length; level++) {
    const batch = batches[level];
    if (batch.length < 2) continue;

    // Produces overlap: two nodes write the same file
    const writers = new Map<string, string[]>();
    for (const id of batch) {
      const produces = nm.get(id)!.produces ?? [];
      if (!Array.isArray(produces)) continue;
      for (const p of produces) {
        const w = writers.get(p) ?? [];
        w.push(id);
        writers.set(p, w);
      }
    }
    for (const [file, w] of writers) {
      if (w.length > 1) conflicts.push({ level, file, writers: w, type: 'produces-overlap' });
    }

    // Consumes-produces race: node A consumes what node B in same batch produces
    const producedInBatch = new Map<string, string>();
    for (const id of batch) {
      const produces = nm.get(id)!.produces ?? [];
      if (!Array.isArray(produces)) continue;
      for (const p of produces) producedInBatch.set(p, id);
    }
    for (const id of batch) {
      const consumes = nm.get(id)!.consumes ?? [];
      if (!Array.isArray(consumes)) continue;
      for (const c of consumes.map(consumeArtifact)) {
        const producer = producedInBatch.get(c);
        if (producer && producer !== id) {
          conflicts.push({ level, file: c, writers: [producer, id], type: 'consumes-produces-race' });
        }
      }
    }
  }

  return conflicts;
}

// --- orient: agent reorientation ---
// Given a graph and a filesystem probe, returns current batch position, what's done,
// what to produce, what's available to consume, and what remains.
// Position is a batch (array of nodes), not a single node.

export interface LoopSignal {
  target: string;             // re-entry node ID
  convergenceCheck?: { maxCoverageDelta?: number; requireEmptyProposals?: boolean };
}

export interface PlanReceipt {
  nodeId: string;
  mode: 'plan';
  preGateActive: boolean;
  expandedChildren: string[];
}

export interface Orientation {
  position: string[];         // batch: array of nodes that can run in parallel
  level: number;              // batch index (0-based)
  batchRemaining: string[];   // nodes in current batch that aren't done
  batchComplete: boolean;     // all nodes in current batch validated + artifacts exist
  preGate: string[];          // plan nodes workable before deps close (investigation can start)
  done: string[];
  produces: readonly string[];
  consumes: readonly string[];
  remaining: string[];
  loop?: LoopSignal;          // present if a position node has loopTarget (soft loop)
  planReceipts?: PlanReceipt[];  // plan nodes in current batch — allows orchestrators to distinguish plan vs execute (FR-ORIENT-001)
  intentPolicyActive?: boolean;  // true when kernel.json intentPolicy is enforcing advancement gates
}

export function orient<T extends string>(
  g: Graph<T>,
  completion: CompletionStore,
  retired?: ReadonlySet<string>,
): Orientation {
  const batches = parallelOrder(g);
  const nodes = flat(g);
  const nm = new Map(nodes.map(n => [n.id, n]));
  const done: string[] = [];

  // Build expansion index: plan node → children that were expanded from it
  const expansionChildren = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.expandedFrom) {
      const children = expansionChildren.get(n.expandedFrom) ?? [];
      children.push(n.id);
      expansionChildren.set(n.expandedFrom, children);
    }
  }

  for (const batch of batches) {
    const batchIncomplete = batch.filter(id => {
      if (retired?.has(id)) return false;
      const node = nm.get(id)!;
      // Plan node: receipt or expansion children
      if (node.mode === 'plan') {
        if (completion.hasPassing(id)) return false;
        const children = expansionChildren.get(id) ?? [];
        return children.length === 0;
      }
      // Receipt-only: node is done iff it has a passing receipt
      return !completion.hasPassing(id);
    });

    if (batchIncomplete.length > 0) {
      // This is the first incomplete batch
      const batchDone = batch.filter(id => !batchIncomplete.includes(id));
      const remainingBatches = batches.slice(batches.indexOf(batch) + 1).flat();
      const batchProduces = batch.flatMap(id => nm.get(id)!.produces);
      const batchConsumes = batch.flatMap(id => nm.get(id)!.consumes.map(consumeArtifact));
      const doneSet = new Set([...done, ...batchDone]);

      // Pre-gate: plan nodes in future batches workable before deps close.
      // A plan node is pre-gate workable iff:
      //   1. mode === 'plan'
      //   2. Not already done or in current batch
      //   3. None of its direct deps that are also plan nodes are uncompleted
      //      (execute deps don't matter — code doesn't affect research direction)
      const preGate: string[] = [];
      for (const id of remainingBatches) {
        const node = nm.get(id)!;
        if (node.mode !== 'plan') continue;
        if (retired?.has(id)) continue;
        // Check plan-dep filter: all plan-mode deps must be done
        const planDepsBlocking = node.deps.some(depId => {
          const dep = nm.get(depId as string);
          return dep?.mode === 'plan' && !doneSet.has(depId as string);
        });
        if (!planDepsBlocking) preGate.push(id);
      }

      // Detect loop signals in current batch
      const loopNode = batch.map(id => nm.get(id)!).find(n => n.loopTarget);
      const loop = loopNode ? { target: loopNode.loopTarget!, ...(loopNode.convergenceCheck ? { convergenceCheck: loopNode.convergenceCheck } : {}) } : undefined;

      // Plan receipts: plan-mode nodes in current batch (FR-ORIENT-001)
      const planReceiptsArr: PlanReceipt[] = batch
        .map(id => nm.get(id)!)
        .filter(n => n.mode === 'plan')
        .map(n => ({
          nodeId: n.id,
          mode: 'plan' as const,
          preGateActive: preGate.includes(n.id),
          expandedChildren: expansionChildren.get(n.id) ?? [],
        }));

      return {
        position: batch,
        level: batches.indexOf(batch),
        batchRemaining: batchIncomplete,
        batchComplete: false,
        preGate,
        done: [...done, ...batchDone],
        produces: batchProduces,
        consumes: batchConsumes,
        remaining: remainingBatches,
        ...(loop ? { loop } : {}),
        ...(planReceiptsArr.length > 0 ? { planReceipts: planReceiptsArr } : {}),
      };
    }

    // All nodes in this batch are done
    done.push(...batch);
  }

  // All batches complete — DAG is done.
  const termNode = nm.get(g.term);
  const termLoop = termNode?.loopTarget
    ? { target: termNode.loopTarget, ...(termNode.convergenceCheck ? { convergenceCheck: termNode.convergenceCheck } : {}) }
    : undefined;

  return {
    position: [],
    level: batches.length,
    batchRemaining: [],
    batchComplete: true,
    preGate: [],
    done,
    produces: [],
    consumes: [],
    remaining: [],
    ...(termLoop ? { loop: termLoop } : {}),
  };
}

// --- advanceBatch: move from current batch to next ---
// Validates that current batch is complete (all receipts present),
// then returns orientation for the next batch.

export function advanceBatch<T extends string>(
  g: Graph<T>,
  completion: CompletionStore,
  retired?: ReadonlySet<string>,
): Orientation {
  const current = orient(g, completion, retired);

  if (!current.batchComplete) {
    throw new Error(
      `Cannot advance: batch not complete. Remaining nodes: ${current.batchRemaining.join(', ')}`
    );
  }

  return orient(g, completion, retired);
}

// --- readyNodes: eager dispatch beyond current batch ---
// Returns nodes from future batches whose deps are fully satisfied,
// even though their batch hasn't opened yet. Read-only query —
// does not advance or mutate batch state.

export interface ReadyNode {
  id: string;
  level: number;              // batch index this node belongs to
  produces: readonly string[];
  consumes: string[];
  mode: 'execute' | 'plan';
}

export function readyNodes<T extends string>(
  g: Graph<T>,
  completion: CompletionStore,
  retired?: ReadonlySet<string>,
): ReadyNode[] {
  const batches = parallelOrder(g);
  const nodes = flat(g);
  const nm = new Map(nodes.map(n => [n.id, n]));

  // Build expansion index for plan nodes
  const expansionChildren = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.expandedFrom) {
      const children = expansionChildren.get(n.expandedFrom) ?? [];
      children.push(n.id);
      expansionChildren.set(n.expandedFrom, children);
    }
  }

  // Compute done set — receipt-only, same as orient()
  const done = new Set<string>();
  for (const n of nodes) {
    if (retired?.has(n.id)) { done.add(n.id); continue; }
    if (n.mode === 'plan') {
      if (completion.hasPassing(n.id)) { done.add(n.id); continue; }
      if ((expansionChildren.get(n.id) ?? []).length > 0) done.add(n.id);
    } else if (completion.hasPassing(n.id)) {
      done.add(n.id);
    }
  }

  // Find current batch level (first incomplete)
  let currentLevel = -1;
  for (let i = 0; i < batches.length; i++) {
    if (batches[i].some(id => !done.has(id))) {
      currentLevel = i;
      break;
    }
  }

  // All done — nothing to dispatch
  if (currentLevel === -1) return [];

  // Scan future batches for nodes whose deps are all in done set.
  // allDepsDone subsumes the plan-dep filter (plan deps are deps),
  // so plan nodes with unfinished plan-mode deps are excluded automatically.
  const ready: ReadyNode[] = [];
  for (let level = currentLevel + 1; level < batches.length; level++) {
    for (const id of batches[level]) {
      if (done.has(id)) continue;
      if (retired?.has(id)) continue;

      const node = nm.get(id)!;
      if (!node.deps.every(d => done.has(d as string))) continue;

      ready.push({
        id,
        level,
        produces: node.produces,
        consumes: node.consumes.map(c => consumeArtifact(c as ConsumeSpec)),
        mode: (node.mode ?? 'execute') as 'execute' | 'plan',
      });
    }
  }

  return ready;
}

// --- nextBatch: lookahead for orchestrator pre-warming ---
// Returns the batch after the current one, with pre-checked conflicts.
// Always returns the next batch regardless of current batch completeness —
// the orchestrator decides whether to act.

export interface NextBatch {
  nodes: string[];
  level: number;
  produces: string[];     // union of all next-batch produces
  conflicts: string[];    // files with batchConflicts in the next batch
}

export function nextBatch<T extends string>(
  g: Graph<T>,
  completion: CompletionStore,
  retired?: ReadonlySet<string>,
): NextBatch | null {
  const batches = parallelOrder(g);
  const current = orient(g, completion, retired);
  const nextLevel = current.level + 1;

  if (nextLevel >= batches.length) return null;

  const batch = batches[nextLevel];
  const nodes = flat(g);
  const nm = new Map(nodes.map(n => [n.id, n]));
  const produces = batch.flatMap(id => [...nm.get(id)!.produces]);

  // Filter batchConflicts to next batch level only
  const allConflicts = batchConflicts(g);
  const conflicts = allConflicts
    .filter(c => c.level === nextLevel)
    .map(c => c.file);

  return { nodes: batch, level: nextLevel, produces, conflicts };
}

// --- criticalPath: longest path from init to term ---
// Standard DAG longest-path via reverse topo sort. O(V+E).
// Weight = 1 per node (node count). Returns the path as ordered node IDs.

export function criticalPath<T extends string>(g: Graph<T>): string[] {
  const nodes = flat(g);
  const adj = fwd(nodes);
  const order_ = order(g);

  // dist[node] = longest path from init to node (inclusive)
  const dist = new Map<string, number>();
  const pred = new Map<string, string | null>();

  for (const id of order_) {
    dist.set(id, 1);
    pred.set(id, null);
  }

  // Forward pass in topo order — O(V+E) via adjacency list
  for (const id of order_) {
    const d = dist.get(id)!;
    for (const succ of adj.get(id) ?? []) {
      const candidate = d + 1;
      if (candidate > dist.get(succ)!) {
        dist.set(succ, candidate);
        pred.set(succ, id);
      }
    }
  }

  // Trace back from term
  const path: string[] = [];
  let cur: string | null = g.term;
  while (cur !== null) {
    path.unshift(cur);
    cur = pred.get(cur) ?? null;
  }

  return path;
}

// --- Merge/branch witness types (FR-MERGE-001, FR-BRANCH-001) ---

/** Collision detected when two graphs share a node ID during merge. */
export interface MergeConflict {
  type: 'node-id-collision';
  nodeId: string;
  left: unknown;   // NodeSpec from g1
  right: unknown;  // NodeSpec from g2
}

/** Records which nodes were included in a branch and why (reachable from fromNode). */
export interface BranchWitness {
  fromNode: string;
  includedNodes: string[];
  reachabilityReason: Record<string, string[]>; // nodeId → BFS path from fromNode
}

/**
 * Detect node ID collisions before merging two graphs.
 * Returns conflicts array — non-empty means merge would fail.
 * Use this for pre-flight collision detection without throwing.
 */
export function mergeCheck<T1 extends string, T2 extends string>(
  g1: Graph<T1>,
  g2: Graph<T2>,
): MergeConflict[] {
  const ids1 = new Set(Object.keys(g1.nodes));
  const conflicts: MergeConflict[] = [];
  for (const [id, node] of Object.entries(g2.nodes)) {
    if (ids1.has(id)) {
      conflicts.push({
        type: 'node-id-collision',
        nodeId: id,
        left: (g1.nodes as Record<string, unknown>)[id],
        right: node,
      });
    }
  }
  return conflicts;
}

/**
 * Branch a subgraph from fromNode to g.term, returning graph + reachability witness.
 * Backward-compatible companion to branch() — use when witness evidence is needed.
 */
export function branchWithWitness<T extends string>(
  g: Graph<T>,
  fromNode: T,
): { graph: Graph<T>; witness: BranchWitness } {
  if (!g || !fromNode) throw new Error('Graph and fromNode required for branchWithWitness');
  if (!(fromNode in g.nodes)) throw new Error(`fromNode "${fromNode}" not in graph`);

  const nodes = flat(g);
  // BFS from fromNode, recording path to each node
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

  const branched: Graph<T> = {
    id: `${g.id}:${fromNode}`,
    desc: `Branch of ${g.desc} from ${fromNode}`,
    init: fromNode,
    term: g.term,
    nodes: branchedNodes as any,
  };

  const validated = define(branched);
  const errors = verify(validated);
  if (errors.length) throw new Error(`Branch validation failed: ${errors.join(', ')}`);

  return {
    graph: validated,
    witness: { fromNode, includedNodes, reachabilityReason },
  };
}

// --- merge: combine two DAGs at reconcile() join points ---
// Merges g1 and g2 by adding edges from g1→g2 at specified connection points.
// Returns merged graph, validated by define() and verify().

export function merge<T1 extends string, T2 extends string>(
  g1: Graph<T1>,
  g2: Graph<T2>,
  connections: ReadonlyArray<{ g1Node: string; g2Node: string; artifact: string }>,
  initOverride?: string,
  termOverride?: string,
): Graph<T1 | T2> {
  // Validate inputs
  if (!g1 || !g2) throw new Error('Both g1 and g2 required for merge');

  // Detect namespace collisions via mergeCheck (FR-MERGE-001)
  const conflicts = mergeCheck(g1, g2);
  if (conflicts.length) {
    const ids = conflicts.map(c => c.nodeId).join(', ');
    throw new Error(`Node ID conflicts: ${ids}. Pre-qualify node IDs before merge.`);
  }

  // Merge node maps
  const mergedNodes: Record<string, Flat> = {};
  for (const [id, node] of Object.entries(g1.nodes)) {
    mergedNodes[id as string] = node as Flat;
  }
  for (const [id, node] of Object.entries(g2.nodes)) {
    mergedNodes[id as string] = node as Flat;
  }

  // Add connection edges: modify g2 nodes to depend on g1 nodes
  for (const conn of connections) {
    const g2Node = mergedNodes[conn.g2Node as string];
    if (!g2Node) throw new Error(`Connection g2Node "${conn.g2Node}" not found in g2`);
    if (!g2Node.deps.includes(conn.g1Node as string)) {
      g2Node.deps = [...g2Node.deps, conn.g1Node as string];
    }
  }

  // Create merged graph with inferred init/term
  const merged: Graph<T1 | T2> = {
    id: `${g1.id}+${g2.id}`,
    desc: `${g1.desc} → ${g2.desc}`,
    init: (initOverride || g1.init) as T1 | T2,
    term: (termOverride || g2.term) as T1 | T2,
    nodes: mergedNodes as any,
  };

  // Validate merged graph
  const validated = define(merged);
  const errors = verify(validated);
  if (errors.length) throw new Error(`Merge validation failed: ${errors.join(', ')}`);

  return validated;
}

// --- branch: extract subgraph from a node to term (FR-BRANCH-001) ---
// Delegates to branchWithWitness, returns graph only for backward compatibility.

export function branch<T extends string>(
  g: Graph<T>,
  fromNode: T,
): Graph<T> {
  return branchWithWitness(g, fromNode).graph;
}

// --- modify: delete/skip goals during execution (replanning support) ---
// Enables agents to adapt when discovering better paths or obsolete work

export interface ModifyAnalysis {
  dependents: string[]; // Nodes that depend on target
  orphaned: string[]; // Nodes left unreachable after deletion
  produces: string[]; // Artifacts target produces
  safe: boolean; // Can be safely deleted?
  reason: string; // Why safe/unsafe
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

  // Find nodes that depend on this one
  const dependents = nodes.filter(n => n.deps.includes(nodeId)).map(n => n.id);

  // Simulate deletion: which nodes become unreachable?
  const tempNodes = { ...g.nodes };
  delete (tempNodes as any)[nodeId];

  let orphaned: string[] = [];
  try {
    // Check reachability from init in modified graph
    const reachable = new Set<string>();
    const queue = [g.init];
    reachable.add(g.init);

    while (queue.length) {
      const id = queue.shift()!;
      const node = (tempNodes as any)[id];
      if (!node) break;

      for (const dep of node.deps) {
        if (!reachable.has(dep) && dep !== nodeId) {
          reachable.add(dep);
          queue.push(dep);
        }
      }
    }

    // Nodes not reachable (except term, which is checked separately)
    orphaned = Object.keys(tempNodes)
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

export function modify<T extends string>(
  g: Graph<T>,
  nodeId: string,
  action: 'delete' | 'skip',
): Graph<T> | Error {
  if (action === 'skip') {
    // Skip is metadata (not implemented in core protocol)
    // Caller can use in orient() decision logic
    return g; // Return unchanged for now
  }

  if (action !== 'delete') {
    return new Error(`Unknown action: ${action}`);
  }

  if (nodeId === g.init || nodeId === g.term) {
    return new Error(`Cannot delete ${nodeId}: cannot modify init or term`);
  }

  // Build new nodes without target
  const modifiedNodes: Record<string, Flat> = {};
  for (const [id, node] of Object.entries(g.nodes)) {
    if (id === nodeId) continue; // Skip target

    // Remove nodeId from this node's deps
    const newDeps = (node as Flat).deps.filter(d => d !== nodeId);
    modifiedNodes[id] = { ...(node as Flat), deps: newDeps };
  }

  // Create modified graph
  const modified: Graph<T> = {
    id: `${g.id}:modified`,
    desc: `${g.desc} (node "${nodeId}" deleted)`,
    init: g.init,
    term: g.term,
    nodes: modifiedNodes as any,
  };

  // Re-validate: must remain acyclic, connected, with satisfied contracts
  try {
    const cycles = flat(modified).filter(n => n.id).map(n => n.id);
    const kahn = [...cycles].sort(); // Placeholder cycle detection

    // Full validation
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

// --- Atomic modifications: modify + commit for concurrent agent safety ---

export interface ModificationRecord {
  timestamp: number;
  action: 'delete' | 'skip';
  nodeId: string;
  reason: string;
  evidence?: string;
  commitHash?: string;
  graphAfter?: Graph<string>;
}

/**
 * Atomic modify: apply modification then commit to git.
 * All agents see committed state on next spawn.
 *
 * Returns: { success, graph, commitHash, error? }
 * On failure: error returned, no commit made.
 */
export async function modifyAndCommit(
  g: Graph<any>,
  nodeId: string,
  action: 'delete' | 'skip',
  reason: string,
  repoRoot: string,
  evidence?: string,
): Promise<{ success: boolean; graph?: Graph<any>; commitHash?: string; error?: string }> {
  // Attempt modification (in-memory)
  const modResult = modify(g, nodeId, action);
  if (modResult instanceof Error) {
    return { success: false, error: modResult.message };
  }

  // Modification succeeded, now commit it
  try {
    const { execSync } = await import('node:child_process');
    const { writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');

    // Write modified roadmap back to file (roadmap.ts)
    const roadmapPath = join(repoRoot, 'roadmap.ts');
    const roadmapContent = `export default ${JSON.stringify(modResult, null, 2)};\n`;

    writeFileSync(roadmapPath, roadmapContent);

    // Commit the change
    execSync(`git add roadmap.ts`, { cwd: repoRoot, stdio: 'ignore' });
    const commitMsg = `roadmap: ${action} ${nodeId} — ${reason}`;
    execSync(`git commit -m "${commitMsg}"`, { cwd: repoRoot, stdio: 'ignore' });

    // Get commit hash
    const commitHash = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();

    // Post-commit hook will update git-state.json automatically


    return { success: true, graph: modResult, commitHash };
  } catch (e) {
    return { success: false, error: `Commit failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
