// Protocol function tests — define, verify, check, reconcile, order, orient
//
// All fixtures are plain object literals constructed per-test.
// No shared mutable state. CompletionStore used for orient() position.

import { describe, it, expect } from 'vitest';
import { graph, define, verify, check, reconcile, order, orient, CompletionStore } from '../src/protocol.ts';

// --- Fixtures ---
// Inline minimal graphs. graph() is an identity function that extracts T for inference.

function linear() {
  return graph({
    id: 'linear',
    desc: 'init → a → b → term',
    init: 'init',
    term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: ['init.txt'], consumes: [], deps: [] },
      a:    { id: 'a',    desc: 'step a', produces: ['a.txt'],    consumes: ['init.txt'], deps: ['init'] },
      b:    { id: 'b',    desc: 'step b', produces: ['b.txt'],    consumes: ['a.txt'],    deps: ['a'] },
      term: { id: 'term', desc: 'end',    produces: [],           consumes: ['b.txt'],    deps: ['b'] },
    },
  });
}

function diamond() {
  return graph({
    id: 'diamond',
    desc: 'init → {a, b} → c → term',
    init: 'init',
    term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: ['root.txt'], consumes: [],           deps: [] },
      a:    { id: 'a',    desc: 'left',  produces: ['a.txt'],    consumes: ['root.txt'], deps: ['init'] },
      b:    { id: 'b',    desc: 'right', produces: ['b.txt'],    consumes: ['root.txt'], deps: ['init'] },
      c:    { id: 'c',    desc: 'merge', produces: ['c.txt'],    consumes: ['a.txt', 'b.txt'], deps: ['a', 'b'] },
      term: { id: 'term', desc: 'end',   produces: [],           consumes: ['c.txt'],    deps: ['c'] },
    },
  });
}

function minimal() {
  return graph({
    id: 'minimal',
    desc: 'init → term only',
    init: 'init',
    term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: ['seed.txt'], consumes: [], deps: [] },
      term: { id: 'term', desc: 'end',   produces: [],           consumes: [], deps: ['init'] },
    },
  });
}

// --- define ---

describe('define: structural validation', () => {
  it('returns the graph unchanged when valid', () => {
    const g = linear();
    expect(define(g)).toBe(g);
  });

  it('throws when init node is absent', () => {
    const g = graph({
      id: 'bad', desc: '', init: 'missing', term: 'term',
      nodes: {
        a:    { id: 'a',    desc: '', produces: [], consumes: [], deps: [] },
        term: { id: 'term', desc: '', produces: [], consumes: [], deps: [] },
      },
    });
    expect(() => define(g)).toThrow('init "missing" not in nodes');
  });

  it('throws when term node is absent', () => {
    const g = graph({
      id: 'bad', desc: '', init: 'init', term: 'missing',
      nodes: {
        init: { id: 'init', desc: '', produces: [], consumes: [], deps: [] },
        a:    { id: 'a',    desc: '', produces: [], consumes: [], deps: [] },
      },
    });
    expect(() => define(g)).toThrow('term "missing" not in nodes');
  });

  it('throws when init === term', () => {
    const g = graph({
      id: 'bad', desc: '', init: 'only', term: 'only',
      nodes: {
        only: { id: 'only', desc: '', produces: [], consumes: [], deps: [] },
      },
    });
    expect(() => define(g)).toThrow('init and term cannot be the same node');
  });

  it('throws on direct two-node cycle', () => {
    // TypeScript won't catch this — deps reference any TAll, so a→b and b→a is valid at type level.
    // define() catches it at runtime via Kahn's.
    const g = { id: 'cycle', desc: '', init: 'a', term: 'b', nodes: {
      a: { id: 'a', desc: '', produces: [], consumes: [], deps: ['b'] as const },
      b: { id: 'b', desc: '', produces: [], consumes: [], deps: ['a'] as const },
    } } as ReturnType<typeof graph<'a' | 'b'>>;
    expect(() => define(g)).toThrow('Cycle');
  });

  it('throws on three-node cycle', () => {
    const g = { id: 'cycle3', desc: '', init: 'a', term: 'c', nodes: {
      a: { id: 'a', desc: '', produces: [], consumes: [], deps: ['c'] as const },
      b: { id: 'b', desc: '', produces: [], consumes: [], deps: ['a'] as const },
      c: { id: 'c', desc: '', produces: [], consumes: [], deps: ['b'] as const },
    } } as ReturnType<typeof graph<'a' | 'b' | 'c'>>;
    expect(() => define(g)).toThrow('Cycle');
  });

  it('accepts diamond (shared deps, not a cycle)', () => {
    expect(() => define(diamond())).not.toThrow();
  });
});

