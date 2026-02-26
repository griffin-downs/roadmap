// ADV-PROPERTY — property-based: order()→orient() consistent, check()→verify() agree
//
// Bug (protocol.ts:228): `node.produces.length && node.produces.every(exists)`
// Short-circuits to false for empty-produces nodes — orient() stalls at non-terminal
// gate nodes indefinitely. A gate (produces:[]) that is trivially done becomes position.
//
// Properties:
//   P2 [core contract]    orient() semantic position — position === g.term OR produces.length > 0
//   P1 [regression guard] orient() partitions order(g) — done ++ [position] ++ remaining = order(g)
//   P3 [regression guard] orient() monotonicity — S ⊆ S' → topo_idx(pos(S)) ≤ topo_idx(pos(S'))
//   P4 [structural]       check() and verify() are independent validators
//   P5 [structural]       joint validity — well-formed graphs pass both check() and verify()
//
// Tests in "P2: core contract" FAIL against current implementation, PASS after fix.
// Tests in "P1, P3, P4, P5" PASS on both implementations (regression guards / structural).
//
// Graph shapes:
//   gate-at-start  — empty-produces gate immediately after init
//   gate-in-middle — gate between two work nodes
//   gate-chain     — three consecutive gates, then work
//   gate-all-done  — same as gate-at-start, all artifacts present
//   linear-3       — four work nodes, no gates (baseline)

import { describe, it, expect } from 'vitest';
import { graph, define, order, orient, check, verify } from '../src/protocol.ts';

// --- Fixtures ---

// init → gate (produces:[]) → work → term
// With 'init.out' existing: gate is trivially done, position should advance to 'work'.
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

