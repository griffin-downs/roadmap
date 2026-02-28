import { describe, it, expect } from 'vitest';
import { orient, define, CompletionStore } from '../src/protocol.ts';
import type { Graph } from '../src/protocol.ts';

function makeDAG(): Graph<'init' | 'a' | 'term'> {
  return define({
    id: 'test-receipt',
    desc: 'receipt semantics test',
    init: 'init',
    term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
      a: { id: 'a', desc: 'node a', produces: ['out.txt'], consumes: [], deps: ['init'], validate: [], idempotent: true },
      term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a'], validate: [], idempotent: true },
    },
  });
}

describe('orient receipt semantics (CompletionStore)', () => {
  it('empty store → all nodes incomplete, stuck at init', () => {
    const g = makeDAG();
    const pos = orient(g, CompletionStore.empty());
    expect(pos.position).toContain('init');
    expect(pos.done).toEqual([]);
  });

  it('init receipt → init done, position advances to a', () => {
    const g = makeDAG();
    const pos = orient(g, CompletionStore.from(['init']));
    expect(pos.done).toContain('init');
    expect(pos.position).toContain('a');
    expect(pos.position).not.toContain('init');
  });

  it('init + a receipts → both done, position at term', () => {
    const g = makeDAG();
    const pos = orient(g, CompletionStore.from(['init', 'a']));
    expect(pos.done).toContain('init');
    expect(pos.done).toContain('a');
    expect(pos.position).toContain('term');
  });

  it('all receipts → done flag true', () => {
    const g = makeDAG();
    const pos = orient(g, CompletionStore.from(['init', 'a', 'term']));
    expect(pos.done).toContain('init');
    expect(pos.done).toContain('a');
    expect(pos.done).toContain('term');
    expect(pos.position).toEqual([]);
    expect(pos.batchComplete).toBe(true);
    expect(pos.remaining).toEqual([]);
  });

  it('receipt for a without init receipt → stuck at init (deps not met)', () => {
    const g = makeDAG();
    // a has receipt but init does not → init is first batch, still incomplete
    const pos = orient(g, CompletionStore.from(['a']));
    expect(pos.position).toContain('init');
  });

  it('produce-less node requires receipt to be done', () => {
    const g = makeDAG();
    // init has no produces. Without receipt, it's not done.
    const pos = orient(g, CompletionStore.empty());
    expect(pos.position).toContain('init');
  });

  it('retired nodes bypass receipt requirement', () => {
    const g = makeDAG();
    const retired = new Set(['init', 'a']);
    const pos = orient(g, CompletionStore.empty(), retired);
    // Both init and a are retired → position at term
    expect(pos.position).toContain('term');
  });

  it('retired single node advances past it', () => {
    const g = makeDAG();
    const retired = new Set(['init']);
    const pos = orient(g, CompletionStore.empty(), retired);
    // init retired → done. a has no receipt → position at a.
    expect(pos.position).toContain('a');
  });
});
