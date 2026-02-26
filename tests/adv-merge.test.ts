// ADV-MERGE — merge(g1, g2, connections) combines DAGs at join points
//
// Contract: merged graph preserves structure (acyclic, reachable), validates contracts,
// unifies nodes correctly, and maintains partition invariant for orient().
//
// Tests in "core contract" are semantic validations of merge correctness.
// Tests in "boundary" validate edge cases (empty produces, node conflicts, etc.).

import { describe, it, expect } from 'vitest';
import { graph, define, check, verify, order, orient, merge } from '../src/protocol.ts';

describe('ADV-MERGE: merge(g1, g2, connections) combines DAGs', () => {
  it('merges two linear chains via terminal → initial connection', () => {
    // g1: init → work → term
    const g1 = define(graph({
      id: 'phase-1', desc: 'phase 1', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: '', produces: ['phase1.out'], consumes: [], deps: [] },
        work: { id: 'work', desc: '', produces: [],             consumes: [],  deps: ['init'] },
        term: { id: 'term', desc: '', produces: [],             consumes: [], deps: ['work'] },
      },
    }));

    // g2: start → task → done (consumes phase1.out)
    const g2 = define(graph({
      id: 'phase-2', desc: 'phase 2', init: 'start', term: 'done',
      nodes: {
        start: { id: 'start', desc: '', produces: [],                consumes: ['phase1.out'], deps: [] },
        task:  { id: 'task',  desc: '', produces: ['phase2.out'],    consumes: [],           deps: ['start'] },
        done:  { id: 'done',  desc: '', produces: [],                consumes: [],           deps: ['task'] },
      },
    }));

    // Merge at term → start
    const merged = merge(g1, g2, [{ g1Node: 'term', g2Node: 'start', artifact: 'phase1.out' }]);

    expect(merged.id).toBe('phase-1+phase-2');
    expect(merged.init).toBe('init');
    expect(merged.term).toBe('done');
    expect(Object.keys(merged.nodes).sort()).toEqual(['done', 'init', 'start', 'task', 'term', 'work'].sort());
  });

  it('merged graph passes check() — init reaches term, no orphans', () => {
    const g1 = define(graph({
      id: 'g1', desc: '', init: 'a', term: 'b',
      nodes: {
        a: { id: 'a', desc: '', produces: ['x'], consumes: [], deps: [] },
        b: { id: 'b', desc: '', produces: [],   consumes: [], deps: ['a'] },
      },
    }));

    const g2 = define(graph({
      id: 'g2', desc: '', init: 'c', term: 'd',
      nodes: {
        c: { id: 'c', desc: '', produces: [],  consumes: ['x'], deps: [] },
        d: { id: 'd', desc: '', produces: [],  consumes: [],  deps: ['c'] },
      },
    }));

    const merged = merge(g1, g2, [{ g1Node: 'b', g2Node: 'c', artifact: 'x' }]);
    expect(check(merged).done).toBe(true);
  });

  it('merged graph passes verify() — consumes satisfied', () => {
    const g1 = define(graph({
      id: 'g1', desc: '', init: 'a', term: 'b',
      nodes: {
        a: { id: 'a', desc: '', produces: ['file.txt'], consumes: [], deps: [] },
        b: { id: 'b', desc: '', produces: [],           consumes: [], deps: ['a'] },
      },
    }));

    const g2 = define(graph({
      id: 'g2', desc: '', init: 'c', term: 'd',
      nodes: {
        c: { id: 'c', desc: '', produces: [], consumes: ['file.txt'], deps: [] },
        d: { id: 'd', desc: '', produces: [], consumes: [],           deps: ['c'] },
      },
    }));

    const merged = merge(g1, g2, [{ g1Node: 'b', g2Node: 'c', artifact: 'file.txt' }]);
    expect(verify(merged)).toEqual([]);
  });

  it('merged graph order() includes all nodes', () => {
    const g1 = define(graph({
      id: 'g1', desc: '', init: 'init', term: 'mid',
      nodes: {
        init: { id: 'init', desc: '', produces: [], consumes: [], deps: [] },
        mid:  { id: 'mid',  desc: '', produces: [], consumes: [], deps: ['init'] },
      },
    }));

    const g2 = define(graph({
      id: 'g2', desc: '', init: 'post', term: 'end',
      nodes: {
        post: { id: 'post', desc: '', produces: [], consumes: [], deps: [] },
        end:  { id: 'end',  desc: '', produces: [], consumes: [], deps: ['post'] },
      },
    }));

    const merged = merge(g1, g2, [{ g1Node: 'mid', g2Node: 'post', artifact: '' }]);
    expect(order(merged).length).toBe(4);
  });

  it('orient() partition holds on merged graph', () => {
    const g1 = define(graph({
      id: 'g1', desc: '', init: 'a', term: 'b',
      nodes: {
        a: { id: 'a', desc: '', produces: ['a.txt'], consumes: [], deps: [] },
        b: { id: 'b', desc: '', produces: [],        consumes: [], deps: ['a'] },
      },
    }));

    const g2 = define(graph({
      id: 'g2', desc: '', init: 'c', term: 'd',
      nodes: {
        c: { id: 'c', desc: '', produces: ['c.txt'], consumes: [], deps: [] },
        d: { id: 'd', desc: '', produces: [],        consumes: [], deps: ['c'] },
      },
    }));

    const merged = merge(g1, g2, [{ g1Node: 'b', g2Node: 'c', artifact: '' }]);
    const o = orient(merged, () => false);
    const partition = [...o.done, ...o.position, ...o.remaining];
    const ord = order(merged);

    expect(partition.length).toBe(ord.length);
    expect([...partition].sort()).toEqual([...ord].sort());
  });

  it('node ID conflicts require pre-qualification', () => {
    const g1 = define(graph({
      id: 'g1', desc: '', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: '', produces: [], consumes: [], deps: [] },
        term: { id: 'term', desc: '', produces: [], consumes: [], deps: ['init'] },
      },
    }));

    const g2 = define(graph({
      id: 'g2', desc: '', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: '', produces: [], consumes: [], deps: [] },
        term: { id: 'term', desc: '', produces: [], consumes: [], deps: ['init'] },
      },
    }));

    expect(() => merge(g1, g2, [])).toThrow(/Node ID conflicts/);
  });

  it('empty produces in merged graph: gate nodes trivially done', () => {
    // g1: init → gate (produces:[]) → term
    const g1 = define(graph({
      id: 'g1', desc: '', init: 'init', term: 'gate',
      nodes: {
        init: { id: 'init', desc: '', produces: ['seed'], consumes: [], deps: [] },
        gate: { id: 'gate', desc: '', produces: [],      consumes: [], deps: ['init'] },
      },
    }));

    // g2: start → term
    const g2 = define(graph({
      id: 'g2', desc: '', init: 'start', term: 'term',
      nodes: {
        start: { id: 'start', desc: '', produces: [], consumes: [], deps: [] },
        term:  { id: 'term',  desc: '', produces: [], consumes: [], deps: ['start'] },
      },
    }));

    const merged = merge(g1, g2, [{ g1Node: 'gate', g2Node: 'start', artifact: '' }]);
    const o = orient(merged, a => a === 'seed');

    // position should be term (gate is trivially done)
    expect(o.position).toEqual(["term"]);
    expect(o.done).toContain('gate');
  });
});
