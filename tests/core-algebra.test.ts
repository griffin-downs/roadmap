// Core algebra unit tests — pure graph operations, zero IO.
import { describe, it, expect } from 'vitest';
import { define, verify, check, flat, fwd, detectCycles, reach } from '../src/core/graph.ts';
import { reconcile, merge, mergeCheck, branch, branchWithWitness, analyze, modify } from '../src/core/reconcile.ts';
import { order, parallelOrder } from '../src/core/order.ts';
import type { Graph } from '../src/lib/protocol/types.ts';

// --- Test graph factory ---

function mkGraph(nodes: Record<string, { deps: string[]; produces?: string[]; consumes?: string[] }>, init = 'init', term = 'term'): Graph<string> {
  const built: Record<string, any> = {};
  for (const [id, n] of Object.entries(nodes)) {
    built[id] = {
      id,
      desc: id,
      produces: n.produces ?? [],
      consumes: n.consumes ?? [],
      deps: n.deps,
      validate: [],
      idempotent: true,
    };
  }
  return { id: 'test', desc: 'test graph', init, term, nodes: built } as Graph<string>;
}

// === define ===

describe('define', () => {
  it('accepts valid graph', () => {
    const g = mkGraph({ init: { deps: [] }, mid: { deps: ['init'] }, term: { deps: ['mid'] } });
    expect(() => define(g)).not.toThrow();
  });

  it('rejects missing init', () => {
    const g = mkGraph({ other: { deps: [] }, term: { deps: ['other'] } }, 'missing', 'term');
    expect(() => define(g)).toThrow('init "missing" not in nodes');
  });

  it('rejects missing term', () => {
    const g = mkGraph({ init: { deps: [] }, other: { deps: ['init'] } }, 'init', 'missing');
    expect(() => define(g)).toThrow('term "missing" not in nodes');
  });

  it('rejects same init and term', () => {
    const g = { id: 'test', desc: 'test', init: 'a', term: 'a', nodes: { a: { id: 'a', desc: 'a', produces: [], consumes: [], deps: [], validate: [], idempotent: true } } } as Graph<string>;
    expect(() => define(g)).toThrow('init and term cannot be the same');
  });

  it('rejects cycles', () => {
    const g = mkGraph({
      init: { deps: [] },
      a: { deps: ['b'] },
      b: { deps: ['a'] },
      term: { deps: ['a'] },
    });
    expect(() => define(g)).toThrow(/[Cc]ycle/);
  });

  it('rejects unknown convergenceCheck keys', () => {
    const g = mkGraph({ init: { deps: [] }, term: { deps: ['init'] } });
    (g.nodes as any).init.convergenceCheck = { badKey: true };
    expect(() => define(g)).toThrow('unknown keys: badKey');
  });

  it('validates track as non-negative integer', () => {
    const g = mkGraph({ init: { deps: [] }, term: { deps: ['init'] } });
    (g.nodes as any).init.track = -1;
    expect(() => define(g)).toThrow('track must be a non-negative integer');
  });
});

// === verify ===

describe('verify', () => {
  it('passes when consumes are satisfied by predecessors', () => {
    const g = mkGraph({
      init: { deps: [], produces: ['x.ts'] },
      mid: { deps: ['init'], consumes: ['x.ts'] },
      term: { deps: ['mid'] },
    });
    define(g);
    expect(verify(g)).toEqual([]);
  });

  it('fails when consumes are unsatisfied', () => {
    const g = mkGraph({
      init: { deps: [] },
      mid: { deps: ['init'], consumes: ['missing.ts'] },
      term: { deps: ['mid'] },
    });
    define(g);
    const errors = verify(g);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('missing.ts');
  });

  it('passes when consumes are deep in predecessor chain', () => {
    const g = mkGraph({
      init: { deps: [], produces: ['deep.ts'] },
      a: { deps: ['init'] },
      b: { deps: ['a'], consumes: ['deep.ts'] },
      term: { deps: ['b'] },
    });
    define(g);
    expect(verify(g)).toEqual([]);
  });
});

