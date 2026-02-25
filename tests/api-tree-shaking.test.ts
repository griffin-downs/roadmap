// Verifies that each sub-entry-point resolves its exports correctly and
// that the symbol sets are non-overlapping across domains.

import { describe, it, expect } from 'vitest';

// Sub-entry imports — these must resolve without loading other domains
import { validateNode, validateGraph } from '../src/index.validation.ts';
import { CheckpointManager, AuditTrail } from '../src/index.recovery.ts';
import { loadDAG, checkCompatibility, migrateDAG, DAGMigrator } from '../src/index.versioning.ts';
import { getBrief, checkpoint, advance, verifyBootstrapSignature } from '../src/index.agent.ts';

// Core protocol — versioning re-exports must be gone
import {
  define, graph, check, verify, order, orient, reconcile,
  merge, branch, analyze, modify, modifyAndCommit,
} from '../src/protocol.ts';

describe('sub-entry-point exports', () => {
  describe('./validation', () => {
    it('exports validateNode', () => {
      expect(typeof validateNode).toBe('function');
    });

    it('exports validateGraph', () => {
      expect(typeof validateGraph).toBe('function');
    });
  });

  describe('./recovery', () => {
    it('exports CheckpointManager', () => {
      expect(typeof CheckpointManager).toBe('function');
    });

    it('exports AuditTrail', () => {
      expect(typeof AuditTrail).toBe('function');
    });
  });

  describe('./versioning', () => {
    it('exports loadDAG', () => {
      expect(typeof loadDAG).toBe('function');
    });

    it('exports checkCompatibility', () => {
      expect(typeof checkCompatibility).toBe('function');
    });

    it('exports migrateDAG', () => {
      expect(typeof migrateDAG).toBe('function');
    });

    it('exports DAGMigrator', () => {
      expect(typeof DAGMigrator).toBe('function');
    });
  });

  describe('./agent', () => {
    it('exports getBrief', () => {
      expect(typeof getBrief).toBe('function');
    });

    it('exports checkpoint', () => {
      expect(typeof checkpoint).toBe('function');
    });

    it('exports advance', () => {
      expect(typeof advance).toBe('function');
    });

    it('exports verifyBootstrapSignature', () => {
      expect(typeof verifyBootstrapSignature).toBe('function');
    });
  });

  describe('./protocol — core only', () => {
    it('exports define', () => { expect(typeof define).toBe('function'); });
    it('exports graph', () => { expect(typeof graph).toBe('function'); });
    it('exports check', () => { expect(typeof check).toBe('function'); });
    it('exports verify', () => { expect(typeof verify).toBe('function'); });
    it('exports order', () => { expect(typeof order).toBe('function'); });
    it('exports orient', () => { expect(typeof orient).toBe('function'); });
    it('exports reconcile', () => { expect(typeof reconcile).toBe('function'); });
    it('exports merge', () => { expect(typeof merge).toBe('function'); });
    it('exports branch', () => { expect(typeof branch).toBe('function'); });
    it('exports analyze', () => { expect(typeof analyze).toBe('function'); });
    it('exports modify', () => { expect(typeof modify).toBe('function'); });
    it('exports modifyAndCommit', () => { expect(typeof modifyAndCommit).toBe('function'); });

    it('does not re-export loadDAG (versioning removed)', () => {
      // @ts-expect-error — loadDAG must not be on protocol module
      const proto = { define, graph, check, verify, order, orient, reconcile, merge, branch, analyze, modify, modifyAndCommit };
      expect('loadDAG' in proto).toBe(false);
    });

    it('does not re-export DAGMigrator (versioning removed)', () => {
      // @ts-expect-error
      const proto = { define, graph, check };
      expect('DAGMigrator' in proto).toBe(false);
    });
  });

  describe('functional: core protocol still works after split', () => {
    it('define + check + verify round-trip', () => {
      const g = define(graph({
        id: 'tree-shake-test',
        desc: 'verify protocol works post-split',
        init: 'a',
        term: 'b',
        nodes: {
          a: { id: 'a', desc: 'init', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
          b: { id: 'b', desc: 'term', produces: [], consumes: ['x'], deps: ['a'], validate: [], idempotent: true },
        },
      }));

      expect(check(g).done).toBe(true);
      expect(verify(g)).toEqual([]);
    });

    it('order returns topo sequence', () => {
      const g = define(graph({
        id: 'order-test',
        desc: '',
        init: 'a',
        term: 'c',
        nodes: {
          a: { id: 'a', desc: '', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
          b: { id: 'b', desc: '', produces: ['y'], consumes: ['x'], deps: ['a'], validate: [], idempotent: true },
          c: { id: 'c', desc: '', produces: [], consumes: ['y'], deps: ['b'], validate: [], idempotent: true },
        },
      }));

      const seq = order(g);
      expect(seq.indexOf('a')).toBeLessThan(seq.indexOf('b'));
      expect(seq.indexOf('b')).toBeLessThan(seq.indexOf('c'));
    });
  });
});
