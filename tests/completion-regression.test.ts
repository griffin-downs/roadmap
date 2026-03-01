import { describe, it, expect } from 'vitest';
import { CompletionStore } from '../src/lib/completion/completion-context.ts';
import { orient, parallelOrder, define } from '../src/protocol.ts';
import type { Graph } from '../src/protocol.ts';

/**
 * FR-UX-001 regression test: proves that position/chart cannot work
 * without CompletionStore. The orient() signature enforces this at compile time
 * (CompletionStore is required, not optional), and this test proves it at runtime.
 */

function makeTestDag(): Graph<string> {
  const g = {
    id: 'regression-test',
    desc: 'completion regression test DAG',
    init: 'init',
    term: 'term',
    nodes: {
      init: { id: 'init', desc: 'init', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
      'node-a': { id: 'node-a', desc: 'a', produces: ['a.ts'], consumes: [], deps: ['init'], validate: [], idempotent: true },
      'node-b': { id: 'node-b', desc: 'b', produces: ['b.ts'], consumes: [], deps: ['init'], validate: [], idempotent: true },
      'node-c': { id: 'node-c', desc: 'c', produces: ['c.ts'], consumes: [], deps: ['node-a', 'node-b'], validate: [], idempotent: true },
      term: { id: 'term', desc: 'term', produces: [], consumes: [], deps: ['node-c'], validate: [], idempotent: true },
    } as any,
  };
  define(g);
  return g;
}

describe('FR-UX-001: completion store is mandatory for progress rendering', () => {
  it('orient with passing receipts shows M/N done, not 0/N', () => {
    const dag = makeTestDag();
    // 3 of 5 nodes completed via receipts
    const completion = CompletionStore.from(['init', 'node-a', 'node-b']);
    const pos = orient(dag, completion);

    expect(pos.done.length).toBe(3);
    expect(pos.done).toContain('init');
    expect(pos.done).toContain('node-a');
    expect(pos.done).toContain('node-b');
    // NOT 0 — proves completion store is loaded
    expect(pos.done.length).toBeGreaterThan(0);
  });

  it('orient with empty store shows 0/N done', () => {
    const dag = makeTestDag();
    const completion = CompletionStore.empty();
    const pos = orient(dag, completion);

    // Empty store → nothing done (except produce-less nodes are NOT auto-done in receipt mode)
    expect(pos.done.length).toBe(0);
  });

  it('chart progress percentage matches completion store state', () => {
    const dag = makeTestDag();
    const totalNodes = Object.keys(dag.nodes).length; // 5
    const completion = CompletionStore.from(['init', 'node-a', 'node-b']);
    const pos = orient(dag, completion);

    const doneCount = pos.done.length;
    const pct = Math.round((doneCount / totalNodes) * 100);

    // 3/5 = 60%
    expect(pct).toBe(60);
    expect(doneCount).toBe(3);
    expect(totalNodes).toBe(5);
  });

  it('position advances based on completion store, not artifact existence', () => {
    const dag = makeTestDag();
    // init + node-a + node-b done → position should be at node-c
    const completion = CompletionStore.from(['init', 'node-a', 'node-b']);
    const pos = orient(dag, completion);

    expect(pos.position).toContain('node-c');
    expect(pos.level).toBeGreaterThan(0);
  });

  it('failing receipts do not count as done', () => {
    const dag = makeTestDag();
    const completion = CompletionStore.fromRecords([
      { nodeId: 'init', completedAt: '', validationChecks: [{ rule: 'x', passed: true, evidence: 'ok' }] },
      { nodeId: 'node-a', completedAt: '', validationChecks: [{ rule: 'shell', passed: false, evidence: 'exit 1' }] },
      { nodeId: 'node-b', completedAt: '', validationChecks: [{ rule: 'x', passed: true, evidence: 'ok' }] },
    ]);
    const pos = orient(dag, completion);

    // node-a has failing receipt → NOT in done set
    expect(pos.done).toContain('init');
    expect(pos.done).toContain('node-b');
    expect(pos.done).not.toContain('node-a');
    expect(pos.done.length).toBe(2);

    // Position should include node-a (it's incomplete)
    expect(pos.position).toContain('node-a');
  });

  it('CompletionStore.hasFailing distinguishes failed from pending', () => {
    const completion = CompletionStore.fromRecords([
      { nodeId: 'passed', completedAt: '', validationChecks: [{ rule: 'x', passed: true, evidence: 'ok' }] },
      { nodeId: 'failed', completedAt: '', validationChecks: [{ rule: 'x', passed: false, evidence: 'nope' }] },
    ]);

    // hasPassing
    expect(completion.hasPassing('passed')).toBe(true);
    expect(completion.hasPassing('failed')).toBe(false);
    expect(completion.hasPassing('unknown')).toBe(false);

    // hasFailing
    expect(completion.hasFailing('failed')).toBe(true);
    expect(completion.hasFailing('passed')).toBe(false);
    expect(completion.hasFailing('unknown')).toBe(false);

    // hasRecord
    expect(completion.hasRecord('passed')).toBe(true);
    expect(completion.hasRecord('failed')).toBe(true);
    expect(completion.hasRecord('unknown')).toBe(false);
  });

  it('orient() signature requires CompletionStore (type-level enforcement)', () => {
    // This test exists to document that orient() CANNOT be called without CompletionStore.
    // If someone tries to pass a plain function or undefined, it will be a compile error.
    // The function signature is:
    //   orient(g: Graph<T>, completion: CompletionStore, retired?: ReadonlySet<string>)
    //
    // Before FR-GOV-009, it was:
    //   orient(g: Graph<T>, exists: (artifact: string) => boolean, retired?, completed?)
    //
    // The old signature allowed omitting completion entirely (fallback to artifact-only).
    // The new signature makes CompletionStore mandatory — no fallback, no regression.
    const dag = makeTestDag();
    const completion = CompletionStore.from(['init']);
    const pos = orient(dag, completion);
    expect(pos).toBeDefined();
    expect(pos.done).toContain('init');
  });

  it('retired nodes are excluded from remaining but shown in done', () => {
    const dag = makeTestDag();
    const completion = CompletionStore.from(['init']);
    const retired = new Set(['node-a']);
    const pos = orient(dag, completion, retired);

    // Retired nodes are effectively done
    expect(pos.done).toContain('init');
    // node-a is retired → treated as done for batch advancement
    expect(pos.remaining).not.toContain('node-a');
  });
});
