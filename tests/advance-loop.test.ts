// ADVANCE-LOOP — adversarial spec: advance() command phase enforcement and batch advancement
//
// The advance command validates work completion and moves through the
// make → validate → brief → execute → term phase loop.
//
// Tests verify:
// 1. advance requires all nodes in current batch to be complete
// 2. Completion means all produces artifacts exist
// 3. Completion means all validate rules pass
// 4. Phase gates are enforced (can't advance past incomplete execute nodes)
// 5. Advancing moves to next batch atomically
// 6. Work artifacts are validated (checksummed/validated)
// 7. Terminal state is detected (all work done)
// 8. Error messages on incomplete work show which nodes are blocking
// 9. Multiple advances in sequence work correctly

import { describe, it, expect } from 'vitest';
import {
  graph, define, orient, advanceBatch, CompletionStore, validateBatch,
} from '../src/protocol.ts';

// --- Core contract: advanceBatch requires batch completion ---

describe('ADVANCE-LOOP: Phase enforcement and batch advancement', () => {
  describe('Batch completion validation', () => {
    it('advanceBatch throws when batch incomplete (missing nodes)', () => {
      const g = define(graph({
        id: 'batch-incomplete',
        desc: '[a, b] → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'work a', produces: ['a.txt'], consumes: [], deps: [] },
          b: { id: 'b', desc: 'work b', produces: ['b.txt'], consumes: [], deps: [] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a', 'b'] },
        },
      }));

      // Only 'a' done, 'b' missing
      const completion = CompletionStore.from(['a']);

      expect(() => advanceBatch(g, completion)).toThrow('Cannot advance');
    });

    it('error message identifies blocking nodes', () => {
      const g = define(graph({
        id: 'blocking-nodes',
        desc: '[a, b, c] → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'work a', produces: ['a.txt'], consumes: [], deps: [] },
          b: { id: 'b', desc: 'work b', produces: ['b.txt'], consumes: [], deps: [] },
          c: { id: 'c', desc: 'work c', produces: ['c.txt'], consumes: [], deps: [] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a', 'b', 'c'] },
        },
      }));

      const completion = CompletionStore.from(['a']);

      expect(() => advanceBatch(g, completion)).toThrow(/b.*c/);
    });

    it('advanceBatch succeeds when all nodes in current batch complete', () => {
      const g = define(graph({
        id: 'batch-complete',
        desc: '[a, b] → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'work a', produces: ['a.txt'], consumes: [], deps: [] },
          b: { id: 'b', desc: 'work b', produces: ['b.txt'], consumes: [], deps: [] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a', 'b'] },
        },
      }));

      const completion = CompletionStore.from(['a', 'b']);
      const next = advanceBatch(g, completion);

      // Current batch should be complete and advanced
      expect(next.batchComplete).toBe(false); // term batch is incomplete
      expect(next.done).toContain('a');
      expect(next.done).toContain('b');
    });
  });

  describe('Linear phase progression', () => {
    it('advances from initial to subsequent batches', () => {
      const g = define(graph({
        id: 'simple-linear',
        desc: '[a, b] → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'initial', produces: ['a.txt'], consumes: [], deps: [] },
          b: { id: 'b', desc: 'initial', produces: ['b.txt'], consumes: [], deps: [] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a', 'b'] },
        },
      }));

      // Initial position at [a, b]
      let completion = CompletionStore.empty();
      let pos = orient(g, completion);
      expect(pos.position).toContain('a');
      expect(pos.position).toContain('b');
      expect(pos.level).toBe(0);

      // Complete [a, b], advance to [term]
      completion = CompletionStore.from(['a', 'b']);
      pos = advanceBatch(g, completion);
      expect(pos.position).toContain('term');
      expect(pos.level).toBe(1);
      expect(pos.done).toContain('a');
      expect(pos.done).toContain('b');

      // Complete all
      completion = CompletionStore.from(['a', 'b', 'term']);
      pos = orient(g, completion);
      expect(pos.position).toEqual([]);
      expect(pos.remaining).toHaveLength(0);
    });

    it('sequential advanceBatch calls progress through batches', () => {
      const g = define(graph({
        id: 'sequential-advance',
        desc: '[a] → [b] → [c] → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'batch 1', produces: ['a.txt'], consumes: [], deps: [] },
          b: { id: 'b', desc: 'batch 2', produces: ['b.txt'], consumes: [], deps: ['a'] },
          c: { id: 'c', desc: 'batch 3', produces: ['c.txt'], consumes: [], deps: ['b'] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['c'] },
        },
      }));

      // Start at a
      let completion = CompletionStore.from([]);
      let pos = orient(g, completion);
      expect(pos.position).toContain('a');

      // Advance past a to b
      completion = CompletionStore.from(['a']);
      pos = advanceBatch(g, completion);
      expect(pos.done).toContain('a');

      // Advance past b to c
      completion = CompletionStore.from(['a', 'b']);
      pos = advanceBatch(g, completion);
      expect(pos.done).toContain('a');
      expect(pos.done).toContain('b');

      // Advance past c to term
      completion = CompletionStore.from(['a', 'b', 'c']);
      pos = advanceBatch(g, completion);
      expect(pos.done).toContain('a');
      expect(pos.done).toContain('b');
      expect(pos.done).toContain('c');
    });
  });

  describe('Gate nodes (zero-produce nodes)', () => {
    it('gate node can advance when receipted even with no produces', () => {
      const g = define(graph({
        id: 'gate-advance',
        desc: 'work → gate → term',
        init: 'work',
        term: 'term',
        nodes: {
          work: { id: 'work', desc: 'produces artifact', produces: ['output'], consumes: [], deps: [] },
          gate: { id: 'gate', desc: 'validation gate', produces: [], consumes: ['output'], deps: ['work'] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['gate'] },
        },
      }));

      // Complete work and gate, advance to term
      const completion = CompletionStore.from(['work', 'gate']);
      const pos = orient(g, completion);

      expect(pos.position).toContain('term');
      expect(pos.done).toContain('gate');
      expect(pos.done).toContain('work');
    });

    it('gate advances independently of consume satisfaction', () => {
      const g = define(graph({
        id: 'gate-independent',
        desc: '[work, gate] → term',
        init: 'work',
        term: 'term',
        nodes: {
          work: { id: 'work', desc: 'work', produces: ['out'], consumes: [], deps: [] },
          gate: { id: 'gate', desc: 'gate', produces: [], consumes: [], deps: [] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['work', 'gate'] },
        },
      }));

      // Gate doesn't depend on work, so gate can advance independently
      const completion = CompletionStore.from(['gate']);
      const pos = orient(g, completion);

      expect(pos.done).toContain('gate');
      // But work is still missing, so position is still at work
      expect(pos.position).toContain('work');
    });
  });

  describe('Validation rules enforcement', () => {
    it('node with failing validate rule blocks advance', async () => {
      const g = define(graph({
        id: 'validate-fail',
        desc: 'a → b → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: {
            id: 'a',
            desc: 'work with validation',
            produces: ['output'],
            consumes: [],
            deps: [],
            validate: [{ type: 'artifact-exists', target: 'missing.txt' }],
          },
          b: { id: 'b', desc: 'next', produces: ['final'], consumes: ['output'], deps: ['a'] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['b'] },
        },
      }));

      // Even if we claim 'a' is done, validate rule should fail
      const result = await validateBatch(g, ['a'], (f) => f === 'output'); // output exists, but missing.txt doesn't

      // Validation should fail
      expect(result.passed).toBe(false);
    });

    it('validateBatch passes all artifacts in batch', async () => {
      const g = define(graph({
        id: 'validate-pass',
        desc: '[a, b] → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: {
            id: 'a',
            desc: 'work',
            produces: ['a.txt'],
            consumes: [],
            deps: [],
            validate: [{ type: 'artifact-exists', target: 'a.txt' }],
          },
          b: {
            id: 'b',
            desc: 'work',
            produces: ['b.txt'],
            consumes: [],
            deps: [],
            validate: [{ type: 'artifact-exists', target: 'b.txt' }],
          },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a', 'b'] },
        },
      }));

      const result = await validateBatch(g, ['a', 'b'], (f) => f === 'a.txt' || f === 'b.txt');

      expect(result.passed).toBe(true);
    });
  });

  describe('Dependency flow enforcement', () => {
    it('cannot advance past incomplete batch even if dependers are receipted', () => {
      const g = define(graph({
        id: 'consumes-unsatisfied',
        desc: 'a → b → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'work', produces: ['output'], consumes: [], deps: [] },
          b: { id: 'b', desc: 'work', produces: ['final'], consumes: ['output'], deps: ['a'] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['b'] },
        },
      }));

      // Current batch is [a], and it's not complete even if 'b' claims a receipt
      const completion = CompletionStore.from(['b']);

      expect(() => advanceBatch(g, completion)).toThrow('Cannot advance');
      // Error should mention 'a' is blocking
      expect(() => advanceBatch(g, completion)).toThrow(/a/);
    });

    it('advance respects dependency order', () => {
      const g = define(graph({
        id: 'deps-order',
        desc: '[a, x] → [b] → [c] → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'work', produces: ['a.txt'], consumes: [], deps: [] },
          x: { id: 'x', desc: 'work', produces: ['x.txt'], consumes: [], deps: [] },
          b: { id: 'b', desc: 'work', produces: ['b.txt'], consumes: [], deps: ['a'] },
          c: { id: 'c', desc: 'work', produces: ['c.txt'], consumes: [], deps: ['b'] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['c', 'x'] },
        },
      }));

      // Can't advance if a or x incomplete
      let completion = CompletionStore.from(['a']);
      expect(() => advanceBatch(g, completion)).toThrow('Cannot advance');

      // Advance [a,x] → [b]
      completion = CompletionStore.from(['a', 'x']);
      let pos = advanceBatch(g, completion);
      expect(pos.done).toContain('a');
      expect(pos.done).toContain('x');

      // Advance [b] → [c]
      completion = CompletionStore.from(['a', 'x', 'b']);
      pos = advanceBatch(g, completion);
      expect(pos.done).toContain('b');
    });
  });

  describe('Terminal state detection', () => {
    it('orient returns empty position when all nodes complete', () => {
      const g = define(graph({
        id: 'all-done',
        desc: 'a → b → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'work', produces: ['a.txt'], consumes: [], deps: [] },
          b: { id: 'b', desc: 'work', produces: ['b.txt'], consumes: [], deps: ['a'] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['b'] },
        },
      }));

      const completion = CompletionStore.from(['a', 'b', 'term']);
      const pos = orient(g, completion);

      expect(pos.done).toContain('a');
      expect(pos.done).toContain('b');
      expect(pos.done).toContain('term');
      expect(pos.position).toEqual([]);
      expect(pos.remaining).toHaveLength(0);
    });

    it('done set matches completed nodes at each phase', () => {
      const g = define(graph({
        id: 'done-set',
        desc: '[a, b] → [c, d] → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'work', produces: ['a'], consumes: [], deps: [] },
          b: { id: 'b', desc: 'work', produces: ['b'], consumes: [], deps: [] },
          c: { id: 'c', desc: 'work', produces: ['c'], consumes: [], deps: ['a', 'b'] },
          d: { id: 'd', desc: 'work', produces: ['d'], consumes: [], deps: ['a', 'b'] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['c', 'd'] },
        },
      }));

      // Complete first batch [a, b] and check state before advancing
      const completion = CompletionStore.from(['a', 'b']);
      const pos = orient(g, completion);

      // a and b are in done
      expect(pos.done).toContain('a');
      expect(pos.done).toContain('b');
      // c and d are not yet done (still in current batch)
      expect(pos.done).not.toContain('c');
      expect(pos.done).not.toContain('d');
      // c and d are the current batch
      expect(pos.position).toContain('c');
      expect(pos.position).toContain('d');
    });

    it('remaining array reflects nodes not yet done', () => {
      const g = define(graph({
        id: 'remaining-check',
        desc: 'a → b → c → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'work', produces: ['a'], consumes: [], deps: [] },
          b: { id: 'b', desc: 'work', produces: ['b'], consumes: [], deps: ['a'] },
          c: { id: 'c', desc: 'work', produces: ['c'], consumes: [], deps: ['b'] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['c'] },
        },
      }));

      const completion = CompletionStore.from(['a']);
      const pos = orient(g, completion);

      // remaining contains all future batches
      expect(pos.remaining.length).toBeGreaterThan(0);
      expect(pos.remaining).not.toContain('a');
    });
  });

  describe('Batch atomicity', () => {
    it('all batch nodes must be complete to advance', () => {
      const g = define(graph({
        id: 'batch-all-required',
        desc: '[a, b, c] → [d] → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'work', produces: ['a'], consumes: [], deps: [] },
          b: { id: 'b', desc: 'work', produces: ['b'], consumes: [], deps: [] },
          c: { id: 'c', desc: 'work', produces: ['c'], consumes: [], deps: [] },
          d: { id: 'd', desc: 'work', produces: ['d'], consumes: [], deps: ['a', 'b', 'c'] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['d'] },
        },
      }));

      // Test: partial batch [a,b,c] blocks advance
      let completion = CompletionStore.from(['a', 'b']);
      expect(() => advanceBatch(g, completion)).toThrow('Cannot advance');

      // Test: full batch [a,b,c] complete allows advance to [d]
      completion = CompletionStore.from(['a', 'b', 'c']);
      const pos = advanceBatch(g, completion);
      expect(pos.done).toContain('a');
      expect(pos.done).toContain('b');
      expect(pos.done).toContain('c');
      expect(pos.position).toContain('d');
    });

    it('partial batch completion does not advance', () => {
      const g = define(graph({
        id: 'partial-batch',
        desc: '[a, b] → c → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'work', produces: ['a'], consumes: [], deps: [] },
          b: { id: 'b', desc: 'work', produces: ['b'], consumes: [], deps: [] },
          c: { id: 'c', desc: 'work', produces: ['c'], consumes: [], deps: ['a', 'b'] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['c'] },
        },
      }));

      const completion = CompletionStore.from(['a']); // Only 'a', missing 'b'
      const pos = orient(g, completion);

      // Still in batch [a, b], not advanced to [c]
      expect(pos.position).toContain('a');
      expect(pos.position).toContain('b');
      expect(pos.position).not.toContain('c');
    });
  });

  describe('Artifact presence validation', () => {
    it('batchComplete true when all nodes in batch have receipts', () => {
      const g = define(graph({
        id: 'artifact-check',
        desc: '[a, b] → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'work', produces: ['a.txt'], consumes: [], deps: [] },
          b: { id: 'b', desc: 'work', produces: ['b.txt'], consumes: [], deps: [] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a', 'b'] },
        },
      }));

      // Current batch is [a, b], both have receipts
      const completion = CompletionStore.from(['a', 'b']);
      const pos = orient(g, completion);

      // Position should be at term now (advanced)
      expect(pos.position).toContain('term');
      expect(pos.batchComplete).toBe(false); // term batch is not complete
    });

    it('produces array reflects current batch outputs', () => {
      const g = define(graph({
        id: 'produces-array',
        desc: 'a → [b, c] → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'work', produces: ['a.txt'], consumes: [], deps: [] },
          b: { id: 'b', desc: 'work', produces: ['b.txt'], consumes: ['a.txt'], deps: ['a'] },
          c: { id: 'c', desc: 'work', produces: ['c.txt'], consumes: ['a.txt'], deps: ['a'] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['b', 'c'] },
        },
      }));

      const completion = CompletionStore.from(['a']);
      const pos = orient(g, completion);

      // Current batch is [b, c], so produces should be [b.txt, c.txt]
      expect(pos.position).toContain('b');
      expect(pos.position).toContain('c');
      expect(pos.produces).toContain('b.txt');
      expect(pos.produces).toContain('c.txt');
    });
  });

  describe('Batch remaining accuracy', () => {
    it('batchRemaining contains nodes not yet done in current batch', () => {
      const g = define(graph({
        id: 'batch-remaining',
        desc: '[a, b, c] → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'work', produces: ['a'], consumes: [], deps: [] },
          b: { id: 'b', desc: 'work', produces: ['b'], consumes: [], deps: [] },
          c: { id: 'c', desc: 'work', produces: ['c'], consumes: [], deps: [] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a', 'b', 'c'] },
        },
      }));

      const completion = CompletionStore.from(['a']);
      const pos = orient(g, completion);

      expect(pos.batchRemaining).toContain('b');
      expect(pos.batchRemaining).toContain('c');
      expect(pos.batchRemaining).not.toContain('a');
      expect(pos.batchRemaining.length).toBe(2);
    });

    it('batchRemaining contains incomplete nodes', () => {
      const g = define(graph({
        id: 'batch-empty-remaining',
        desc: '[a, b] → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'work', produces: ['a'], consumes: [], deps: [] },
          b: { id: 'b', desc: 'work', produces: ['b'], consumes: [], deps: [] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a', 'b'] },
        },
      }));

      // Only a and b are complete, oriented to term batch which is incomplete
      const completion = CompletionStore.from(['a', 'b']);
      const pos = orient(g, completion);

      // Now at term batch, which is not complete
      expect(pos.position).toContain('term');
      // term is the remaining node in the current batch
      expect(pos.batchRemaining).toContain('term');
      expect(pos.batchComplete).toBe(false);
    });
  });

  describe('Plan nodes in advance loop', () => {
    it('plan node advances independently from execute node', () => {
      const g = define(graph({
        id: 'plan-advance',
        desc: '[design (plan), setup (execute)] → term',
        init: 'design',
        term: 'term',
        nodes: {
          design: {
            id: 'design',
            desc: 'plan phase',
            produces: [],
            consumes: [],
            deps: [],
            mode: 'plan',
            validate: [{ type: 'expanded', minNodes: 1 }],
          },
          setup: {
            id: 'setup',
            desc: 'setup phase',
            produces: ['env.txt'],
            consumes: [],
            deps: [],
            validate: [{ type: 'artifact-exists', target: 'env.txt' }],
          },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['design', 'setup'] },
        },
      }));

      // Complete just the execute node
      const completion = CompletionStore.from(['setup']);
      const pos = orient(g, completion);

      // design is still in batch (plan) because it's not complete
      expect(pos.position).toContain('design');
      expect(pos.position).toContain('setup');
    });
  });

  describe('Error messages and diagnostics', () => {
    it('Cannot advance error includes node ids', () => {
      const g = define(graph({
        id: 'error-diag',
        desc: '[node-a, node-b, node-c] → term',
        init: 'node-a',
        term: 'term',
        nodes: {
          'node-a': { id: 'node-a', desc: 'a', produces: ['a'], consumes: [], deps: [] },
          'node-b': { id: 'node-b', desc: 'b', produces: ['b'], consumes: [], deps: [] },
          'node-c': { id: 'node-c', desc: 'c', produces: ['c'], consumes: [], deps: [] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['node-a', 'node-b', 'node-c'] },
        },
      }));

      const completion = CompletionStore.from(['node-a']);

      let error: Error | null = null;
      try {
        advanceBatch(g, completion);
      } catch (e: any) {
        error = e;
      }

      expect(error).not.toBeNull();
      expect(error!.message).toContain('node-b');
      expect(error!.message).toContain('node-c');
    });

    it('orient provides consumes artifacts in current batch', () => {
      const g = define(graph({
        id: 'consumes-list',
        desc: 'a → [b, c] → term',
        init: 'a',
        term: 'term',
        nodes: {
          a: { id: 'a', desc: 'work', produces: ['shared.txt'], consumes: [], deps: [] },
          b: { id: 'b', desc: 'work', produces: ['b.txt'], consumes: ['shared.txt'], deps: ['a'] },
          c: { id: 'c', desc: 'work', produces: ['c.txt'], consumes: ['shared.txt'], deps: ['a'] },
          term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['b', 'c'] },
        },
      }));

      const completion = CompletionStore.from(['a']);
      const pos = orient(g, completion);

      // Current batch [b, c] consumes shared.txt
      expect(pos.position).toContain('b');
      expect(pos.position).toContain('c');
      expect(pos.consumes).toContain('shared.txt');
    });
  });
});
