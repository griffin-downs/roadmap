import { describe, it, expect } from 'vitest';
import {
  syncCompletionWithProduces,
  validateCompletionSignature,
  repairMissingCompletions,
  enforceCompletionConsistency,
  diagnoseCompletionIssues,
} from '../src/lib/evidence/completion-enforcer.ts';
import type { Graph } from '../src/lib/protocol/types.ts';
import type { CompletionRecord } from '../src/lib/evidence/completion-evidence.ts';

describe('completion-enforcer', () => {
  const minimalGraph: Graph<'init' | 'a' | 'term'> = {
    id: 'test',
    desc: 'test',
    init: 'init',
    term: 'term',
    nodes: {
      init: { id: 'init', desc: '', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
      a: { id: 'a', desc: '', produces: ['a.txt'], consumes: [], deps: ['init'], validate: [], idempotent: true },
      term: { id: 'term', desc: '', produces: [], consumes: ['a.txt'], deps: ['a'], validate: [], idempotent: false },
    },
  };

  const validRecord: CompletionRecord = {
    nodeId: 'a',
    completedAt: '2026-03-02T10:00:00.000Z',
    owner: 'test-user',
    checkpointId: 'cp-20260302100000',
    validationChecks: [{ rule: 'artifact-exists', passed: true, evidence: 'test' }],
    gitSha: 'a'.repeat(40),
    treeSha: 'b'.repeat(40),
  };

  describe('validateCompletionSignature', () => {
    it('accepts valid signature', () => {
      const result = validateCompletionSignature(validRecord);
      expect(result.valid).toBe(true);
    });

    it('rejects invalid gitSha', () => {
      const record = { ...validRecord, gitSha: 'invalid' };
      const result = validateCompletionSignature(record);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('gitSha'))).toBe(true);
    });

    it('rejects invalid checkpoint', () => {
      const record = { ...validRecord, checkpointId: 'bad-checkpoint' };
      const result = validateCompletionSignature(record);
      expect(result.valid).toBe(false);
    });
  });

  describe('syncCompletionWithProduces', () => {
    it('returns valid when produces and records align', () => {
      const produces = new Map([['a', new Set(['a.txt'])]]);
      const result = syncCompletionWithProduces(minimalGraph, produces, [validRecord]);
      expect(result.valid).toBe(true);
    });

    it('detects missing completion record', () => {
      const produces = new Map([['a', new Set(['a.txt'])]]);
      const result = syncCompletionWithProduces(minimalGraph, produces, []);
      expect(result.valid).toBe(false);
      expect(result.misalignments.some(m => m.issue === 'missing-record')).toBe(true);
    });
  });

  describe('enforceCompletionConsistency', () => {
    it('returns valid for consistent state', () => {
      const produces = new Map([['a', new Set(['a.txt'])]]);
      const result = enforceCompletionConsistency(
        minimalGraph,
        produces,
        [validRecord],
        'a'.repeat(40),
        'b'.repeat(40),
        'validate',
      );
      expect(result.valid).toBe(true);
    });
  });
});
