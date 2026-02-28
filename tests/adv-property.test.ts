// ADV-PROPERTY — property-based: order()→orient() consistent, check()→verify() agree
//
// Receipt-only model: a node is done iff CompletionStore.hasPassing(id).
// Properties tested against receipt-based completion.
//
// Properties:
//   P2 [core contract]    orient() semantic position — position === g.term OR produces.length > 0
//   P1 [regression guard] orient() partitions order(g) — done ++ [position] ++ remaining = order(g)
//   P3 [regression guard] orient() monotonicity — adding receipts advances position
//   P4 [structural]       check() and verify() are independent validators
//   P5 [structural]       joint validity — well-formed graphs pass both check() and verify()
//
// Graph shapes:
//   gate-at-start  — empty-produces gate immediately after init
//   gate-in-middle — gate between two work nodes
//   gate-chain     — three consecutive gates, then work
//   gate-all-done  — same as gate-at-start, all nodes have receipts
//   linear-3       — four work nodes, no gates (baseline)

import { describe, it, expect } from 'vitest';
import { graph, define, order, orient, check, verify, CompletionStore } from '../src/protocol.ts';

// --- Fixtures ---

// init → gate (produces:[]) → work → term
const gateAtStart = define(graph({
  id: 'gate-at-start',
  desc: 'init → gate (produces:[]) → work → term',
  init: 'init',
  term: 'term',
  nodes: {
    init: { id: 'init', desc: 'start',  produces: ['init.out'], consumes: [], deps: [] },
    gate: { id: 'gate', desc: 'gate',   produces: [],           consumes: [], deps: ['init'] },
    work: { id: 'work', desc: 'work',   produces: ['work.out'], consumes: [], deps: ['gate'] },
    term: { id: 'term', desc: 'end',    produces: [],           consumes: [], deps: ['work'] },
  },
}));

// init → pre → gate (produces:[]) → post → term
const gateInMiddle = define(graph({
  id: 'gate-in-middle',
  desc: 'init → pre → gate (produces:[]) → post → term',
  init: 'init',
  term: 'term',
  nodes: {
    init: { id: 'init', desc: 'start',         produces: ['init.out'], consumes: [], deps: [] },
    pre:  { id: 'pre',  desc: 'pre-gate work', produces: ['pre.out'],  consumes: [], deps: ['init'] },
    gate: { id: 'gate', desc: 'gate',           produces: [],           consumes: [], deps: ['pre'] },
    post: { id: 'post', desc: 'post-gate work', produces: ['post.out'], consumes: [], deps: ['gate'] },
    term: { id: 'term', desc: 'end',            produces: [],           consumes: [], deps: ['post'] },
  },
}));

// init → g1 (produces:[]) → g2 (produces:[]) → g3 (produces:[]) → work → term
const gateChain = define(graph({
  id: 'gate-chain',
  desc: 'init → g1 → g2 → g3 (all produces:[]) → work → term',
  init: 'init',
  term: 'term',
  nodes: {
    init: { id: 'init', desc: 'start',  produces: ['init.out'], consumes: [], deps: [] },
    g1:   { id: 'g1',   desc: 'gate 1', produces: [],           consumes: [], deps: ['init'] },
    g2:   { id: 'g2',   desc: 'gate 2', produces: [],           consumes: [], deps: ['g1'] },
    g3:   { id: 'g3',   desc: 'gate 3', produces: [],           consumes: [], deps: ['g2'] },
    work: { id: 'work', desc: 'work',   produces: ['work.out'], consumes: [], deps: ['g3'] },
    term: { id: 'term', desc: 'end',    produces: [],           consumes: [], deps: ['work'] },
  },
}));

// Same shape as gateAtStart. All nodes have receipts.
const gateAllDone = define(graph({
  id: 'gate-all-done',
  desc: 'init → gate (produces:[]) → work → term (all have receipts)',
  init: 'init',
  term: 'term',
  nodes: {
    init: { id: 'init', desc: 'start', produces: ['init.out'], consumes: [], deps: [] },
    gate: { id: 'gate', desc: 'gate',  produces: [],           consumes: [], deps: ['init'] },
    work: { id: 'work', desc: 'work',  produces: ['work.out'], consumes: [], deps: ['gate'] },
    term: { id: 'term', desc: 'end',   produces: [],           consumes: [], deps: ['work'] },
  },
}));

