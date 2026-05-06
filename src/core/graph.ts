// @module core/graph
// @exports define, verify, check, flat, fwd, detectCycles, reach, Flat
// @types Flat
// @entry roadmap

// Pure graph validation algebra. Zero IO imports.
// define: structural validation (cycles, init/term)
// verify: contract validation (consumes satisfied by predecessors)
// check: termination (every node reachable init<->term)

import type { Graph, ConsumeSpec } from '../lib/protocol/types.ts';
import { consumeArtifact, consumeResolvedBy } from '../lib/protocol/types.ts';

// --- Internal: flat iteration over mapped type ---

export type Flat = {
  id: string;
  produces: readonly string[];
  consumes: readonly string[];
  deps: readonly string[];
  mode?: 'execute' | 'plan';
  expandedFrom?: string;
  loopTarget?: string;
  convergenceCheck?: {
    maxCoverageDelta?: number;
    requireEmptyProposals?: boolean;
    minWallClockDeltaMs?: number;
  };
  ambient?: readonly string[];
  track?: number;
  affects?: readonly string[];
};

// Synthesize `deps` from consumes ↔ produces. Used inside flat() to populate
// the engine's internal ordering field. Authored NodeSpec no longer carries
// deps; raw objects that still carry one (tests, legacy heads) win — the
// fallback path is taken only when deps is absent.
function synthesizeDeps<T extends string>(g: Graph<T>, raw: ReadonlyArray<{ id: string; consumes?: readonly unknown[] }>): Map<string, readonly string[]> {
  // Build artifact → producer map.
  const producerOf = new Map<string, string>();
  for (const n of raw as ReadonlyArray<{ id: string; produces?: readonly string[] }>) {
    for (const p of n.produces ?? []) producerOf.set(p, n.id);
  }
  const ids = new Set(raw.map(n => n.id));
  const result = new Map<string, readonly string[]>();
  for (const n of raw) {
    const seen = new Set<string>();
    for (const c of n.consumes ?? []) {
      const path = typeof c === 'string' ? c : (c as { artifact?: string }).artifact;
      if (!path) continue;
      const from = producerOf.get(path);
      if (from && from !== n.id) seen.add(from);
    }
    // init/term implicit wiring: term consumes nothing → still depends on init
    // implicitly so the orderer doesn't see it as a root. We do NOT add this
    // automatically — the spec compiler handles it via consume-of-receipt.
    if (n.id === g.term && seen.size === 0) {
      // Fall back: every leaf (non-init, has no successors-by-consume) is a dep.
      // Cheap heuristic — the compiler should have wired term explicitly via
      // consumes; this branch is hit only for old legacy heads.
      const consumesByOthers = new Set<string>();
      for (const m of raw as ReadonlyArray<{ id: string; consumes?: readonly unknown[] }>) {
        for (const c of m.consumes ?? []) {
          const a = typeof c === 'string' ? c : (c as { artifact?: string }).artifact;
          if (a) consumesByOthers.add(a);
        }
      }
      for (const m of raw as ReadonlyArray<{ id: string; produces?: readonly string[] }>) {
        if (m.id === g.term || m.id === g.init) continue;
        const isLeaf = (m.produces ?? []).every(p => !consumesByOthers.has(p));
        if (isLeaf) seen.add(m.id);
      }
    }
    result.set(n.id, [...seen].filter(id => ids.has(id)));
  }
  return result;
}

export function flat<T extends string>(g: Graph<T>): Flat[] {
  const raw = Object.values(g.nodes) as Array<Flat & { deps?: readonly string[] }>;
  // Fast path: every node already has a deps array (legacy / test fixture).
  // This preserves back-compat for callers that attach deps directly.
  if (raw.every(n => Array.isArray(n.deps))) {
    return raw as Flat[];
  }
  const synthesized = synthesizeDeps(g, raw as Array<{ id: string; produces?: readonly string[]; consumes?: readonly unknown[] }>);
  return raw.map(n => Array.isArray(n.deps) ? n as Flat : ({ ...n, deps: synthesized.get(n.id) ?? [] } as Flat));
}

export function fwd(nodes: Flat[]): Map<string, string[]> {
  const m = new Map(nodes.map(n => [n.id, [] as string[]]));
  for (const n of nodes) for (const d of n.deps) m.get(d)?.push(n.id);
  return m;
}

// --- Cycle detection (Kahn's). Returns nodes in cycle, empty if acyclic. ---

export function detectCycles(nodes: Flat[]): string[] {
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

export function reach(nodes: Flat[], from: string, to: string): boolean {
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

const CONVERGENCE_CHECK_KEYS = new Set(['maxCoverageDelta', 'requireEmptyProposals', 'minWallClockDeltaMs']);

export function define<T extends string>(g: Graph<T>): Graph<T> {
  const nodes = flat(g);
  const ids = new Set(nodes.map(n => n.id));

  if (!ids.has(g.init)) throw new Error(`init "${g.init}" not in nodes`);
  if (!ids.has(g.term)) throw new Error(`term "${g.term}" not in nodes`);
  if (g.init === g.term) throw new Error(`init and term cannot be the same node`);

  const c = detectCycles(nodes);
  if (c.length) throw new Error(`Cycle in "${g.id}": ${c.join(', ')}`);

  // Validate convergenceCheck keys
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
      if (resolver && ids.has(resolver)) continue;
      errors.push(`"${node.id}" consumes "${artifact}" — no predecessor produces it`);
    }
  }

  return errors;
}

// --- check: termination ---

export function check<T extends string>(g: Graph<T>): { done: boolean; orphans: string[] } {
  const nodes = flat(g);
  const ids = new Set(nodes.map(n => n.id));
  const orphans: string[] = [];

  if (!reach(nodes, g.init, g.term)) orphans.push(`${g.term}: unreachable from ${g.init}`);

  for (const n of nodes) {
    if (n.id === g.init || n.id === g.term) continue;
    if (!reach(nodes, g.init, n.id)) orphans.push(`${n.id}: unreachable from ${g.init}`);
    else if (!reach(nodes, n.id, g.term)) orphans.push(`${n.id}: cannot reach ${g.term}`);

    if (n.loopTarget && !ids.has(n.loopTarget)) {
      orphans.push(`${n.id}: loopTarget "${n.loopTarget}" does not exist in this graph`);
    }
  }
  const termNode = nodes.find(n => n.id === g.term);
  if (termNode?.loopTarget && !ids.has(termNode.loopTarget)) {
    orphans.push(`${g.term}: loopTarget "${termNode.loopTarget}" does not exist in this graph`);
  }
  return { done: orphans.length === 0, orphans };
}