// === check ===

describe('check', () => {
  it('passes when all nodes reachable', () => {
    const g = mkGraph({
      init: { deps: [] },
      mid: { deps: ['init'] },
      term: { deps: ['mid'] },
    });
    define(g);
    expect(check(g)).toEqual({ done: true, orphans: [] });
  });

  it('detects orphan nodes', () => {
    const g = mkGraph({
      init: { deps: [] },
      orphan: { deps: [] },
      term: { deps: ['init'] },
    });
    // orphan has no deps and nothing depends on it, unreachable from init
    // but define will fail because orphan has no path to init — actually orphan deps=[] so it's like another root
    // define won't fail (no cycles), but check will find orphan unreachable
    define(g);
    const result = check(g);
    expect(result.done).toBe(false);
    expect(result.orphans.length).toBeGreaterThan(0);
  });

  it('detects node that cannot reach term', () => {
    const g = mkGraph({
      init: { deps: [] },
      dead: { deps: ['init'] },
      term: { deps: ['init'] },
    });
    define(g);
    const result = check(g);
    expect(result.done).toBe(false);
    expect(result.orphans.some(o => o.includes('dead'))).toBe(true);
  });
});

// === flat / fwd ===

describe('flat and fwd', () => {
  it('flat returns all nodes', () => {
    const g = mkGraph({
      init: { deps: [] },
      a: { deps: ['init'] },
      term: { deps: ['a'] },
    });
    const nodes = flat(g);
    expect(nodes.map(n => n.id).sort()).toEqual(['a', 'init', 'term']);
  });

  it('fwd builds forward adjacency map', () => {
    const g = mkGraph({
      init: { deps: [] },
      a: { deps: ['init'] },
      b: { deps: ['init'] },
      term: { deps: ['a', 'b'] },
    });
    const m = fwd(flat(g));
    expect(m.get('init')?.sort()).toEqual(['a', 'b']);
    expect(m.get('a')).toEqual(['term']);
    expect(m.get('b')).toEqual(['term']);
    expect(m.get('term')).toEqual([]);
  });
});

// === detectCycles ===

describe('detectCycles', () => {
  it('returns empty for acyclic graph', () => {
    const nodes = flat(mkGraph({ init: { deps: [] }, term: { deps: ['init'] } }));
    expect(detectCycles(nodes)).toEqual([]);
  });

  it('returns cycle members', () => {
    const nodes = [
      { id: 'a', deps: ['b'], produces: [], consumes: [] },
      { id: 'b', deps: ['a'], produces: [], consumes: [] },
    ] as any[];
    expect(detectCycles(nodes).sort()).toEqual(['a', 'b']);
  });
});

// === reach ===

describe('reach', () => {
  it('returns true for direct dependency', () => {
    const nodes = flat(mkGraph({ init: { deps: [] }, term: { deps: ['init'] } }));
    expect(reach(nodes, 'init', 'term')).toBe(true);
  });

  it('returns true for transitive reachability', () => {
    const g = mkGraph({
      init: { deps: [] },
      a: { deps: ['init'] },
      b: { deps: ['a'] },
      term: { deps: ['b'] },
    });
    expect(reach(flat(g), 'init', 'term')).toBe(true);
  });

  it('returns false for unreachable nodes', () => {
    const g = mkGraph({
      init: { deps: [] },
      a: { deps: ['init'] },
      b: { deps: ['init'] },
      term: { deps: ['a'] },
    });
    expect(reach(flat(g), 'b', 'term')).toBe(false);
  });

  it('returns true for self-reachability', () => {
    const nodes = flat(mkGraph({ init: { deps: [] }, term: { deps: ['init'] } }));
    expect(reach(nodes, 'init', 'init')).toBe(true);
  });
});

// === order / parallelOrder ===