// --- verify ---

describe('verify: contract validation', () => {
  it('returns [] for a graph with no consumes', () => {
    const g = define(graph({
      id: 'no-consumes', desc: '', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: '', produces: ['x'], consumes: [], deps: [] },
        term: { id: 'term', desc: '', produces: [], consumes: [], deps: ['init'] },
      },
    }));
    expect(verify(g)).toEqual([]);
  });

  it('returns [] when consumes satisfied by direct predecessor', () => {
    expect(verify(define(linear()))).toEqual([]);
  });

  it('returns [] when consumes satisfied by transitive predecessor', () => {
    const g = define(graph({
      id: 'transitive', desc: '', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: '', produces: ['base.txt'], consumes: [],          deps: [] },
        mid:  { id: 'mid',  desc: '', produces: ['mid.txt'],  consumes: [],          deps: ['init'] },
        term: { id: 'term', desc: '', produces: [],           consumes: ['base.txt'], deps: ['mid'] },
      },
    }));
    expect(verify(g)).toEqual([]);
  });

  it('returns error when no predecessor produces the consumed artifact', () => {
    const g = define(graph({
      id: 'missing', desc: '', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: '', produces: [],           consumes: [],          deps: [] },
        term: { id: 'term', desc: '', produces: [],           consumes: ['ghost.ts'], deps: ['init'] },
      },
    }));
    const errs = verify(g);
    expect(errs.length).toBe(1);
    expect(errs[0]).toMatch('"term" consumes "ghost.ts"');
  });

  it('does not satisfy consumes from a sibling (non-ancestor) node', () => {
    // a and b both dep on init. b consumes a.txt but a is not a predecessor of b.
    const g = define(graph({
      id: 'sibling', desc: '', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: '', produces: [],       consumes: [],        deps: [] },
        a:    { id: 'a',    desc: '', produces: ['a.txt'], consumes: [],        deps: ['init'] },
        b:    { id: 'b',    desc: '', produces: ['b.txt'], consumes: ['a.txt'], deps: ['init'] },
        term: { id: 'term', desc: '', produces: [],        consumes: [],        deps: ['a', 'b'] },
      },
    }));
    const errs = verify(g);
    expect(errs.length).toBe(1);
    expect(errs[0]).toMatch('"b" consumes "a.txt"');
  });

  it('returns multiple errors for multiple unsatisfied consumes', () => {
    const g = define(graph({
      id: 'multi-err', desc: '', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: '', produces: [],     consumes: [],            deps: [] },
        term: { id: 'term', desc: '', produces: [],     consumes: ['x', 'y', 'z'], deps: ['init'] },
      },
    }));
    const errs = verify(g);
    expect(errs.length).toBe(3);
  });

  it('returns [] for diamond with correctly wired consumes', () => {
    expect(verify(define(diamond()))).toEqual([]);
  });
});

// --- check ---

