// ADV-MERGE — adversarial spec: merge() combines DAGs
// Tests merge, connections, orient on merged graph, gate nodes.

import { describe, it, expect } from 'vitest';
import { graph, define, merge, order, orient, CompletionStore } from '../src/protocol.ts';

describe('ADV-MERGE: merge(g1, g2, connections) combines DAGs', () => {
  it('merged graph contains all nodes from both DAGs', () => {
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
    const ids = Object.keys(merged.nodes);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    expect(ids).toContain('c');
    expect(ids).toContain('d');
  });

  it('merged graph preserves init/term from outer graphs', () => {
    const g1 = define(graph({
      id: 'g1', desc: '', init: 'a', term: 'b',
      nodes: {
        a: { id: 'a', desc: '', produces: [], consumes: [], deps: [] },
        b: { id: 'b', desc: '', produces: [], consumes: [], deps: ['a'] },
      },
    }));

    const g2 = define(graph({
      id: 'g2', desc: '', init: 'c', term: 'd',
      nodes: {
        c: { id: 'c', desc: '', produces: [], consumes: [], deps: [] },
        d: { id: 'd', desc: '', produces: [], consumes: [], deps: ['c'] },
      },
    }));

    const merged = merge(g1, g2, [{ g1Node: 'b', g2Node: 'c', artifact: '' }]);
    expect(merged.init).toBe('a');
    expect(merged.term).toBe('d');
  });

  it('connections can bridge term of g1 to init of g2', () => {
    const g1 = define(graph({
      id: 'g1', desc: '', init: 'a', term: 'mid',
      nodes: {
        a:   { id: 'a',   desc: '', produces: ['x'],   consumes: [], deps: [] },
        mid: { id: 'mid', desc: '', produces: ['mid'], consumes: [], deps: ['a'] },
      },
    }));

    const g2 = define(graph({
      id: 'g2', desc: '', init: 'post', term: 'z',
      nodes: {
        post: { id: 'post', desc: '', produces: ['y'], consumes: [], deps: [] },
        z:    { id: 'z',    desc: '', produces: [],     consumes: [], deps: ['post'] },
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
    const o = orient(merged, CompletionStore.empty());
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

  it('gate nodes with receipts are done in merged graph', () => {
    const g1 = define(graph({
      id: 'g1', desc: '', init: 'init', term: 'gate',
      nodes: {
        init: { id: 'init', desc: '', produces: ['seed'], consumes: [], deps: [] },
        gate: { id: 'gate', desc: '', produces: [],      consumes: [], deps: ['init'] },
      },
    }));

    const g2 = define(graph({
      id: 'g2', desc: '', init: 'start', term: 'term',
      nodes: {
        start: { id: 'start', desc: '', produces: [], consumes: [], deps: [] },
        term:  { id: 'term',  desc: '', produces: [], consumes: [], deps: ['start'] },
      },
    }));

    const merged = merge(g1, g2, [{ g1Node: 'gate', g2Node: 'start', artifact: '' }]);
    const o = orient(merged, CompletionStore.from(['init', 'gate', 'start']));

    expect(o.position).toEqual(["term"]);
    expect(o.done).toContain('gate');
  });
});
