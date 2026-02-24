// DAG expansion protocol
//
// Types:     NodeSpec<TAll, TSelf>, Graph<T>, Connection, Gap
// Functions: define, check, reconcile, order
// Compile:   tsc --noEmit catches invalid deps, self-refs, missing nodes
// Runtime:   define() catches cycles, broken consumes contracts

// --- Types ---

export interface NodeSpec<TAll extends string, TSelf extends TAll = TAll> {
  readonly id: TSelf;
  readonly desc: string;
  readonly produces: readonly string[];
  readonly consumes: readonly string[];
  readonly deps: readonly TAll[];
}

// Inference helper — extracts T from nodes, avoids mapped-type inference limits.
export function graph<T extends string>(
  g: { id: string; desc: string; init: string; term: string; nodes: { [N in T]: NodeSpec<T, N> } },
): Graph<T> {
  return g;
}

export interface Graph<T extends string> {
  readonly id: string;
  readonly desc: string;
  readonly init: string;
  readonly term: string;
  readonly nodes: { readonly [N in T]: NodeSpec<T, N> };
}

export type Connection = { forward: string; backward: string; artifact: string };
export type Gap = { between: [string, string]; missing: string[] };

// --- Internal: flat iteration over mapped type ---

type Flat = { id: string; produces: readonly string[]; consumes: readonly string[]; deps: readonly string[] };

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

export function define<T extends string>(g: Graph<T>): Graph<T> {
  const nodes = flat(g);
  const ids = new Set(nodes.map(n => n.id));

  if (!ids.has(g.init)) throw new Error(`init "${g.init}" not in nodes`);
  if (!ids.has(g.term)) throw new Error(`term "${g.term}" not in nodes`);
  if (g.init === g.term) throw new Error(`init and term cannot be the same node`);

  const c = detectCycles(nodes);
  if (c.length) throw new Error(`Cycle in "${g.id}": ${c.join(', ')}`);

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
      if (!available.has(c)) errors.push(`"${node.id}" consumes "${c}" — no predecessor produces it`);
    }
  }

  return errors;
}

// --- check: termination ---
// Every node reachable from init AND can reach term.

export function check<T extends string>(g: Graph<T>): { done: boolean; orphans: string[] } {
  const nodes = flat(g);
  const orphans: string[] = [];

  // Init must reach term.
  if (!reach(nodes, g.init, g.term)) orphans.push(`${g.term}: unreachable from ${g.init}`);

  for (const n of nodes) {
    if (n.id === g.init || n.id === g.term) continue;
    if (!reach(nodes, g.init, n.id)) orphans.push(`${n.id}: unreachable from ${g.init}`);
    else if (!reach(nodes, n.id, g.term)) orphans.push(`${n.id}: cannot reach ${g.term}`);
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
      const shared = fn.produces.filter(p => bn.consumes.includes(p));
      if (shared.length) {
        for (const a of shared) connections.push({ forward: f, backward: b, artifact: a });
      } else {
        const m = [
          ...fn.produces.filter(p => !bn.consumes.includes(p)),
          ...bn.consumes.filter(c => !fn.produces.includes(c)),
        ];
        if (m.length) gaps.push({ between: [f, b], missing: m });
      }
    }
  }

  return { connections, gaps };
}

// --- order: topological sort ---

export function order<T extends string>(g: Graph<T>): string[] {
  const nodes = flat(g);
  const valid = new Set(nodes.map(n => n.id));
  const a = fwd(nodes);
  const deg = new Map(nodes.map(n => [n.id, n.deps.filter(d => valid.has(d)).length]));
  const q = [...deg].filter(([, d]) => d === 0).map(([id]) => id);
  const out: string[] = [];
  while (q.length) {
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