describe('check: termination / reachability', () => {
  it('returns done:true for minimal init → term', () => {
    expect(check(define(minimal()))).toEqual({ done: true, orphans: [] });
  });

  it('returns done:true for linear chain', () => {
    expect(check(define(linear()))).toEqual({ done: true, orphans: [] });
  });

  it('returns done:true for diamond', () => {
    expect(check(define(diamond()))).toEqual({ done: true, orphans: [] });
  });

  it('returns done:false when a node cannot reach term', () => {
    // c has no path to term
    const g = define(graph({
      id: 'dead-end', desc: '', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: '', produces: [], consumes: [], deps: [] },
        c:    { id: 'c',    desc: '', produces: [], consumes: [], deps: ['init'] },
        term: { id: 'term', desc: '', produces: [], consumes: [], deps: ['init'] },
      },
    }));
    const result = check(g);
    expect(result.done).toBe(false);
    expect(result.orphans.some(o => o.startsWith('c:'))).toBe(true);
  });

  it('returns done:false when a node is unreachable from init', () => {
    // c is unreachable from init — it has no deps but is not init
    const g = define(graph({
      id: 'island', desc: '', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: '', produces: [], consumes: [], deps: [] },
        c:    { id: 'c',    desc: '', produces: [], consumes: [], deps: [] },
        term: { id: 'term', desc: '', produces: [], consumes: [], deps: ['init'] },
      },
    }));
    const result = check(g);
    expect(result.done).toBe(false);
    expect(result.orphans.some(o => o.includes('unreachable from init'))).toBe(true);
  });

  it('orphans message includes node id and direction', () => {
    const g = define(graph({
      id: 'msg', desc: '', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: '', produces: [], consumes: [], deps: [] },
        lost: { id: 'lost', desc: '', produces: [], consumes: [], deps: ['init'] },
        term: { id: 'term', desc: '', produces: [], consumes: [], deps: ['init'] },
      },
    }));
    const { orphans } = check(g);
    const msg = orphans.find(o => o.startsWith('lost:'))!;
    expect(msg).toBeDefined();
    expect(msg).toContain('term');
  });
});

// --- order ---

describe('order: topological sort', () => {
  it('init appears before its dependents', () => {
    const seq = order(define(linear()));
    expect(seq.indexOf('init')).toBeLessThan(seq.indexOf('a'));
    expect(seq.indexOf('a')).toBeLessThan(seq.indexOf('b'));
    expect(seq.indexOf('b')).toBeLessThan(seq.indexOf('term'));
  });

  it('returns all node ids', () => {
    const g = define(linear());
    const seq = order(g);
    expect(seq.sort()).toEqual(['a', 'b', 'init', 'term']);
  });

  it('diamond: both branches before merge node', () => {
    const seq = order(define(diamond()));
    const ai = seq.indexOf('a');
    const bi = seq.indexOf('b');
    const ci = seq.indexOf('c');
    expect(ai).toBeLessThan(ci);
    expect(bi).toBeLessThan(ci);
  });

  it('minimal graph has init before term', () => {
    const seq = order(define(minimal()));
    expect(seq.indexOf('init')).toBeLessThan(seq.indexOf('term'));
  });
});

// --- reconcile ---

