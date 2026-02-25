// ADV-RECONCILE — adversarial spec: reconcile() gap.missing semantics
//
// Contract: gap.missing = bn.consumes not satisfied by fn.produces (unmet demand only).
//
// Bug (protocol.ts:171-175): missing = symmetric difference of produces ∪ consumes.
//   Current: [...fn.produces.filter(p => !bn.consumes.includes(p)),   // surplus — WRONG
//             ...bn.consumes.filter(c => !fn.produces.includes(c))]    // unmet — correct
//
// Fix:      missing = bn.consumes.filter(c => !fn.produces.includes(c))
//
// Semantics: missing[i] is an artifact that a new intermediate node must produce to
// close the gap. Surplus forward produces are already supplied — not actionable work.
//
// Tests in "core contract" FAIL against current implementation, PASS after fix.
// Tests in "boundary" PASS on both (regression guards).

import { describe, it, expect } from 'vitest';
import { graph, define, reconcile } from '../src/protocol.ts';

// Minimal directed probe: fwd → bwd. reconcile called as (forward=[fwd], backward=[bwd]).
// define() validates structure only — verify() failures are intentional in gap probes.
function probe(fwdProduces: string[], bwdConsumes: string[]) {
  return define(graph({
    id: 'probe',
    desc: 'adv-reconcile probe',
    init: 'fwd',
    term: 'bwd',
    nodes: {
      fwd: { id: 'fwd', desc: 'forward', produces: fwdProduces, consumes: [], deps: [] },
      bwd: { id: 'bwd', desc: 'backward', produces: [], consumes: bwdConsumes, deps: ['fwd'] },
    },
  }));
}

// --- Core contract (fail on current, pass after fix) ---

describe('ADV-RECONCILE: gap.missing = unmet consumes only', () => {
  it('surplus forward produces do not appear in missing', () => {
    // F produces ['x'], B consumes ['y']. No overlap → gap.
    // 'x' is surplus: F provides it but B does not need it. Not a work item.
    // 'y' is unmet: B requires it, F cannot provide it. The gap.
    const g = probe(['x'], ['y']);
    const { gaps } = reconcile(g, ['fwd'], ['bwd']);

    expect(gaps.length).toBe(1);
    expect(gaps[0].missing).toContain('y');       // unmet demand: present
    expect(gaps[0].missing).not.toContain('x');   // surplus produce: absent
  });

  it('missing.length equals unmet consume count, not size of symmetric difference', () => {
    // F produces ['p', 'q'], B consumes ['r', 's']. No overlap.
    // Correct missing length: 2 (just ['r', 's']).
    // Buggy missing length:   4 (['p', 'q', 'r', 's']).
    const g = probe(['p', 'q'], ['r', 's']);
    const { gaps } = reconcile(g, ['fwd'], ['bwd']);

    expect(gaps.length).toBe(1);
    expect(gaps[0].missing.length).toBe(2);
    expect([...gaps[0].missing].sort()).toEqual(['r', 's']);
  });

  it('many surplus produces, one unmet consume: missing = [unmet] only', () => {
    // F produces ['a', 'b', 'c'], B consumes ['d'].
    // Correct missing: ['d'].
    // Buggy missing:   ['a', 'b', 'c', 'd'].
    const g = probe(['a', 'b', 'c'], ['d']);
    const { gaps } = reconcile(g, ['fwd'], ['bwd']);

    expect(gaps.length).toBe(1);
    expect(gaps[0].missing).toEqual(['d']);
  });

  it('no forward produces: missing = all backward consumes exactly', () => {
    // F produces [], B consumes ['x', 'y'].
    // No surplus possible. missing must equal bwdConsumes exactly.
    const g = probe([], ['x', 'y']);
    const { gaps } = reconcile(g, ['fwd'], ['bwd']);

    expect(gaps.length).toBe(1);
    expect([...gaps[0].missing].sort()).toEqual(['x', 'y']);
  });

  it('missing is the actionable work set: each entry must be produced to close the gap', () => {
    // Semantic invariant: every artifact in missing is something a new bridging node
    // must produce. Surplus produces are already available — inserting them into missing
    // generates phantom work items that cannot close the actual gap.
    const g = probe(['already-provided'], ['still-needed']);
    const { gaps } = reconcile(g, ['fwd'], ['bwd']);

    expect(gaps[0].missing).toEqual(['still-needed']);
  });

  // --- Boundary: connection path unaffected by fix (regression guards) ---

  it('full overlap: connection recorded, no gap, no surplus issue', () => {
    // F produces ['x'], B consumes ['x']. Shared → connection only.
    const g = probe(['x'], ['x']);
    const { connections, gaps } = reconcile(g, ['fwd'], ['bwd']);

    expect(connections).toEqual([{ forward: 'fwd', backward: 'bwd', artifact: 'x' }]);
    expect(gaps).toEqual([]);
  });

  it('surplus produces do not bleed into connection artifacts', () => {
    // F produces ['x', 'extra'], B consumes ['x']. 'x' shared → connection.
    // 'extra' is surplus: not in connections, not actionable.
    const g = probe(['x', 'extra'], ['x']);
    const { connections, gaps } = reconcile(g, ['fwd'], ['bwd']);

    expect(connections.length).toBe(1);
    expect(connections[0].artifact).toBe('x');
    expect(gaps).toEqual([]);
  });

  it('between.nodes identifies the pair with the gap, not affected by surplus', () => {
    const g = probe(['noise-1', 'noise-2'], ['actual-need']);
    const { gaps } = reconcile(g, ['fwd'], ['bwd']);

    expect(gaps[0].between).toEqual(['fwd', 'bwd']);
    expect(gaps[0].missing).toEqual(['actual-need']);
  });
});
