import { describe, it, expect } from 'vitest';
import { graph, define, nextBatch, CompletionStore } from '../src/protocol.ts';

describe('nextBatch: lookahead for orchestrator pre-warming', () => {
  // linear: a → b → term (a is init node, has no deps)
  const linear = define(graph({
    id: 'linear',
    desc: 'a → b → term',
    init: 'a',
    term: 'term',
    nodes: {
      a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: [] as const, validate: [], idempotent: true },
      b: { id: 'b', desc: 'b', produces: ['b.txt'], consumes: [], deps: ['a'] as const, validate: [], idempotent: true },
      term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['b'] as const, validate: [], idempotent: true },
    },
  }));

  it('returns next batch when current is incomplete', () => {
    // Current batch: [a] at L0 (a has no receipt). Next: [b] at L1.
    const next = nextBatch(linear, CompletionStore.empty());
    expect(next).not.toBeNull();
    expect(next!.nodes).toEqual(['b']);
    expect(next!.level).toBe(1);
    expect(next!.produces).toEqual(['b.txt']);
  });

  it('returns null when at final batch', () => {
    // a and b done. Current = [term] which is last.
    const next = nextBatch(linear, CompletionStore.from(['a', 'b']));
    expect(next).toBeNull();
  });

  it('includes produces union for multi-node batch', () => {
    const wide = define(graph({
      id: 'wide',
      desc: 'a → [b, c] → term',
      init: 'a',
      term: 'term',
      nodes: {
        a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: [] as const, validate: [], idempotent: true },
        b: { id: 'b', desc: 'b', produces: ['b.txt'], consumes: [], deps: ['a'] as const, validate: [], idempotent: true },
        c: { id: 'c', desc: 'c', produces: ['c.txt'], consumes: [], deps: ['a'] as const, validate: [], idempotent: true },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['b', 'c'] as const, validate: [], idempotent: true },
      },
    }));

    const next = nextBatch(wide, CompletionStore.empty());
    expect(next!.nodes).toEqual(['b', 'c']);
    expect(next!.produces).toContain('b.txt');
    expect(next!.produces).toContain('c.txt');
  });

  it('includes conflicts for next batch', () => {
    // Two nodes in next batch both produce same file → conflict
    const conflict = define(graph({
      id: 'conflict',
      desc: 'conflict in next batch',
      init: 'a',
      term: 'term',
      nodes: {
        a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: [] as const, validate: [], idempotent: true },
        b: { id: 'b', desc: 'b', produces: ['shared.txt'], consumes: [], deps: ['a'] as const, validate: [], idempotent: true },
        c: { id: 'c', desc: 'c', produces: ['shared.txt'], consumes: [], deps: ['a'] as const, validate: [], idempotent: true },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['b', 'c'] as const, validate: [], idempotent: true },
      },
    }));

    const next = nextBatch(conflict, CompletionStore.empty());
    expect(next!.conflicts).toContain('shared.txt');
  });

  it('returns empty conflicts when no overlaps', () => {
    const next = nextBatch(linear, CompletionStore.empty());
    expect(next!.conflicts).toEqual([]);
  });

  it('works with retired nodes', () => {
    const retired = new Set(['a']);
    // a retired → done. Current batch = [b]. Next = [term].
    const next = nextBatch(linear, CompletionStore.empty(), retired);
    expect(next!.nodes).toEqual(['term']);
  });
});
