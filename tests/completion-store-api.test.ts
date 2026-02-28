import { describe, it, expect } from 'vitest';
import { CompletionStore } from '../src/lib/completion-context.ts';

describe('CompletionStore extended API', () => {
  const store = CompletionStore.fromRecords([
    {
      nodeId: 'passing-node',
      completedAt: '2026-01-01T00:00:00Z',
      validationChecks: [
        { rule: 'shell', passed: true, evidence: 'exit 0' },
        { rule: 'artifact-exists', passed: true, evidence: 'file found' },
      ],
    },
    {
      nodeId: 'failing-node',
      completedAt: '2026-01-01T00:00:00Z',
      validationChecks: [
        { rule: 'shell', passed: true, evidence: 'exit 0' },
        { rule: 'artifact-exists', passed: false, evidence: 'file not found' },
      ],
    },
    {
      nodeId: 'empty-checks',
      completedAt: '2026-01-01T00:00:00Z',
      validationChecks: [],
    },
    {
      nodeId: 'no-checks',
      completedAt: '2026-01-01T00:00:00Z',
    },
  ]);

  describe('hasRecord', () => {
    it('returns true for any node with a record', () => {
      expect(store.hasRecord('passing-node')).toBe(true);
      expect(store.hasRecord('failing-node')).toBe(true);
      expect(store.hasRecord('empty-checks')).toBe(true);
      expect(store.hasRecord('no-checks')).toBe(true);
    });

    it('returns false for unknown nodes', () => {
      expect(store.hasRecord('unknown')).toBe(false);
    });
  });

  describe('hasFailing', () => {
    it('returns true when any check has passed: false', () => {
      expect(store.hasFailing('failing-node')).toBe(true);
    });

    it('returns false for all-passing', () => {
      expect(store.hasFailing('passing-node')).toBe(false);
    });

    it('returns false for empty checks array', () => {
      expect(store.hasFailing('empty-checks')).toBe(false);
    });

    it('returns false for no checks field', () => {
      expect(store.hasFailing('no-checks')).toBe(false);
    });

    it('returns false for unknown node', () => {
      expect(store.hasFailing('unknown')).toBe(false);
    });
  });

  describe('record', () => {
    it('returns raw record for known node', () => {
      const rec = store.record('passing-node');
      expect(rec).toBeDefined();
      expect(rec!.nodeId).toBe('passing-node');
      expect(rec!.validationChecks).toHaveLength(2);
    });

    it('returns undefined for unknown node', () => {
      expect(store.record('unknown')).toBeUndefined();
    });
  });

  describe('allIds', () => {
    it('returns all node IDs in store regardless of status', () => {
      const ids = store.allIds();
      expect(ids).toEqual(new Set(['passing-node', 'failing-node', 'empty-checks', 'no-checks']));
    });

    it('empty store returns empty set', () => {
      expect(CompletionStore.empty().allIds()).toEqual(new Set());
    });
  });

  describe('failingIds', () => {
    it('returns only nodes with failing checks', () => {
      expect(store.failingIds()).toEqual(new Set(['failing-node']));
    });
  });

  describe('fromRecords', () => {
    it('builds store from explicit record array', () => {
      const s = CompletionStore.fromRecords([
        { nodeId: 'a', completedAt: '', validationChecks: [{ rule: 'x', passed: true, evidence: 'y' }] },
      ]);
      expect(s.hasPassing('a')).toBe(true);
      expect(s.hasRecord('a')).toBe(true);
      expect(s.allIds()).toEqual(new Set(['a']));
    });
  });

  describe('hasPassing still works correctly', () => {
    it('passing node is passing', () => {
      expect(store.hasPassing('passing-node')).toBe(true);
    });

    it('failing node is not passing', () => {
      expect(store.hasPassing('failing-node')).toBe(false);
    });

    it('empty checks with completedAt is legacy-passing', () => {
      expect(store.hasPassing('empty-checks')).toBe(true);
    });

    it('no checks field with completedAt is legacy-passing', () => {
      expect(store.hasPassing('no-checks')).toBe(true);
    });
  });
});
