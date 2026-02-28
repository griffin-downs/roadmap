import { describe, it, expect } from 'vitest';
import { graph, define, orient, advanceBatch, CompletionStore } from '../src/protocol.ts';

describe('batch-position: Batch model semantics', () => {
  describe('Position array structure', () => {
    it('position is always an array', () => {
      const g = define(graph({
        id: 'simple',
        desc: 'a → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: [] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a'] },
        },
      }));

      const pos = orient(g, CompletionStore.empty());
      expect(Array.isArray(pos.position)).toBe(true);
    });

    it('level field present and numeric', () => {
      const g = define(graph({
        id: 'simple',
        desc: 'a → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: [] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a'] },
        },
      }));

      const pos = orient(g, CompletionStore.empty());
      expect(typeof pos.level).toBe('number');
      expect(pos.level).toBeGreaterThanOrEqual(0);
    });

    it('batchComplete field present', () => {
      const g = define(graph({
        id: 'simple',
        desc: 'a → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: [] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a'] },
        },
      }));

      const pos = orient(g, CompletionStore.empty());
      expect(typeof pos.batchComplete).toBe('boolean');
    });

    it('batchRemaining field present', () => {
      const g = define(graph({
        id: 'simple',
        desc: 'a → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: [] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a'] },
        },
      }));

      const pos = orient(g, CompletionStore.empty());
      expect(Array.isArray(pos.batchRemaining)).toBe(true);
    });
  });

  describe('Batch completion logic', () => {
    it('batchComplete true when all artifacts exist', () => {
      const g = define(graph({
        id: 'complete',
        desc: 'a → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: [] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a'] },
        },
      }));

      const pos = orient(g, CompletionStore.from(Object.keys(g.nodes)));
      expect(pos.batchComplete).toBe(true);
    });

    it('batchComplete false when artifacts missing', () => {
      const g = define(graph({
        id: 'incomplete',
        desc: 'a → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: [] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a'] },
        },
      }));

      const pos = orient(g, CompletionStore.empty());
      expect(pos.batchComplete).toBe(false);
    });
  });

  describe('Gate nodes behavior', () => {
    it('gate node (empty produces) can be in batch', () => {
      const g = define(graph({
        id: 'gates',
        desc: '[work,gate] → term',
        init: 'work',
        term: 'term',
        nodes: {
          work: { id: 'work', desc: 'work', produces: ['out'], consumes: [], deps: [] },
          gate: { id: 'gate', desc: 'gate', produces: [], consumes: [], deps: [] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['work', 'gate'] },
        },
      }));

      // Both work and gate should be in same batch
      const pos = orient(g, CompletionStore.empty());
      expect(pos.position.length).toBeGreaterThan(0);
    });
  });

  describe('advanceBatch validation', () => {
    it('advanceBatch throws when batch not complete', async () => {
      const g = define(graph({
        id: 'advance-fail',
        desc: 'a → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: [] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a'] },
        },
      }));

      try {
        await advanceBatch(g, CompletionStore.empty());
        expect.fail('Should throw');
      } catch (e: any) {
        expect(e.message).toContain('Cannot advance');
      }
    });

    it('advanceBatch succeeds when batch complete and artifacts exist', async () => {
      const g = define(graph({
        id: 'advance-success',
        desc: 'a → b → c → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: [] },
          b: { id: 'b', desc: 'b', produces: ['b.txt'], consumes: [], deps: ['a'] },
          c: { id: 'c', desc: 'c', produces: ['c.txt'], consumes: [], deps: ['b'] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['c'] },
        },
      }));

      // All nodes complete, so advancing should work
      const next = await advanceBatch(g, CompletionStore.from(Object.keys(g.nodes)));
      // Should not be at 'a' batch anymore
      expect(next.position).not.toContain('a');
      expect(next.level).toBeGreaterThan(0);
    });
  });
});
