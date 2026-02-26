import { describe, it, expect } from 'vitest';
import { graph, define, criticalPath } from '../src/protocol.ts';

describe('criticalPath: longest path from init to term', () => {
  it('linear graph — path is all nodes', () => {
    const g = define(graph({
      id: 'linear',
      desc: 'a → b → c → term',
      init: 'a',
      term: 'term',
      nodes: {
        a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: [] as const, validate: [], idempotent: true },
        b: { id: 'b', desc: 'b', produces: ['b.txt'], consumes: [], deps: ['a'] as const, validate: [], idempotent: true },
        c: { id: 'c', desc: 'c', produces: ['c.txt'], consumes: [], deps: ['b'] as const, validate: [], idempotent: true },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['c'] as const, validate: [], idempotent: true },
      },
    }));

    expect(criticalPath(g)).toEqual(['a', 'b', 'c', 'term']);
  });

  it('diamond — picks longest branch', () => {
    // init → [a, b] → term. Both same length, picks one.
    const g = define(graph({
      id: 'diamond',
      desc: 'diamond',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [] as const, validate: [], idempotent: true },
        a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
        b: { id: 'b', desc: 'b', produces: ['b.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a', 'b'] as const, validate: [], idempotent: true },
      },
    }));

    const cp = criticalPath(g);
    expect(cp.length).toBe(3); // init → (a or b) → term
    expect(cp[0]).toBe('init');
    expect(cp[cp.length - 1]).toBe('term');
  });

  it('uneven branches — picks longer one', () => {
    // init → a → b → term (length 4)
    // init → c → term (length 3)
    const g = define(graph({
      id: 'uneven',
      desc: 'uneven branches',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [] as const, validate: [], idempotent: true },
        a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
        b: { id: 'b', desc: 'b', produces: ['b.txt'], consumes: [], deps: ['a'] as const, validate: [], idempotent: true },
        c: { id: 'c', desc: 'c', produces: ['c.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['b', 'c'] as const, validate: [], idempotent: true },
      },
    }));

    const cp = criticalPath(g);
    expect(cp).toEqual(['init', 'a', 'b', 'term']);
  });

  it('starts at init and ends at term', () => {
    const g = define(graph({
      id: 'simple',
      desc: 'simple',
      init: 'a',
      term: 'z',
      nodes: {
        a: { id: 'a', desc: 'start', produces: ['a.txt'], consumes: [], deps: [] as const, validate: [], idempotent: true },
        z: { id: 'z', desc: 'end', produces: [], consumes: [], deps: ['a'] as const, validate: [], idempotent: true },
      },
    }));

    const cp = criticalPath(g);
    expect(cp[0]).toBe('a');
    expect(cp[cp.length - 1]).toBe('z');
  });

  it('wide parallel batch does not inflate path length', () => {
    // init → [a, b, c, d, e] → term
    // All 5 nodes at same level. Critical path = 3 (init → any → term).
    const g = define(graph({
      id: 'wide',
      desc: 'wide batch',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [] as const, validate: [], idempotent: true },
        a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
        b: { id: 'b', desc: 'b', produces: ['b.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
        c: { id: 'c', desc: 'c', produces: ['c.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
        d: { id: 'd', desc: 'd', produces: ['d.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
        e: { id: 'e', desc: 'e', produces: ['e.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a', 'b', 'c', 'd', 'e'] as const, validate: [], idempotent: true },
      },
    }));

    const cp = criticalPath(g);
    expect(cp.length).toBe(3); // init → one node → term
  });

  it('multi-merge picks the path through deepest chain', () => {
    // init → a → b → d → term (4 hops)
    // init → c → d → term (3 hops)
    const g = define(graph({
      id: 'merge',
      desc: 'merge point',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [] as const, validate: [], idempotent: true },
        a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
        b: { id: 'b', desc: 'b', produces: ['b.txt'], consumes: [], deps: ['a'] as const, validate: [], idempotent: true },
        c: { id: 'c', desc: 'c', produces: ['c.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
        d: { id: 'd', desc: 'd', produces: ['d.txt'], consumes: [], deps: ['b', 'c'] as const, validate: [], idempotent: true },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['d'] as const, validate: [], idempotent: true },
      },
    }));

    const cp = criticalPath(g);
    expect(cp).toEqual(['init', 'a', 'b', 'd', 'term']);
  });
});
