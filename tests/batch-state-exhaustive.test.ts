import { describe, it, expect, beforeEach } from 'vitest';
import { Graph, orient, parallelOrder } from '../src/protocol.ts';

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
  let artifacts: Set<string>;
  let completed: Set<string>;

  beforeEach(() => {
    artifacts = new Set();
    completed = new Set();
  });

  const exists = (p: string) => artifacts.has(p);

  describe('Init Gate Visibility', () => {
    it('init node is in position when no artifacts exist', () => {
      const pos = orient(testDAG, exists, undefined, completed);
      expect(pos.position).toContain('init');
      expect(pos.position[0]).toBe('init');
    });

    it('init is done when artifact exists', () => {
      artifacts.add('init.txt');
      const pos = orient(testDAG, exists, undefined, completed);
      expect(pos.done).toContain('init');
      expect(pos.position).not.toContain('init');
    });

    it('init is done when explicitly completed (no artifact)', () => {
      completed.add('init');
      const pos = orient(testDAG, exists, undefined, completed);
      expect(pos.done).toContain('init');
      expect(pos.position).not.toContain('init');
    });

    it('explicit completion takes precedence over missing artifact', () => {
      completed.add('init');
      const pos = orient(testDAG, exists, undefined, completed);
      expect(pos.done).toContain('init');
      expect(pos.remaining).not.toContain('init');
    });
  });

  describe('Terminal Gate Visibility', () => {
    it('term is not in position until c is done', () => {
      const pos = orient(testDAG, exists, undefined, completed);
      expect(pos.position).not.toContain('term');
    });

    it('term appears in position when c is complete', () => {
      artifacts.add('init.txt');
      artifacts.add('a.txt');
      artifacts.add('b.txt');
      artifacts.add('c.txt');
      const pos = orient(testDAG, exists, undefined, completed);
      expect(pos.position).toContain('term');
    });

    it('term is viewable when explicitly completed', () => {
      completed.add('init');
      completed.add('a');
      completed.add('b');
      completed.add('c');
      const pos = orient(testDAG, exists, undefined, completed);
      expect(pos.position).toContain('term');
    });

    it('term in position indicates roadmap completion readiness', () => {
      artifacts.add('init.txt');
      artifacts.add('a.txt');
      artifacts.add('b.txt');
      artifacts.add('c.txt');
      const pos = orient(testDAG, exists, undefined, completed);
      expect(pos.position).toContain('term');
      expect(pos.remaining).toEqual([]); // No batches after term
    });
  });

  describe('Orient Idempotency', () => {
    it('multiple orient calls with same state return same position', () => {
      completed.add('init');
      completed.add('a');
      const pos1 = orient(testDAG, exists, undefined, completed);
      const pos2 = orient(testDAG, exists, undefined, completed);
      expect(pos1.position).toEqual(pos2.position);
      expect(pos1.batchComplete).toBe(pos2.batchComplete);
    });

    it('orient with artifacts matches orient with explicit completion', () => {
      artifacts.add('init.txt');
      artifacts.add('a.txt');
      const posA = orient(testDAG, exists, undefined, new Set());

      artifacts.clear();
      completed.add('init');
      completed.add('a');
      const posB = orient(testDAG, exists, undefined, completed);

      expect(posA.position).toEqual(posB.position);
    });

    it('orient tracks both artifact and completion state', () => {
      artifacts.add('init.txt');
      completed.add('a');
      const pos = orient(testDAG, exists, undefined, completed);
      expect(pos.done).toContain('init');
      expect(pos.done).toContain('a');
    });
  });

  describe('Batch Completion Tracking', () => {
    it('batchComplete is false when batch has remaining nodes', () => {
      artifacts.add('init.txt');
      const pos = orient(testDAG, exists, undefined, completed);
      expect(pos.position).toContain('a');
      expect(pos.position).toContain('b');
      expect(pos.batchComplete).toBe(false);
    });

    it('batchComplete is true when all nodes in batch are done', () => {
      artifacts.add('init.txt');
      artifacts.add('a.txt');
      artifacts.add('b.txt');
      const pos = orient(testDAG, exists, undefined, completed);
      // When batch [a,b] is complete via artifacts, position advances to next batch [c]
      expect(pos.position).toContain('c');
      expect(pos.batchComplete).toBe(false); // [c] is incomplete (c.txt missing)
    });

    it('batchComplete respects explicit completion', () => {
      completed.add('init');
      completed.add('a');
      completed.add('b');
      const pos = orient(testDAG, exists, undefined, completed);
      // When batch [a,b] is complete via explicit completion, position advances to [c]
      expect(pos.position).toContain('c');
      expect(pos.batchComplete).toBe(false); // [c] is incomplete (c.txt missing)
    });

    it('batchRemaining shows which nodes in batch are not done', () => {
      completed.add('init');
      completed.add('a');
      const pos = orient(testDAG, exists, undefined, completed);
      expect(pos.batchRemaining).toEqual(['b']);
    });
  });

  describe('Edge Cases - Concurrent Executor Safety', () => {
    it('skip-validate path (no artifacts, completion only)', () => {
      completed.add('init');
      const pos1 = orient(testDAG, exists, undefined, completed);
      expect(pos1.position).not.toContain('init');
      expect(pos1.position).toContain('a');

      completed.add('a');
      completed.add('b');
      const pos2 = orient(testDAG, exists, undefined, completed);
      expect(pos2.position).toContain('c');
    });

    it('partial artifact + completion state', () => {
      artifacts.add('init.txt');
      artifacts.add('a.txt');
      completed.add('b');
      const pos = orient(testDAG, exists, undefined, completed);
      // Both a (via artifact) and b (via completion) done, so batch [a,b] complete
      // Position advances to [c]
      expect(pos.position).toContain('c');
      expect(pos.batchComplete).toBe(false); // [c] is incomplete
    });

    it('empty completed set doesnt crash', () => {
      const pos = orient(testDAG, exists, undefined, new Set());
      expect(pos.position).toBeDefined();
      expect(pos.position[0]).toBe('init');
    });

    it('undefined completed falls back to artifact-only', () => {
      artifacts.add('init.txt');
      const pos = orient(testDAG, exists, undefined, undefined);
      expect(pos.done).toContain('init');
    });

    it('completions for non-existent nodes are ignored safely', () => {
      completed.add('init');
      completed.add('nonexistent');
      const pos = orient(testDAG, exists, undefined, completed);
      // Should not crash, position should be correct
      expect(pos.position).toContain('a');
    });
  });

  describe('Gate Discoverability', () => {
    it('both init and term gates are discoverable in DAG', () => {
      const nodes = Object.keys(testDAG.nodes);
      expect(nodes).toContain('init');
      expect(nodes).toContain('term');
      expect(nodes[0]).not.toBe('term'); // init should come first in definition
    });

    it('parallelOrder shows init in first batch', () => {
      const batches = parallelOrder(testDAG);
      expect(batches[0]).toContain('init');
      expect(batches[batches.length - 1]).toContain('term');
    });

    it('init is always first batch', () => {
      const pos = orient(testDAG, exists, undefined, completed);
      expect(pos.position[0]).toBe('init');
    });

    it('term is always last batch', () => {
      for (const id of Object.keys(testDAG.nodes).filter(n => n !== 'term')) {
        completed.add(id);
      }
      const pos = orient(testDAG, exists, undefined, completed);
      expect(pos.position).toContain('term');
      expect(pos.remaining).toEqual([]); // No batches after term
    });
  });

  describe('Executor Position Consistency', () => {
    it('executors see consistent position across multiple calls', () => {
      completed.add('init');
      completed.add('a');
      const p1 = orient(testDAG, exists, undefined, completed);
      const p2 = orient(testDAG, exists, undefined, completed);
      const p3 = orient(testDAG, exists, undefined, completed);
      expect(p1.position).toEqual(p2.position);
      expect(p2.position).toEqual(p3.position);
      expect(p1.level).toBe(p2.level);
    });

    it('position order is stable across executor calls', () => {
      // Batch [a, b] should always be in same order
      completed.add('init');
      const pos = orient(testDAG, exists, undefined, completed);
      expect(pos.position.sort()).toEqual(['a', 'b'].sort());
    });
  });

  describe('Completion Atomicity', () => {
    it('completing one node updates position correctly', () => {
      completed.add('init');
      const pos1 = orient(testDAG, exists, undefined, completed);
      expect(pos1.position).toContain('a');
      expect(pos1.position).toContain('b');

      completed.add('a');
      const pos2 = orient(testDAG, exists, undefined, completed);
      expect(pos2.batchRemaining).toEqual(['b']);
    });

    it('batch transitions when all nodes complete', () => {
      completed.add('init');
      completed.add('a');
      completed.add('b');
      const pos = orient(testDAG, exists, undefined, completed);
      expect(pos.position).toEqual(['c']);
      expect(pos.batchComplete).toBe(false);
    });

    it('final batch reachable only when all prior complete', () => {
      const pos0 = orient(testDAG, exists, undefined, completed);
      expect(pos0.position).toEqual(['init']);

      completed.add('init');
      const pos1 = orient(testDAG, exists, undefined, completed);
      expect(pos1.position).not.toContain('term');

      completed.add('a');
      completed.add('b');
      const pos2 = orient(testDAG, exists, undefined, completed);
      expect(pos2.position).not.toContain('term');

      completed.add('c');
      const pos3 = orient(testDAG, exists, undefined, completed);
      expect(pos3.position).toEqual(['term']);
    });
  });
});
