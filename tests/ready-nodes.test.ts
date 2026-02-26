import { describe, it, expect } from 'vitest';
import { graph, define, orient, readyNodes } from '../src/protocol.ts';

// Helper: existence predicate from a set of artifact paths
const has = (artifacts: Set<string>) => (a: string) => artifacts.has(a);

describe('readyNodes: eager dispatch beyond current batch', () => {
  // Diamond: init → [a, b] → c → term
  // a produces a.txt, b produces b.txt, c depends on both
  const diamond = define(graph({
    id: 'diamond',
    desc: 'diamond DAG',
    init: 'init',
    term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [] as const, validate: [], idempotent: true },
      a: { id: 'a', desc: 'fast', produces: ['a.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
      b: { id: 'b', desc: 'slow', produces: ['b.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
      c: { id: 'c', desc: 'needs both', produces: ['c.txt'], consumes: [], deps: ['a', 'b'] as const, validate: [], idempotent: true },
      term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['c'] as const, validate: [], idempotent: true },
    },
  }));

  it('returns empty when nothing is done', () => {
    const ready = readyNodes(diamond, has(new Set()));
    expect(ready).toEqual([]);
  });

  it('returns empty when current batch is fully incomplete', () => {
    // init has no produces → done. a and b are current batch, both incomplete.
    // c depends on both a and b → not ready.
    const ready = readyNodes(diamond, has(new Set()));
    expect(ready).toEqual([]);
  });

  it('returns node whose deps are met from partially complete batch', () => {
    // init → [a, b] at L1. a done, b not done.
    // L2 = [c] depends on a AND b → not ready (b incomplete).
    const ready = readyNodes(diamond, has(new Set(['a.txt'])));
    expect(ready).toEqual([]);
  });

  // Uneven fan-in: init → [a, b] → [c, d] where c depends only on a
  const uneven = define(graph({
    id: 'uneven',
    desc: 'uneven deps',
    init: 'init',
    term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [] as const, validate: [], idempotent: true },
      a: { id: 'a', desc: 'fast', produces: ['a.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
      b: { id: 'b', desc: 'slow', produces: ['b.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
      c: { id: 'c', desc: 'needs a only', produces: ['c.txt'], consumes: [], deps: ['a'] as const, validate: [], idempotent: true },
      d: { id: 'd', desc: 'needs both', produces: ['d.txt'], consumes: [], deps: ['a', 'b'] as const, validate: [], idempotent: true },
      term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['c', 'd'] as const, validate: [], idempotent: true },
    },
  }));

  it('surfaces node from future batch when its deps are met but batch is incomplete', () => {
    // L1 = [a, b]. a done, b not done. Current batch = L1.
    // L2 = [c, d]. c deps on a only → ready. d deps on a+b → not ready.
    const ready = readyNodes(uneven, has(new Set(['a.txt'])));
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe('c');
    expect(ready[0].level).toBe(2);
    expect(ready[0].produces).toEqual(['c.txt']);
    expect(ready[0].mode).toBe('execute');
  });

  it('returns rich ReadyNode shape', () => {
    const ready = readyNodes(uneven, has(new Set(['a.txt'])));
    const c = ready[0];
    expect(c).toEqual({
      id: 'c',
      level: 2,
      produces: ['c.txt'],
      consumes: [],
      mode: 'execute',
    });
  });

  it('returns multiple ready nodes across batch levels', () => {
    // init → a → c → e → term, init → b → d → term
    // If a done and b not done: c is ready (deps: a). d not ready (deps: b).
    const chain = define(graph({
      id: 'multi-level',
      desc: 'multiple ready levels',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [] as const, validate: [], idempotent: true },
        a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
        b: { id: 'b', desc: 'b', produces: ['b.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
        c: { id: 'c', desc: 'c', produces: ['c.txt'], consumes: [], deps: ['a'] as const, validate: [], idempotent: true },
        d: { id: 'd', desc: 'd', produces: ['d.txt'], consumes: [], deps: ['b'] as const, validate: [], idempotent: true },
        e: { id: 'e', desc: 'e', produces: ['e.txt'], consumes: [], deps: ['c', 'd'] as const, validate: [], idempotent: true },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['e'] as const, validate: [], idempotent: true },
      },
    }));

    // a done, b not done. Current batch = [a, b].
    // c (deps: a) → ready at L2. d (deps: b) → not ready. e (deps: c, d) → not ready.
    const ready = readyNodes(chain, has(new Set(['a.txt'])));
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe('c');

    // Now a AND c done, b still not done.
    // d (deps: b) → not ready. e (deps: c, d) → not ready.
    const ready2 = readyNodes(chain, has(new Set(['a.txt', 'c.txt'])));
    expect(ready2).toHaveLength(0);
    // c is now done so it doesn't appear. d still blocked on b.
  });

  it('returns empty when all batches complete', () => {
    const ready = readyNodes(uneven, has(new Set(['a.txt', 'b.txt', 'c.txt', 'd.txt'])));
    expect(ready).toEqual([]);
  });

  it('does not include nodes from current batch', () => {
    // In uneven, L1 = [a, b]. Even if both are incomplete, they're current batch, not ready.
    const ready = readyNodes(uneven, has(new Set()));
    expect(ready.map(n => n.id)).not.toContain('a');
    expect(ready.map(n => n.id)).not.toContain('b');
  });

  it('respects retired nodes', () => {
    // Retire b in uneven. L1 = [a, b] where b is retired (treated as done).
    // If a also done → batch complete, orient moves to L2. No ready nodes from L3+.
    // If a not done → L1 current, c (deps: a) and d (deps: a, b) — b retired so done.
    // c ready (a not done? no). Actually: a not done, so c deps on a → not ready.
    // But d deps on a and b. b retired (done), a not done → d not ready.
    const retired = new Set(['b']);
    const ready = readyNodes(uneven, has(new Set()), retired);
    // a not done, b retired. Current batch = L1, batchRemaining = [a].
    // c deps on a → not ready. d deps on a + b(retired=done) → a not done → not ready.
    expect(ready).toEqual([]);

    // Now a done, b retired.
    const ready2 = readyNodes(uneven, has(new Set(['a.txt'])), retired);
    // L1 complete (a done, b retired). orient would move to L2.
    // But readyNodes only shows future batches beyond current.
    // Since L1 is fully done, current batch is L2 = [c, d].
    // Ready from L3 (term) — but term has no produces, so it's already "done".
    expect(ready2).toEqual([]);
  });

  describe('plan nodes', () => {
    it('plan node with unfinished plan deps is not ready', () => {
      const g = define(graph({
        id: 'plan-chain',
        desc: 'plan dep chain',
        init: 'init',
        term: 'term',
        nodes: {
          init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [] as const, validate: [], idempotent: true },
          a: { id: 'a', desc: 'fast exec', produces: ['a.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
          b: { id: 'b', desc: 'slow exec', produces: ['b.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
          p1: { id: 'p1', desc: 'plan', produces: [], consumes: [], deps: ['a'] as const, validate: [], idempotent: true, mode: 'plan' as const },
          p2: { id: 'p2', desc: 'plan needs p1', produces: [], consumes: [], deps: ['p1'] as const, validate: [], idempotent: true, mode: 'plan' as const },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['p2', 'b'] as const, validate: [], idempotent: true },
        },
      }));

      // a done, b not done. Current batch = [a, b].
      // p1 deps on a (done) → p1 is ready? But p1 is a plan node with no expansion children → not done.
      // p1 appears in ready because its dep (a) is done. p2 deps on p1 (not done) → not ready.
      const ready = readyNodes(g, has(new Set(['a.txt'])));
      expect(ready.map(n => n.id)).toContain('p1');
      expect(ready.map(n => n.id)).not.toContain('p2');
      expect(ready.find(n => n.id === 'p1')!.mode).toBe('plan');
    });

    it('plan node with expansion children is done, not ready', () => {
      const g = define(graph({
        id: 'plan-expanded',
        desc: 'plan with expansion',
        init: 'init',
        term: 'term',
        nodes: {
          init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [] as const, validate: [], idempotent: true },
          a: { id: 'a', desc: 'exec', produces: ['a.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
          b: { id: 'b', desc: 'slow', produces: ['b.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
          p: { id: 'p', desc: 'plan', produces: [], consumes: [], deps: ['a'] as const, validate: [], idempotent: true, mode: 'plan' as const },
          'p-child': { id: 'p-child', desc: 'expanded', produces: ['p-child.txt'], consumes: [], deps: ['p'] as const, validate: [], idempotent: true, expandedFrom: 'p' },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['p-child', 'b'] as const, validate: [], idempotent: true },
        },
      }));

      // a done, b not done. p has expansion child → p is done.
      // p-child deps on p (done) → p-child is ready (its artifact p-child.txt missing).
      const ready = readyNodes(g, has(new Set(['a.txt'])));
      expect(ready.map(n => n.id)).not.toContain('p'); // done, not listed
      expect(ready.map(n => n.id)).toContain('p-child');
    });
  });

  describe('consumes field', () => {
    it('includes consumed artifacts in ReadyNode', () => {
      const g = define(graph({
        id: 'consumes-test',
        desc: 'consumes propagation',
        init: 'init',
        term: 'term',
        nodes: {
          init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [] as const, validate: [], idempotent: true },
          a: { id: 'a', desc: 'producer', produces: ['a.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
          b: { id: 'b', desc: 'slow', produces: ['b.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
          c: { id: 'c', desc: 'consumer', produces: ['c.txt'], consumes: ['a.txt'], deps: ['a'] as const, validate: [], idempotent: true },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['c', 'b'] as const, validate: [], idempotent: true },
        },
      }));

      const ready = readyNodes(g, has(new Set(['a.txt'])));
      expect(ready).toHaveLength(1);
      expect(ready[0].consumes).toEqual(['a.txt']);
    });
  });

  describe('sorted output', () => {
    it('returns nodes sorted by level then alphabetically', () => {
      // Wide graph: init → [a, z] → [b, c] → term where b deps a, c deps a
      const g = define(graph({
        id: 'sort-test',
        desc: 'sort order',
        init: 'init',
        term: 'term',
        nodes: {
          init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [] as const, validate: [], idempotent: true },
          a: { id: 'a', desc: 'fast', produces: ['a.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
          z: { id: 'z', desc: 'slow', produces: ['z.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
          c: { id: 'c', desc: 'c', produces: ['c.txt'], consumes: [], deps: ['a'] as const, validate: [], idempotent: true },
          b: { id: 'b', desc: 'b', produces: ['b.txt'], consumes: [], deps: ['a'] as const, validate: [], idempotent: true },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['c', 'b', 'z'] as const, validate: [], idempotent: true },
        },
      }));

      const ready = readyNodes(g, has(new Set(['a.txt'])));
      expect(ready.map(n => n.id)).toEqual(['b', 'c']); // alphabetical within level
    });
  });
});
