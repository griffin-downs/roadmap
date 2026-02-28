import { describe, it, expect } from 'vitest';
import { Graph, orient, parallelOrder, CompletionStore } from '../src/protocol.ts';

// Minimal 5-node DAG: init → [a, b] → c → term
const testDAG: Graph<string> = {
  id: 'test-batch',
  desc: 'test DAG for batch state',
  init: 'init',
  term: 'term',
  nodes: {
    init: { id: 'init', desc: 'start', produces: ['init.txt'], consumes: [], deps: [], validate: [], idempotent: true },
    a: { id: 'a', desc: 'task a', produces: ['a.txt'], consumes: [], deps: ['init'], validate: [], idempotent: true },
    b: { id: 'b', desc: 'task b', produces: ['b.txt'], consumes: [], deps: ['init'], validate: [], idempotent: true },
    c: { id: 'c', desc: 'task c', produces: ['c.txt'], consumes: ['a.txt', 'b.txt'], deps: ['a', 'b'], validate: [], idempotent: true },
    term: { id: 'term', desc: 'end', produces: [], consumes: ['c.txt'], deps: ['c'], validate: [], idempotent: false },
  },
};

describe('Batch State Synchronization - Exhaustive', () => {
  describe('Init Gate Visibility', () => {
    it('init node is in position when no receipts exist', () => {
      const pos = orient(testDAG, CompletionStore.empty());
      expect(pos.position).toContain('init');
      expect(pos.position[0]).toBe('init');
    });

    it('init is done when it has a receipt', () => {
      const pos = orient(testDAG, CompletionStore.from(['init']));
      expect(pos.done).toContain('init');
      expect(pos.position).not.toContain('init');
    });

    it('receipt is sufficient — no artifact check in orient', () => {
      // Receipt-only: hasPassing(init) = true → init is done
      const pos = orient(testDAG, CompletionStore.from(['init']));
      expect(pos.done).toContain('init');
      expect(pos.position).toContain('a');
      expect(pos.position).toContain('b');
    });

    it('no receipt = not done, regardless of anything else', () => {
      const pos = orient(testDAG, CompletionStore.empty());
      expect(pos.position).toContain('init');
    });
  });

  describe('Terminal Gate Visibility', () => {
    it('term is not in position until c is done', () => {
      const pos = orient(testDAG, CompletionStore.empty());
      expect(pos.position).not.toContain('term');
    });

    it('term appears in position when all predecessors have receipts', () => {
      const pos = orient(testDAG, CompletionStore.from(['init', 'a', 'b', 'c']));
      expect(pos.position).toContain('term');
    });

    it('term in position indicates roadmap completion readiness', () => {
      const pos = orient(testDAG, CompletionStore.from(['init', 'a', 'b', 'c']));
      expect(pos.position).toContain('term');
      expect(pos.remaining).toEqual([]);
    });
  });

  describe('Orient Idempotency', () => {
    it('multiple orient calls with same store return same position', () => {
      const store = CompletionStore.from(['init', 'a']);
      const pos1 = orient(testDAG, store);
      const pos2 = orient(testDAG, store);
      expect(pos1.position).toEqual(pos2.position);
      expect(pos1.batchComplete).toBe(pos2.batchComplete);
    });

    it('orient tracks completion state correctly', () => {
      const store = CompletionStore.from(['init', 'a']);
      const pos = orient(testDAG, store);
      expect(pos.done).toContain('init');
      expect(pos.done).toContain('a');
    });
  });

  describe('Batch Completion Tracking', () => {
    it('batchComplete is false when batch has remaining nodes', () => {
      const pos = orient(testDAG, CompletionStore.from(['init']));
      expect(pos.position).toContain('a');
      expect(pos.position).toContain('b');
      expect(pos.batchComplete).toBe(false);
    });

    it('batchComplete advances to next batch when current batch done', () => {
      const pos = orient(testDAG, CompletionStore.from(['init', 'a', 'b']));
      // When batch [a,b] is complete, position advances to next batch [c]
      expect(pos.position).toContain('c');
      expect(pos.batchComplete).toBe(false); // [c] is incomplete (no receipt)
    });

    it('batchRemaining shows which nodes in batch are not done', () => {
      const pos = orient(testDAG, CompletionStore.from(['init', 'a']));
      expect(pos.batchRemaining).toEqual(['b']);
    });
  });

  describe('Edge Cases', () => {
    it('receipt advances to next batch', () => {
      const pos1 = orient(testDAG, CompletionStore.from(['init']));
      expect(pos1.position).not.toContain('init');
      expect(pos1.position).toContain('a');

      const pos2 = orient(testDAG, CompletionStore.from(['init', 'a', 'b']));
      expect(pos2.position).toContain('c');
    });

    it('empty store does not crash', () => {
      const pos = orient(testDAG, CompletionStore.empty());
      expect(pos.position).toBeDefined();
      expect(pos.position[0]).toBe('init');
    });

    it('receipts for non-existent nodes are ignored safely', () => {
      const store = CompletionStore.from(['init', 'nonexistent']);
      const pos = orient(testDAG, store);
      expect(pos.position).toContain('a');
    });
  });

  describe('Gate Discoverability', () => {
    it('both init and term gates are discoverable in DAG', () => {
      const nodes = Object.keys(testDAG.nodes);
      expect(nodes).toContain('init');
      expect(nodes).toContain('term');
      expect(nodes[0]).not.toBe('term');
    });

    it('parallelOrder shows init in first batch', () => {
      const batches = parallelOrder(testDAG);
      expect(batches[0]).toContain('init');
      expect(batches[batches.length - 1]).toContain('term');
    });

    it('init is always first batch', () => {
      const pos = orient(testDAG, CompletionStore.empty());
      expect(pos.position[0]).toBe('init');
    });

    it('term is in done when all complete', () => {
      const pos = orient(testDAG, CompletionStore.from(['init', 'a', 'b', 'c', 'term']));
      expect(pos.done).toContain('term');
      expect(pos.position).toEqual([]);
      expect(pos.remaining).toEqual([]);
    });
  });

  describe('Executor Position Consistency', () => {
    it('executors see consistent position across multiple calls', () => {
      const store = CompletionStore.from(['init', 'a']);
      const p1 = orient(testDAG, store);
      const p2 = orient(testDAG, store);
      const p3 = orient(testDAG, store);
      expect(p1.position).toEqual(p2.position);
      expect(p2.position).toEqual(p3.position);
      expect(p1.level).toBe(p2.level);
    });

    it('position order is stable across executor calls', () => {
      const store = CompletionStore.from(['init']);
      const pos = orient(testDAG, store);
      expect(pos.position.sort()).toEqual(['a', 'b'].sort());
    });
  });

  describe('Completion Atomicity', () => {
    it('completing one node updates position correctly', () => {
      const pos1 = orient(testDAG, CompletionStore.from(['init']));
      expect(pos1.position).toContain('a');
      expect(pos1.position).toContain('b');

      const pos2 = orient(testDAG, CompletionStore.from(['init', 'a']));
      expect(pos2.batchRemaining).toEqual(['b']);
    });

    it('batch transitions when all nodes complete', () => {
      const pos = orient(testDAG, CompletionStore.from(['init', 'a', 'b']));
      expect(pos.position).toEqual(['c']);
      expect(pos.batchComplete).toBe(false);
    });

    it('final batch reachable only when all prior complete', () => {
      const pos0 = orient(testDAG, CompletionStore.empty());
      expect(pos0.position).toEqual(['init']);

      const pos1 = orient(testDAG, CompletionStore.from(['init']));
      expect(pos1.position).not.toContain('term');

      const pos2 = orient(testDAG, CompletionStore.from(['init', 'a', 'b']));
      expect(pos2.position).not.toContain('term');

      const pos3 = orient(testDAG, CompletionStore.from(['init', 'a', 'b', 'c']));
      expect(pos3.position).toEqual(['term']);
    });
  });
});