describe('order and parallelOrder', () => {
  it('order returns topological sort', () => {
    const g = mkGraph({
      init: { deps: [] },
      a: { deps: ['init'] },
      b: { deps: ['a'] },
      term: { deps: ['b'] },
    });
    define(g);
    const sorted = order(g);
    expect(sorted).toEqual(['init', 'a', 'b', 'term']);
  });

  it('parallelOrder groups independent nodes', () => {
    const g = mkGraph({
      init: { deps: [] },
      a: { deps: ['init'] },
      b: { deps: ['init'] },
      term: { deps: ['a', 'b'] },
    });
    define(g);
    const batches = parallelOrder(g);
    expect(batches[0]).toEqual(['init']);
    expect(batches[1].sort()).toEqual(['a', 'b']);
    expect(batches[2]).toEqual(['term']);
  });
});

// === reconcile ===

describe('reconcile', () => {
  it('finds connections when produces meets consumes', () => {
    const g = mkGraph({
      init: { deps: [], produces: ['shared.ts'] },
      mid: { deps: ['init'], consumes: ['shared.ts'] },
      term: { deps: ['mid'] },
    });
    define(g);
    const result = reconcile(g, ['init'], ['mid']);
    expect(result.connections.length).toBe(1);
    expect(result.connections[0].artifact).toBe('shared.ts');
    expect(result.gaps.length).toBe(0);
  });

  it('finds gaps when consumes are unmet', () => {
    const g = mkGraph({
      init: { deps: [], produces: ['x.ts'] },
      mid: { deps: ['init'], consumes: ['y.ts'] },
      term: { deps: ['mid'] },
    });
    define(g);
    const result = reconcile(g, ['init'], ['mid']);
    expect(result.gaps.length).toBe(1);
    expect(result.gaps[0].missing).toContain('y.ts');
  });
});

// === mergeCheck ===

describe('mergeCheck', () => {
  it('returns empty for non-conflicting graphs', () => {
    const g1 = mkGraph({ init: { deps: [] }, term: { deps: ['init'] } });
    const g2 = mkGraph({ start: { deps: [] }, end: { deps: ['start'] } }, 'start', 'end');
    expect(mergeCheck(g1, g2)).toEqual([]);
  });

  it('detects node ID collisions', () => {
    const g1 = mkGraph({ init: { deps: [] }, term: { deps: ['init'] } });
    const g2 = mkGraph({ init: { deps: [] }, other: { deps: ['init'] } }, 'init', 'other');
    const conflicts = mergeCheck(g1, g2);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].nodeId).toBe('init');
  });
});

// === merge ===

describe('merge', () => {
  it('merges two graphs with connections', () => {
    const g1 = mkGraph({
      init: { deps: [], produces: ['api.ts'] },
      a: { deps: ['init'] },
      bridge: { deps: ['a'] },
    }, 'init', 'bridge');
    const g2 = mkGraph({
      consumer: { deps: [], consumes: ['api.ts'] },
      end: { deps: ['consumer'] },
    }, 'consumer', 'end');
    define(g1);
    define(g2);

    const merged = merge(g1, g2, [{ g1Node: 'bridge', g2Node: 'consumer', artifact: 'api.ts' }]);
    expect(Object.keys(merged.nodes)).toHaveLength(5);
    expect(merged.init).toBe('init');
    expect(merged.term).toBe('end');
  });

  it('throws on node ID conflicts', () => {
    const g1 = mkGraph({ init: { deps: [] }, term: { deps: ['init'] } });
    const g2 = mkGraph({ init: { deps: [] }, end: { deps: ['init'] } }, 'init', 'end');
    expect(() => merge(g1, g2, [])).toThrow(/conflict/i);
  });
});

// === branchWithWitness ===