// Same shape as gateAtStart. When both 'init.out' and 'work.out' exist, all nodes are done.
// Current impl: stalls at gate. Fixed: position = term.
const gateAllDone = define(graph({
  id: 'gate-all-done',
  desc: 'init → gate (produces:[]) → work → term (all artifacts present)',
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

// --- P2: Core Contract (FAIL on current, PASS after fix) ---

describe('P2 [core contract]: orient() position is g.term or has non-empty produces', () => {
  it('gate-at-start: position is work (not gate) when init.out exists', () => {
    // gate.produces=[] — trivially done once init is done.
    // Current: stalls at gate (produces:[]) → P2 violated.
    // Fixed:   skips gate, position = work (produces: ['work.out']).
    const o = orient(gateAtStart, a => a === 'init.out');

    expect(o.position).toEqual(["work"]);
    expect(o.produces.length).toBeGreaterThan(0);
  });

  it('gate-in-middle: position is post (not gate) when pre-gate work is done', () => {
    const have = new Set(['init.out', 'pre.out']);
    const o = orient(gateInMiddle, a => have.has(a));

    expect(o.position).toEqual(["post"]);
    expect(o.produces.length).toBeGreaterThan(0);
  });

  it('gate-chain: position is work (not any gate) when only init.out exists', () => {
    // Three consecutive gates are all trivially done. Should land at work.
    const o = orient(gateChain, a => a === 'init.out');

    expect(o.position).toEqual(["work"]);
    expect(o.produces.length).toBeGreaterThan(0);
  });

  it('gate-all-done: position is term when all artifacts exist', () => {
    // All produces are on disk. All non-terminal nodes done. Position must be term.
    // Current: stalls at gate.
    // Fixed:   gate trivially done, work done, position = term.
    const have = new Set(['init.out', 'work.out']);
    const o = orient(gateAllDone, a => have.has(a));

    expect(o.position).toEqual(["term"]);
  });

  it('invariant holds across all graph shapes and filesystem states', () => {
    // Universal: for every fixture × every state, P2 holds.
    const fixtures = [gateAtStart, gateInMiddle, gateChain, gateAllDone, linear3];
    const states = [
      () => false,
      () => true,
      (a: string) => a.includes('init'),
      (a: string) => a.includes('work') || a.includes('init'),
    ];

    for (const g of fixtures) {
      for (const exists of states) {
        const o = orient(g, exists);
        const p2 = o.position[0] === g.term || JSON.stringify(o.position) === JSON.stringify([g.term]) || o.produces.length > 0;
        expect(p2, `P2 violated: graph=${g.id}, position=${o.position}`).toBe(true);
      }
    }
  });
});

// --- P1 [regression guard]: partition property ---

describe('P1 [regression guard]: orient() partitions order(g)', () => {
  it('done ++ [position] ++ remaining = order(g) when nothing exists', () => {
    const o = orient(linear3, () => false);
    const ord = order(linear3);
    const partition = [...o.done, ...o.position, ...o.remaining];

    expect(partition.length).toBe(ord.length);
    expect([...partition].sort()).toEqual([...ord].sort());
    expect(new Set(partition).size).toBe(partition.length);
  });

  it('done ++ [position] ++ remaining = order(g) when partially done', () => {
    const have = new Set(['i.out', 'a.out']);
    const o = orient(linear3, a => have.has(a));
    const ord = order(linear3);
    const partition = [...o.done, ...o.position, ...o.remaining];

    expect(partition.length).toBe(ord.length);
    expect([...partition].sort()).toEqual([...ord].sort());
  });

  it('done ++ [position] ++ remaining = order(g) when all exist', () => {
    const o = orient(linear3, () => true);
    const ord = order(linear3);
    const partition = [...o.done, ...o.position, ...o.remaining];

    expect(partition.length).toBe(ord.length);
    expect([...partition].sort()).toEqual([...ord].sort());
  });

  it('remaining is exact suffix of order() after position', () => {
    const have = new Set(['i.out', 'a.out']);
    const o = orient(linear3, a => have.has(a));
    const ord = order(linear3);
    const posIdx = ord.findIndex(n => o.position.includes(n));

    expect(o.remaining).toEqual(ord.slice(posIdx + o.position.length));
  });
});

// --- P3 [regression guard]: monotonicity ---

describe('P3 [regression guard]: orient() monotonicity — adding files advances position', () => {
  it('position index is non-decreasing as artifacts accumulate', () => {
    const ord = order(linear3);
    const progression = [
      new Set<string>([]),
      new Set(['i.out']),
      new Set(['i.out', 'a.out']),
      new Set(['i.out', 'a.out', 'b.out']),
      new Set(['i.out', 'a.out', 'b.out', 'c.out']),
    ];

    let prevIdx = -1;
    for (const have of progression) {
      const o = orient(linear3, a => have.has(a));
      const idx = ord.findIndex(n => o.position.includes(n));
      expect(idx).toBeGreaterThanOrEqual(prevIdx);
      prevIdx = idx;
    }
  });

  it('position with gate: adding pre-gate artifact advances position from init region', () => {
    const ord = order(gateInMiddle);
    const pos0 = orient(gateInMiddle, () => false).position;
    const pos1 = orient(gateInMiddle, a => a === 'init.out').position;
    const idx0 = ord.findIndex(n => pos0.includes(n));
    const idx1 = ord.findIndex(n => pos1.includes(n));

    expect(idx1).toBeGreaterThanOrEqual(idx0);
  });
});

// --- P4 [structural]: check() and verify() are independent ---

describe('P4 [structural]: check() and verify() are independent validators', () => {
  it('check() passes when verify() fails: connected graph, unsatisfied consume', () => {
    // Structural path init → work → term is intact (check passes).
    // work.consumes=['x'] but no predecessor produces 'x' (verify fails).
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
    // orphan has deps:[] and nothing points to it — unreachable from init, cannot reach term.
    // check() fails. verify() passes because orphan has no consumes to violate.
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
    // Orphan with unsatisfied consume: disconnected AND bad contract.
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
    // init produces ['a', 'b']; two parallel branches consume one each; term joins both.
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