describe('reconcile: forward/backward frontier matching', () => {
  it('finds connection when forward produces what backward consumes', () => {
    const g = define(linear());
    const { connections, gaps } = reconcile(g, ['a'], ['b']);
    expect(connections).toEqual([{ forward: 'a', backward: 'b', artifact: 'a.txt' }]);
    expect(gaps).toEqual([]);
  });

  it('finds all shared artifacts between two nodes', () => {
    const g = define(graph({
      id: 'multi-artifact', desc: '', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: '', produces: ['x', 'y'], consumes: [],       deps: [] },
        term: { id: 'term', desc: '', produces: [],         consumes: ['x', 'y'], deps: ['init'] },
      },
    }));
    const { connections } = reconcile(g, ['init'], ['term']);
    expect(connections.length).toBe(2);
    expect(connections.map(c => c.artifact).sort()).toEqual(['x', 'y']);
  });

  it('returns empty connections when produces and consumes do not overlap', () => {
    const g = define(graph({
      id: 'no-match', desc: '', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: '', produces: ['x'], consumes: [],   deps: [] },
        term: { id: 'term', desc: '', produces: [],    consumes: ['y'], deps: ['init'] },
      },
    }));
    const { connections } = reconcile(g, ['init'], ['term']);
    expect(connections).toEqual([]);
  });

  it('gap.missing includes all unmet backward consumes', () => {
    // B.consumes = ['y'] and F.produces = ['x'] — 'y' is the gap, 'x' is surplus.
    // Current implementation includes both in missing (see protocol.ts:171-175).
    const g = define(graph({
      id: 'gap', desc: '', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: '', produces: ['x'], consumes: [],   deps: [] },
        term: { id: 'term', desc: '', produces: [],    consumes: ['y'], deps: ['init'] },
      },
    }));
    const { gaps } = reconcile(g, ['init'], ['term']);
    expect(gaps.length).toBe(1);
    expect(gaps[0].between).toEqual(['init', 'term']);
    // Unmet consume must appear in missing
    expect(gaps[0].missing).toContain('y');
  });

  it('skips unknown node ids silently', () => {
    const g = define(minimal());
    const { connections, gaps } = reconcile(g, ['nonexistent'], ['term']);
    expect(connections).toEqual([]);
    expect(gaps).toEqual([]);
  });

  it('handles multiple forward × backward pairs', () => {
    const g = define(diamond());
    const { connections } = reconcile(g, ['a', 'b'], ['c']);
    const artifacts = connections.map(c => c.artifact).sort();
    expect(artifacts).toEqual(['a.txt', 'b.txt']);
  });
});

// --- orient ---

describe('orient: filesystem-state position', () => {
  it('returns init when no artifacts exist', () => {
    const g = define(linear());
    const o = orient(g, CompletionStore.empty());
    expect(o.position).toEqual(['init']);
    expect(o.done).toEqual([]);
    expect(o.produces).toEqual(['init.txt']);
  });

  it('advances past nodes whose produces all exist', () => {
    const g = define(linear());
    const o = orient(g, CompletionStore.from(['init']));
    expect(o.position).toEqual(['a']);
    expect(o.done).toEqual(['init']);
    expect(o.produces).toEqual(['a.txt']);
    expect(o.consumes).toEqual(['init.txt']);
  });

  it('returns term position when all producing nodes are done', () => {
    const g = define(linear());
    const o = orient(g, CompletionStore.from(['init', 'a', 'b']));
    expect(o.position).toEqual(['term']);
    expect(o.done).toContain('init');
    expect(o.done).toContain('a');
    expect(o.done).toContain('b');
  });

  it('remaining contains nodes after current position', () => {
    const g = define(linear());
    const o = orient(g, CompletionStore.from(['init']));
    // position='a', so remaining = ['b', 'term']
    expect(o.remaining).toContain('b');
    expect(o.remaining).toContain('term');
    expect(o.remaining).not.toContain('init');
    expect(o.remaining).not.toContain('a');
  });

  it('CompletionStore uses node ids, not artifact strings', () => {
    const g = define(linear());
    // CompletionStore.from takes node IDs — orient resolves completion from those
    const o = orient(g, CompletionStore.from(['init']));
    expect(o.position).toEqual(['a']);
    expect(o.done).toContain('init');
  });

  it('node with empty produces is done when it has a receipt', () => {
    // A non-terminal node with produces:[] has no filesystem artifacts to create.
    // orient() marks it done when it has a receipt — position should be term.
    const g = define(graph({
      id: 'empty-mid', desc: '', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: '', produces: ['seed'], consumes: [],     deps: [] },
        mid:  { id: 'mid',  desc: '', produces: [],       consumes: [],     deps: ['init'] },
        term: { id: 'term', desc: '', produces: [],       consumes: [],     deps: ['mid'] },
      },
    }));
    const o = orient(g, CompletionStore.from(['init', 'mid']));
    expect(o.position).toEqual(['term']);
    expect(o.done).toContain('mid');
  });

  it('diamond: orient uses topological order, marks both branches done if possible', () => {
    const g = define(diamond());
    const o = orient(g, CompletionStore.from(['init', 'a', 'b']));
    expect(o.position).toEqual(['c']);
    expect(o.done).toContain('a');
    expect(o.done).toContain('b');
  });
});
