// CompletionStore unit tests — roundtrip, migration, receipts, atomicity.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CompletionStore,
  validateEntry,
  migrateEntry,
  hasPassingReceipt,
  loadCompletionsWithEvidence,
  saveCompletionWithEvidence,
  saveCompletion,
  loadCompletions,
  type CompletionRecordWithEvidence,
  type EvidenceRecord,
} from '../src/runtime/completion.ts';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'completion-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// === validateEntry ===

describe('validateEntry', () => {
  it('accepts valid record', () => {
    expect(validateEntry({ nodeId: 'a', completedAt: '2026-01-01' })).toBe(true);
  });

  it('rejects null', () => {
    expect(validateEntry(null)).toBe(false);
  });

  it('rejects missing nodeId', () => {
    expect(validateEntry({ completedAt: '2026-01-01' })).toBe(false);
  });

  it('rejects missing completedAt', () => {
    expect(validateEntry({ nodeId: 'a' })).toBe(false);
  });

  it('rejects non-object', () => {
    expect(validateEntry('string')).toBe(false);
    expect(validateEntry(42)).toBe(false);
  });
});

// === migrateEntry ===

describe('migrateEntry', () => {
  it('migrates legacy entry with string evidence', () => {
    const result = migrateEntry({ nodeId: 'a', completedAt: '2026-01-01', evidence: 'old format' });
    expect(result.nodeId).toBe('a');
    expect(result.legacy).toBe(true);
    expect(result.validationChecks).toBeUndefined();
  });

  it('migrates entry with array evidence to validationChecks', () => {
    const checks = [{ rule: 'shell', passed: true, evidence: 'ok' }];
    const result = migrateEntry({ nodeId: 'b', completedAt: '2026-01-01', evidence: checks });
    expect(result.validationChecks).toEqual(checks);
    expect(result.legacy).toBe(true);
  });

  it('preserves validationChecks if present', () => {
    const checks = [{ rule: 'test', passed: true, evidence: 'pass' }];
    const result = migrateEntry({ nodeId: 'c', completedAt: '2026-01-01', validationChecks: checks });
    expect(result.validationChecks).toEqual(checks);
  });

  it('preserves optional fields', () => {
    const result = migrateEntry({
      nodeId: 'd', completedAt: '2026-01-01',
      owner: 'agent-1', checkpointId: 'cp-1',
      gitSha: 'abc', treeSha: 'def',
    });
    expect(result.owner).toBe('agent-1');
    expect(result.checkpointId).toBe('cp-1');
    expect(result.gitSha).toBe('abc');
    expect(result.treeSha).toBe('def');
  });
});

// === hasPassingReceipt ===

describe('hasPassingReceipt', () => {
  it('returns false for undefined', () => {
    expect(hasPassingReceipt(undefined)).toBe(false);
  });

  it('returns true for legacy record (no checks, has completedAt)', () => {
    expect(hasPassingReceipt({ nodeId: 'a', completedAt: '2026-01-01' })).toBe(true);
  });

  it('returns true when all checks pass', () => {
    expect(hasPassingReceipt({
      nodeId: 'a', completedAt: '2026-01-01',
      validationChecks: [
        { rule: 'shell', passed: true, evidence: 'ok' },
        { rule: 'artifact', passed: true, evidence: 'exists' },
      ],
    })).toBe(true);
  });

  it('returns false when any check fails', () => {
    expect(hasPassingReceipt({
      nodeId: 'a', completedAt: '2026-01-01',
      validationChecks: [
        { rule: 'shell', passed: true, evidence: 'ok' },
        { rule: 'artifact', passed: false, evidence: 'missing' },
      ],
    })).toBe(false);
  });

  it('returns true for empty checks array (legacy path)', () => {
    expect(hasPassingReceipt({ nodeId: 'a', completedAt: '2026-01-01', validationChecks: [] })).toBe(true);
  });
});

// === CompletionStore ===