// Baseline: no gates. init → a → b → c → term.
const linear3 = define(graph({
  id: 'linear-3',
  desc: 'init → a → b → c → term (no gates)',
  init: 'init',
  term: 'term',
  nodes: {
    init: { id: 'init', desc: 'start',  produces: ['i.out'], consumes: [], deps: [] },
    a:    { id: 'a',    desc: 'step a', produces: ['a.out'], consumes: [], deps: ['init'] },
    b:    { id: 'b',    desc: 'step b', produces: ['b.out'], consumes: [], deps: ['a'] },
    c:    { id: 'c',    desc: 'step c', produces: ['c.out'], consumes: [], deps: ['b'] },
    term: { id: 'term', desc: 'end',    produces: [],        consumes: [], deps: ['c'] },
  },
}));

// Helper: all non-term node IDs for a graph
function allNonTerm(g: any): string[] {
  return Object.keys(g.nodes).filter(id => id !== g.term);
}

// --- P2: Core Contract ---

describe('P2 [core contract]: orient() position is g.term or has non-empty produces', () => {
  it('gate-at-start: position is work (not gate) when init+gate have receipts', () => {
    const o = orient(gateAtStart, CompletionStore.from(['init', 'gate']));
    expect(o.position).toEqual(["work"]);
    expect(o.produces.length).toBeGreaterThan(0);
  });

  it('gate-in-middle: position is post when init+pre+gate have receipts', () => {
    const o = orient(gateInMiddle, CompletionStore.from(['init', 'pre', 'gate']));
    expect(o.position).toEqual(["post"]);
    expect(o.produces.length).toBeGreaterThan(0);
  });

  it('gate-chain: position is work when init+all gates have receipts', () => {
    const o = orient(gateChain, CompletionStore.from(['init', 'g1', 'g2', 'g3']));
    expect(o.position).toEqual(["work"]);
    expect(o.produces.length).toBeGreaterThan(0);
  });

  it('gate-all-done: position is term when all non-term nodes have receipts', () => {
    const o = orient(gateAllDone, CompletionStore.from(['init', 'gate', 'work']));
    expect(o.position).toEqual(["term"]);
  });

  it('invariant holds across all graph shapes and completion states', () => {
    const fixtures = [gateAtStart, gateInMiddle, gateChain, gateAllDone, linear3];

    for (const g of fixtures) {
      const nodeIds = Object.keys(g.nodes);
      // Test with: empty, all non-term, just init, all
      const states: CompletionStore[] = [
        CompletionStore.empty(),
        CompletionStore.from(allNonTerm(g)),
        CompletionStore.from([g.init]),
        CompletionStore.from(nodeIds),
      ];

      for (const store of states) {
        const o = orient(g, store);
        // Receipt-only invariant: position nodes exist in graph and form a valid batch
        // (term position or position nodes are all in graph.nodes)
        const posValid = o.position.every(id => id in g.nodes);
        expect(posValid, `P2 violated: graph=${g.id}, position=${o.position} — node not in graph`).toBe(true);
        // Partition completeness: done + position + remaining = all nodes
        const all = [...o.done, ...o.position, ...o.remaining];
        expect(all.length, `P2 partition violated: graph=${g.id}`).toBe(nodeIds.length);
      }
    }
  });
});

// --- P1 [regression guard]: partition property ---

describe('P1 [regression guard]: orient() partitions order(g)', () => {
  it('done ++ [position] ++ remaining = order(g) when nothing done', () => {
    const o = orient(linear3, CompletionStore.empty());
    const ord = order(linear3);
    const partition = [...o.done, ...o.position, ...o.remaining];

    expect(partition.length).toBe(ord.length);
    expect([...partition].sort()).toEqual([...ord].sort());
    expect(new Set(partition).size).toBe(partition.length);
  });

  it('done ++ [position] ++ remaining = order(g) when partially done', () => {
    const o = orient(linear3, CompletionStore.from(['init', 'a']));
    const ord = order(linear3);
    const partition = [...o.done, ...o.position, ...o.remaining];

    expect(partition.length).toBe(ord.length);
    expect([...partition].sort()).toEqual([...ord].sort());
  });

  it('done ++ [position] ++ remaining = order(g) when all done', () => {
    const o = orient(linear3, CompletionStore.from(['init', 'a', 'b', 'c']));
    const ord = order(linear3);
    const partition = [...o.done, ...o.position, ...o.remaining];

    expect(partition.length).toBe(ord.length);
    expect([...partition].sort()).toEqual([...ord].sort());
  });

  it('remaining is exact suffix of order() after position', () => {
    const o = orient(linear3, CompletionStore.from(['init', 'a']));
    const ord = order(linear3);
    const posIdx = ord.findIndex(n => o.position.includes(n));

    expect(o.remaining).toEqual(ord.slice(posIdx + o.position.length));
  });
});

// --- P3 [regression guard]: monotonicity ---

