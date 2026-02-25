// ADV-ORIENT — adversarial spec: orient() empty-produces stall
//
// Bug (protocol.ts:228): `node.produces.length && node.produces.every(exists)`
// Short-circuits to false when produces=[] — the node is never marked done.
// orient() stalls permanently at any non-terminal node with produces:[].
//
// Contract: A node with produces:[] has no filesystem artifacts to create.
// It is a gate/coordination node. When reached in topo order (deps satisfied),
// it is trivially done. orient() must advance past it.
//
// Fix: `!node.produces.length || node.produces.every(exists)`
//
// Tests in "core contract" FAIL against current implementation, PASS after fix.
// Tests in "boundary" PASS on both (regression guards).

import { describe, it, expect } from 'vitest';
import { graph, define, orient } from '../src/protocol.ts';

// --- Core contract (fail on current, pass after fix) ---

describe('ADV-ORIENT: empty-produces node is trivially done', () => {
  it('advances past non-terminal node with produces:[]', () => {
    // init (produces:['seed']) → mid (produces:[]) → term (produces:[])
    // 'seed' exists. init is done. mid has nothing to produce — it is done.
    // orient() must skip mid and land at term.
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

    const o = orient(g, a => a === 'seed');

    expect(o.position).toBe('term');
    expect(o.done).toContain('init');
    expect(o.done).toContain('mid');
  });

  it('empty-produces node appears in done, not in remaining', () => {
    // Corollary: once advanced past, the node is in done[], not remaining[].
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

    const o = orient(g, a => a === 'seed');

    expect(o.done).toContain('mid');
    expect(o.remaining).not.toContain('mid');
  });

  it('chain of empty-produces nodes: all traversed, lands at term', () => {
    // init → gate-1 (produces:[]) → gate-2 (produces:[]) → term
    // With 'seed' existing, all gates are trivially done.
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

    const o = orient(g, a => a === 'seed');

    expect(o.position).toBe('term');
    expect(o.done).toContain('gate-1');
    expect(o.done).toContain('gate-2');
  });

  it('empty-produces at init: advances immediately to next node', () => {
    // init (produces:[]) → work (produces:['output']) → term
    // Nothing on disk. init has no artifacts → trivially done.
    // Position should be 'work', not 'init'.
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

    const o = orient(g, () => false);

    expect(o.position).toBe('work');
    expect(o.done).toContain('init');
  });

  it('stall occurs at work node (non-empty produces), not at downstream gate', () => {
    // init → work (produces:['output']) → gate (produces:[]) → term
    // 'init.txt' exists but 'output' does not.
    // Position must be 'work' (the actual work), not 'gate'.
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

    const have = new Set(['init.txt']);
    const o = orient(g, a => have.has(a));

    expect(o.position).toBe('work');
  });

  it('gate advances when upstream work completes', () => {
    // Same graph as above, but 'output' now exists.
    // work is done, gate is trivially done, position = term.
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

    const have = new Set(['init.txt', 'output']);
    const o = orient(g, a => have.has(a));

    expect(o.position).toBe('term');
    expect(o.done).toContain('work');
    expect(o.done).toContain('gate');
  });

  // --- Boundary: non-empty produces behavior unchanged (regression guards) ---

  it('node with non-empty produces still stalls when files missing', () => {
    // Regression: fix must not affect nodes that have produces to check.
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

    // 'seed' exists but 'output' does not
    const o = orient(g, a => a === 'seed');

    expect(o.position).toBe('work');
    expect(o.done).toContain('init');
    expect(o.done).not.toContain('work');
  });

  it('node with non-empty produces advances when all files exist', () => {
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

    const o = orient(g, () => true);

    expect(o.position).toBe('term');
    expect(o.done).toContain('init');
    expect(o.done).toContain('work');
  });
});