describe('CompletionStore', () => {
  describe('from() fixture', () => {
    it('creates passing records for listed IDs', () => {
      const store = CompletionStore.from(['a', 'b']);
      expect(store.hasPassing('a')).toBe(true);
      expect(store.hasPassing('b')).toBe(true);
      expect(store.hasPassing('c')).toBe(false);
    });
  });

  describe('empty()', () => {
    it('has no records', () => {
      const store = CompletionStore.empty();
      expect(store.hasPassing('any')).toBe(false);
      expect(store.allIds().size).toBe(0);
    });
  });

  describe('fromRecords()', () => {
    it('builds from explicit records', () => {
      const store = CompletionStore.fromRecords([
        { nodeId: 'pass', completedAt: '2026-01-01', validationChecks: [{ rule: 'test', passed: true, evidence: 'ok' }] },
        { nodeId: 'fail', completedAt: '2026-01-01', validationChecks: [{ rule: 'test', passed: false, evidence: 'bad' }] },
      ]);
      expect(store.hasPassing('pass')).toBe(true);
      expect(store.hasPassing('fail')).toBe(false);
      expect(store.hasFailing('fail')).toBe(true);
    });
  });

  describe('filterByDagId', () => {
    it('includes records with matching dagId', () => {
      const store = CompletionStore.fromRecords([
        { nodeId: 'a', completedAt: '2026-01-01', dagId: 'dag1', validationChecks: [{ rule: 't', passed: true, evidence: 'ok' }] },
        { nodeId: 'b', completedAt: '2026-01-01', dagId: 'dag2', validationChecks: [{ rule: 't', passed: true, evidence: 'ok' }] },
        { nodeId: 'c', completedAt: '2026-01-01', validationChecks: [{ rule: 't', passed: true, evidence: 'ok' }] },
      ]);
      const filtered = store.filterByDagId('dag1');
      expect(filtered.hasPassing('a')).toBe(true);
      expect(filtered.hasPassing('b')).toBe(false);
      expect(filtered.hasPassing('c')).toBe(true); // undefined dagId matches all
    });
  });

  describe('passingIds / failingIds', () => {
    it('returns correct sets', () => {
      const store = CompletionStore.fromRecords([
        { nodeId: 'p1', completedAt: '2026-01-01', validationChecks: [{ rule: 't', passed: true, evidence: 'ok' }] },
        { nodeId: 'p2', completedAt: '2026-01-01', validationChecks: [{ rule: 't', passed: true, evidence: 'ok' }] },
        { nodeId: 'f1', completedAt: '2026-01-01', validationChecks: [{ rule: 't', passed: false, evidence: 'bad' }] },
      ]);
      expect(store.passingIds()).toEqual(new Set(['p1', 'p2']));
      expect(store.failingIds()).toEqual(new Set(['f1']));
    });
  });

  describe('legacyIds', () => {
    it('returns IDs that pass without evidence', () => {
      const store = CompletionStore.fromRecords([
        { nodeId: 'legacy', completedAt: '2026-01-01' },
        { nodeId: 'evidenced', completedAt: '2026-01-01', validationChecks: [{ rule: 't', passed: true, evidence: 'ok' }] },
      ]);
      const legacy = store.legacyIds();
      expect(legacy.has('legacy')).toBe(true);
      expect(legacy.has('evidenced')).toBe(false);
    });
  });

  describe('evidence()', () => {
    it('returns checks for node with evidence', () => {
      const checks: EvidenceRecord[] = [{ rule: 'shell', passed: true, evidence: 'ok' }];
      const store = CompletionStore.fromRecords([
        { nodeId: 'a', completedAt: '2026-01-01', validationChecks: checks },
      ]);
      expect(store.evidence('a')).toEqual(checks);
    });

    it('returns empty for node without evidence', () => {
      const store = CompletionStore.fromRecords([
        { nodeId: 'a', completedAt: '2026-01-01' },
      ]);
      expect(store.evidence('a')).toEqual([]);
    });
  });
});

// === Persistence: save/load roundtrip ===

describe('persistence', () => {
  it('saveCompletionWithEvidence + loadCompletionsWithEvidence roundtrip', () => {
    const checks: EvidenceRecord[] = [{ rule: 'shell:test', passed: true, evidence: 'ok' }];
    saveCompletionWithEvidence(tmpDir, 'node-1', checks, 'owner-1', 'cp-1', undefined, 'test-dag');

    const loaded = loadCompletionsWithEvidence(tmpDir);
    expect(loaded.size).toBe(1);
    const record = loaded.get('node-1')!;
    expect(record.nodeId).toBe('node-1');
    expect(record.validationChecks).toEqual(checks);
    expect(record.dagId).toBe('test-dag');
  });

  it('saveCompletion + loadCompletions roundtrip', () => {
    saveCompletion(tmpDir, 'simple-1', 'owner');
    const loaded = loadCompletions(tmpDir);
    expect(loaded.has('simple-1')).toBe(true);
    expect(loaded.get('simple-1')!.owner).toBe('owner');
  });

  it('multiple saves accumulate records', () => {
    saveCompletionWithEvidence(tmpDir, 'a', [{ rule: 'r', passed: true, evidence: 'ok' }]);
    saveCompletionWithEvidence(tmpDir, 'b', [{ rule: 'r', passed: true, evidence: 'ok' }]);
    const loaded = loadCompletionsWithEvidence(tmpDir);
    expect(loaded.size).toBe(2);
    expect(loaded.has('a')).toBe(true);
    expect(loaded.has('b')).toBe(true);
  });

  it('atomic write produces valid JSON', () => {
    saveCompletionWithEvidence(tmpDir, 'x', [{ rule: 'r', passed: true, evidence: 'ok' }]);
    const raw = readFileSync(join(tmpDir, '.roadmap', 'completed.json'), 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('no .tmp file left after write', () => {
    saveCompletionWithEvidence(tmpDir, 'y', [{ rule: 'r', passed: true, evidence: 'ok' }]);
    expect(existsSync(join(tmpDir, '.roadmap', 'completed.json.tmp'))).toBe(false);
  });

  it('loadCompletionsWithEvidence returns empty for missing file', () => {
    const result = loadCompletionsWithEvidence(tmpDir);
    expect(result.size).toBe(0);
  });

  it('CompletionStore.loadOrEmpty returns empty for missing dir', () => {
    const store = CompletionStore.loadOrEmpty(join(tmpDir, 'nonexistent'));
    expect(store.allIds().size).toBe(0);
  });
});
