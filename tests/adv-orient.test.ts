// ADV-ORIENT — adversarial spec: orient() receipt-only completion
//
// Receipt-only model: a node is done iff CompletionStore.hasPassing(id).
// No artifact-existence fallback. No implicit legacy mode.
//
// Tests verify that orient() advances correctly through gate nodes
// (produces:[]) when they have receipts, and stalls at work nodes
// that lack receipts.

import { describe, it, expect } from 'vitest';
import { graph, define, orient, CompletionStore } from '../src/protocol.ts';

// --- Core contract: receipt-only completion ---

describe('ADV-ORIENT: receipt-only completion model', () => {
  it('advances past non-terminal node with receipt', () => {
    // init → mid → term. init and mid have receipts → position = term.
    const g = define(graph({
      id: 'gate',
      desc: 'init → gate → term',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: ['seed'], consumes: [], deps: [] },
        mid:  { id: 'mid',  desc: 'gate',  produces: [],       consumes: [], deps: ['init'] },
        term: { id: 'term', desc: 'end',   produces: [],       consumes: [], deps: ['mid'] },
      },
    }));

    const o = orient(g, CompletionStore.from(['init', 'mid']));

    expect(o.position).toEqual(['term']);
    expect(o.done).toContain('init');
    expect(o.done).toContain('mid');
  });

  it('receipt-holding node appears in done, not in remaining', () => {
    const g = define(graph({
      id: 'gate',
      desc: 'init → gate → term',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: ['seed'], consumes: [], deps: [] },
        mid:  { id: 'mid',  desc: 'gate',  produces: [],       consumes: [], deps: ['init'] },
        term: { id: 'term', desc: 'end',   produces: [],       consumes: [], deps: ['mid'] },
      },
    }));

    const o = orient(g, CompletionStore.from(['init', 'mid']));

    expect(o.done).toContain('mid');
    expect(o.remaining).not.toContain('mid');
  });

  it('chain of gate nodes: all done with receipts, lands at term', () => {
    const g = define(graph({
      id: 'gate-chain',
      desc: 'init → gate-1 → gate-2 → term',
      init: 'init',
      term: 'term',
      nodes: {
        init:    { id: 'init',   desc: 'start',  produces: ['seed'], consumes: [], deps: [] },
        'gate-1': { id: 'gate-1', desc: 'gate 1', produces: [],       consumes: [], deps: ['init'] },
        'gate-2': { id: 'gate-2', desc: 'gate 2', produces: [],       consumes: [], deps: ['gate-1'] },
        term:    { id: 'term',   desc: 'end',    produces: [],       consumes: [], deps: ['gate-2'] },
      },
    }));

    const o = orient(g, CompletionStore.from(['init', 'gate-1', 'gate-2']));

    expect(o.position).toEqual(["term"]);
    expect(o.done).toContain('gate-1');
    expect(o.done).toContain('gate-2');
  });

  it('produce-less init with receipt: advances immediately to next node', () => {
    const g = define(graph({
      id: 'empty-init',
      desc: 'init (no artifacts) → work → term',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: [],         consumes: [], deps: [] },
        work: { id: 'work', desc: 'work',  produces: ['output'], consumes: [], deps: ['init'] },
        term: { id: 'term', desc: 'end',   produces: [],         consumes: [], deps: ['work'] },
      },
    }));

    const o = orient(g, CompletionStore.from(['init']));

    expect(o.position).toEqual(["work"]);
    expect(o.done).toContain('init');
  });

  it('stall occurs at work node without receipt, not at downstream gate', () => {
    const g = define(graph({
      id: 'work-then-gate',
      desc: 'init → work → gate → term',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: ['init.txt'], consumes: [],        deps: [] },
        work: { id: 'work', desc: 'work',  produces: ['output'],   consumes: [],        deps: ['init'] },
        gate: { id: 'gate', desc: 'gate',  produces: [],           consumes: ['output'], deps: ['work'] },
        term: { id: 'term', desc: 'end',   produces: [],           consumes: [],        deps: ['gate'] },
      },
    }));

    const o = orient(g, CompletionStore.from(['init']));

    expect(o.position).toEqual(["work"]);
  });

  it('gate advances when upstream work has receipt', () => {
    const g = define(graph({
      id: 'work-then-gate',
      desc: 'init → work → gate → term',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: ['init.txt'], consumes: [],        deps: [] },
        work: { id: 'work', desc: 'work',  produces: ['output'],   consumes: [],        deps: ['init'] },
        gate: { id: 'gate', desc: 'gate',  produces: [],           consumes: ['output'], deps: ['work'] },
        term: { id: 'term', desc: 'end',   produces: [],           consumes: [],        deps: ['gate'] },
      },
    }));

    const o = orient(g, CompletionStore.from(['init', 'work', 'gate']));

    expect(o.position).toEqual(["term"]);
    expect(o.done).toContain('work');
    expect(o.done).toContain('gate');
  });

  // --- Boundary: regression guards ---

  it('node without receipt stalls even if it has produces', () => {
    const g = define(graph({
      id: 'normal',
      desc: 'init → work → term',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: ['seed'],   consumes: [], deps: [] },
        work: { id: 'work', desc: 'work',  produces: ['output'], consumes: [], deps: ['init'] },
        term: { id: 'term', desc: 'end',   produces: [],         consumes: [], deps: ['work'] },
      },
    }));

    const o = orient(g, CompletionStore.from(['init']));

    expect(o.position).toEqual(["work"]);
    expect(o.done).toContain('init');
    expect(o.done).not.toContain('work');
  });

  it('all nodes with receipts advances to term', () => {
    const g = define(graph({
      id: 'normal',
      desc: 'init → work → term',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: ['seed'],   consumes: [], deps: [] },
        work: { id: 'work', desc: 'work',  produces: ['output'], consumes: [], deps: ['init'] },
        term: { id: 'term', desc: 'end',   produces: [],         consumes: [], deps: ['work'] },
      },
    }));

    const o = orient(g, CompletionStore.from(['init', 'work']));

    expect(o.position).toEqual(["term"]);
    expect(o.done).toContain('init');
    expect(o.done).toContain('work');
  });
});