describe('branchWithWitness', () => {
  it('extracts subgraph from a node forward', () => {
    const g = mkGraph({
      init: { deps: [] },
      a: { deps: ['init'] },
      b: { deps: ['a'] },
      term: { deps: ['b'] },
    });
    define(g);

    const { graph, witness } = branchWithWitness(g, 'a' as any);
    expect(witness.fromNode).toBe('a');
    expect(witness.includedNodes).toContain('a');
    expect(witness.includedNodes).toContain('b');
    expect(witness.includedNodes).toContain('term');
  });

  it('throws for nonexistent fromNode', () => {
    const g = mkGraph({ init: { deps: [] }, term: { deps: ['init'] } });
    define(g);
    expect(() => branchWithWitness(g, 'nope' as any)).toThrow('not in graph');
  });
});

// === branch ===

describe('branch', () => {
  it('returns graph from branchWithWitness', () => {
    const g = mkGraph({
      init: { deps: [] },
      a: { deps: ['init'] },
      term: { deps: ['a'] },
    });
    define(g);
    const branched = branch(g, 'a' as any);
    expect(branched.init).toBe('a');
    expect(Object.keys(branched.nodes)).toContain('term');
  });
});

// === analyze ===

describe('analyze', () => {
  it('identifies dependents of a node', () => {
    const g = mkGraph({
      init: { deps: [] },
      a: { deps: ['init'] },
      b: { deps: ['a'] },
      term: { deps: ['b'] },
    });
    define(g);
    const analysis = analyze(g, 'a');
    expect(analysis.dependents).toContain('b');
  });

  it('marks init/term as unsafe to delete', () => {
    const g = mkGraph({
      init: { deps: [] },
      term: { deps: ['init'] },
    });
    define(g);
    expect(analyze(g, 'init').safe).toBe(false);
    expect(analyze(g, 'term').safe).toBe(false);
  });

  it('detects orphans from deletion', () => {
    const g = mkGraph({
      init: { deps: [] },
      a: { deps: ['init'] },
      b: { deps: ['a'] },
      term: { deps: ['b'] },
    });
    define(g);
    const analysis = analyze(g, 'a');
    // Deleting 'a' orphans 'b' since it only depends on 'a'
    expect(analysis.orphaned.length).toBeGreaterThan(0);
  });

  it('returns not found for missing node', () => {
    const g = mkGraph({ init: { deps: [] }, term: { deps: ['init'] } });
    define(g);
    const analysis = analyze(g, 'nope');
    expect(analysis.safe).toBe(false);
    expect(analysis.reason).toContain('not found');
  });
});

// === modify ===

describe('modify', () => {
  it('deletes a leaf node', () => {
    const g = mkGraph({
      init: { deps: [] },
      a: { deps: ['init'] },
      b: { deps: ['init'] },
      term: { deps: ['a', 'b'] },
    });
    define(g);
    const result = modify(g, 'a', 'delete');
    expect(result).not.toBeInstanceOf(Error);
    if (!(result instanceof Error)) {
      expect(Object.keys(result.nodes)).not.toContain('a');
      // term should still work with just b
      expect(check(result).done).toBe(true);
    }
  });

  it('returns error for init deletion', () => {
    const g = mkGraph({ init: { deps: [] }, term: { deps: ['init'] } });
    define(g);
    const result = modify(g, 'init', 'delete');
    expect(result).toBeInstanceOf(Error);
  });

  it('returns error for term deletion', () => {
    const g = mkGraph({ init: { deps: [] }, term: { deps: ['init'] } });
    define(g);
    const result = modify(g, 'term', 'delete');
    expect(result).toBeInstanceOf(Error);
  });

  it('skip action returns original graph', () => {
    const g = mkGraph({ init: { deps: [] }, term: { deps: ['init'] } });
    define(g);
    expect(modify(g, 'init', 'skip')).toBe(g);
  });

  it('deletion that breaks connectivity returns error', () => {
    const g = mkGraph({
      init: { deps: [] },
      bridge: { deps: ['init'] },
      term: { deps: ['bridge'] },
    });
    define(g);
    // Deleting bridge disconnects init from term
    const result = modify(g, 'bridge', 'delete');
    expect(result).toBeInstanceOf(Error);
  });
});
