import { describe, it, expect } from 'vitest';
import {
  assertContiguousBatch,
  assertClaimability,
  assertRetirementConsistency,
  validateBatchInvariants,
  diagnoseBatchInvariantViolation,
} from '../src/lib/protocol/batch-invariants.ts';
import type { Graph } from '../src/lib/protocol/types.ts';

describe('batch-invariants', () => {
  const minimalGraph: Graph<'init' | 'a' | 'b' | 'term'> = {
    id: 'test',
    desc: 'test',
    init: 'init',
    term: 'term',
    nodes: {
      init: { id: 'init', desc: '', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
      a: { id: 'a', desc: '', produces: ['a.txt'], consumes: [], deps: ['init'], validate: [], idempotent: true },
      b: { id: 'b', desc: '', produces: ['b.txt'], consumes: ['a.txt'], deps: ['a'], validate: [], idempotent: true },
      term: { id: 'term', desc: '', produces: [], consumes: ['b.txt'], deps: ['b'], validate: [], idempotent: false },
    },
  };

  describe('assertContiguousBatch', () => {
    it('returns valid for empty batch', () => {
      const result = assertContiguousBatch(minimalGraph, []);
      expect(result.valid).toBe(true);
    });

    it('returns valid for single-node batch', () => {
      const result = assertContiguousBatch(minimalGraph, ['a']);
      expect(result.valid).toBe(true);
    });

    it('returns valid for contiguous batch', () => {
      const result = assertContiguousBatch(minimalGraph, ['a', 'b']);
      expect(result.valid).toBe(true);
    });
  });

  describe('assertClaimability', () => {
    it('returns valid when all deps are completed', () => {
      const completed = new Set(['init', 'a']);
      const result = assertClaimability(minimalGraph, ['b'], completed);
      expect(result.valid).toBe(true);
    });

    it('returns invalid when deps are not completed', () => {
      const completed = new Set(['init']);
      const result = assertClaimability(minimalGraph, ['b'], completed);
      expect(result.valid).toBe(false);
      expect(result.unclaimable).toContain('b');
    });
  });

  describe('assertRetirementConsistency', () => {
    it('returns valid when no retired nodes in batch', () => {
      const result = assertRetirementConsistency(['a', 'b'], new Set());
      expect(result.valid).toBe(true);
    });

    it('returns invalid when retired node in batch', () => {
      const result = assertRetirementConsistency(['a', 'b'], new Set(['a']));
      expect(result.valid).toBe(false);
    });
  });

  describe('validateBatchInvariants', () => {
    it('returns valid for sound batch', () => {
      const completed = new Set(['init', 'a']);
      const result = validateBatchInvariants(minimalGraph, ['b'], completed, new Set());
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });
});