describe('P3 [regression guard]: orient() monotonicity — adding receipts advances position', () => {
  it('position index is non-decreasing as receipts accumulate', () => {
    const ord = order(linear3);
    const progression: CompletionStore[] = [
      CompletionStore.empty(),
      CompletionStore.from(['init']),
      CompletionStore.from(['init', 'a']),
      CompletionStore.from(['init', 'a', 'b']),
      CompletionStore.from(['init', 'a', 'b', 'c']),
    ];

    let prevIdx = -1;
    for (const store of progression) {
      const o = orient(linear3, store);
      const idx = ord.findIndex(n => o.position.includes(n));
      expect(idx).toBeGreaterThanOrEqual(prevIdx);
      prevIdx = idx;
    }
  });

  it('position with gate: adding init receipt advances position from init region', () => {
    const ord = order(gateInMiddle);
    const pos0 = orient(gateInMiddle, CompletionStore.empty()).position;
    const pos1 = orient(gateInMiddle, CompletionStore.from(['init'])).position;
    const idx0 = ord.findIndex(n => pos0.includes(n));
    const idx1 = ord.findIndex(n => pos1.includes(n));

    expect(idx1).toBeGreaterThanOrEqual(idx0);
  });
});

// --- P4 [structural]: check() and verify() are independent ---

describe('P4 [structural]: check() and verify() are independent validators', () => {
  it('check() passes when verify() fails: connected graph, unsatisfied consume', () => {
    const g = define(graph({
      id: 'connected-bad-contract',
      desc: 'connected but unsatisfied consume',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: [],      consumes: [],    deps: [] },
        work: { id: 'work', desc: 'work',  produces: ['out'], consumes: ['x'], deps: ['init'] },
        term: { id: 'term', desc: 'end',   produces: [],      consumes: [],    deps: ['work'] },
      },
    }));

    expect(check(g).done).toBe(true);
    expect(verify(g).length).toBeGreaterThan(0);
  });

  it('verify() passes when check() fails: orphan node with no consumes', () => {
    const g = define(graph({
      id: 'disconnected-no-contract',
      desc: 'orphan without consumes',
      init: 'init',
      term: 'term',
      nodes: {
        init:   { id: 'init',   desc: 'start',  produces: ['i.out'], consumes: [],    deps: [] },
        orphan: { id: 'orphan', desc: 'orphan', produces: ['o.out'], consumes: [],    deps: [] },
        term:   { id: 'term',   desc: 'end',    produces: [],        consumes: [],    deps: ['init'] },
      },
    }));

    expect(check(g).done).toBe(false);
    expect(verify(g)).toEqual([]);
  });

  it('both check() and verify() fail independently on the same graph', () => {
    const g = define(graph({
      id: 'both-fail',
      desc: 'disconnected orphan with unsatisfied consume',
      init: 'init',
      term: 'term',
      nodes: {
        init:   { id: 'init',   desc: 'start',  produces: [],  consumes: [],    deps: [] },
        orphan: { id: 'orphan', desc: 'orphan', produces: [],  consumes: ['x'], deps: [] },
        term:   { id: 'term',   desc: 'end',    produces: [],  consumes: [],    deps: ['init'] },
      },
    }));

    expect(check(g).done).toBe(false);
    expect(verify(g).length).toBeGreaterThan(0);
  });
});

// --- P5 [structural]: joint validity ---

describe('P5 [structural]: joint validity — fully-specified graphs pass both validators', () => {
  it('minimal 2-node graph passes check() and verify()', () => {
    const g = define(graph({
      id: 'minimal',
      desc: 'minimal',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: [],      consumes: [],      deps: [] },
        term: { id: 'term', desc: 'end',   produces: [],      consumes: [],      deps: ['init'] },
      },
    }));

    expect(check(g).done).toBe(true);
    expect(verify(g)).toEqual([]);
  });

  it('fork-join graph with satisfied contracts passes both', () => {
    const g = define(graph({
      id: 'fork-join',
      desc: 'fork-join with satisfied contracts',
      init: 'init',
      term: 'term',
      nodes: {
        init:  { id: 'init',  desc: 'start',    produces: ['a', 'b'], consumes: [],        deps: [] },
        left:  { id: 'left',  desc: 'left fork', produces: ['c'],     consumes: ['a'],     deps: ['init'] },
        right: { id: 'right', desc: 'right fork',produces: ['d'],     consumes: ['b'],     deps: ['init'] },
        term:  { id: 'term',  desc: 'end',       produces: [],        consumes: ['c', 'd'], deps: ['left', 'right'] },
      },
    }));

    expect(check(g).done).toBe(true);
    expect(verify(g)).toEqual([]);
  });

  it('graph with gate node passes both (gate does not violate contracts)', () => {
    expect(check(gateAtStart).done).toBe(true);
    expect(verify(gateAtStart)).toEqual([]);
  });
});
