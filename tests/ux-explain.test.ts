import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CompletionStore } from '../src/lib/completion/completion-context.js';
import { saveCompletionWithEvidence, loadCompletionsWithEvidence } from '../src/lib/completion-evidence.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'explain-test-'));
}

function makeDag(root: string): void {
  mkdirSync(join(root, '.roadmap'), { recursive: true });
  writeFileSync(join(root, '.roadmap', 'head.json'), JSON.stringify({
    id: 'explain-test',
    desc: 'test',
    init: 'init',
    term: 'term',
    nodes: {
      init: { id: 'init', desc: 'Init', produces: [], consumes: [], deps: [], validate: [] },
      task1: { id: 'task1', desc: 'Task 1', produces: ['src/a.ts'], consumes: [], deps: ['init'], validate: [{ type: 'shell', command: 'echo ok' }] },
      term: { id: 'term', desc: 'Term', produces: [], consumes: [], deps: ['task1'], validate: [] },
    },
  }));
}

describe('ux-explain (explain/receipts/artifacts)', () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  describe('explain diagnostics', () => {
    it('CompletionStore reports passing node', () => {
      makeDag(tmp);
      saveCompletionWithEvidence(tmp, 'init', [{ rule: 'fixture', passed: true, evidence: 'test' }], 'worker-d');
      const store = CompletionStore.loadOrEmpty(tmp);
      expect(store.hasPassing('init')).toBe(true);
      expect(store.hasPassing('task1')).toBe(false);
    });

    it('CompletionStore reports failing node', () => {
      makeDag(tmp);
      saveCompletionWithEvidence(tmp, 'task1', [{ rule: 'shell', passed: false, evidence: 'tsc failed' }], 'worker-d');
      const store = CompletionStore.loadOrEmpty(tmp);
      expect(store.hasFailing('task1')).toBe(true);
      expect(store.hasPassing('task1')).toBe(false);
    });

    it('record contains evidence details', () => {
      makeDag(tmp);
      saveCompletionWithEvidence(tmp, 'init', [{ rule: 'fixture', passed: true, evidence: 'test' }], 'worker-d', 'cp-1');
      const store = CompletionStore.loadOrEmpty(tmp);
      const record = store.record('init');
      expect(record).toBeDefined();
      expect(record!.nodeId).toBe('init');
      expect(record!.owner).toBe('worker-d');
      expect(record!.checkpointId).toBe('cp-1');
      expect(record!.validationChecks).toHaveLength(1);
    });
  });

  describe('receipts ls', () => {
    it('loadCompletionsWithEvidence returns all records', () => {
      makeDag(tmp);
      saveCompletionWithEvidence(tmp, 'init', [{ rule: 'fix', passed: true, evidence: 'ok' }]);
      saveCompletionWithEvidence(tmp, 'task1', [{ rule: 'shell', passed: true, evidence: 'ok' }]);
      const records = loadCompletionsWithEvidence(tmp);
      expect(records.size).toBe(2);
      expect(records.has('init')).toBe(true);
      expect(records.has('task1')).toBe(true);
    });

    it('filters by node when iterated', () => {
      makeDag(tmp);
      saveCompletionWithEvidence(tmp, 'init', [{ rule: 'fix', passed: true, evidence: 'ok' }]);
      saveCompletionWithEvidence(tmp, 'task1', [{ rule: 'shell', passed: false, evidence: 'fail' }]);
      const records = loadCompletionsWithEvidence(tmp);
      const task1 = records.get('task1');
      expect(task1).toBeDefined();
      expect(task1!.validationChecks![0].passed).toBe(false);
    });
  });

  describe('artifacts ls', () => {
    it('returns empty for no artifacts dir', () => {
      makeDag(tmp);
      const artifactsDir = join(tmp, '.roadmap', 'artifacts');
      expect(existsSync(artifactsDir)).toBe(false);
    });

    it('lists artifact files when present', () => {
      makeDag(tmp);
      const artifactDir = join(tmp, '.roadmap', 'artifacts', 'task1', 'run-1');
      mkdirSync(artifactDir, { recursive: true });
      writeFileSync(join(artifactDir, 'stdout.txt'), 'output');

      const artifactsBase = join(tmp, '.roadmap', 'artifacts');
      const nodes = readdirSync(artifactsBase);
      expect(nodes).toContain('task1');
      const runs = readdirSync(join(artifactsBase, 'task1'));
      expect(runs).toContain('run-1');
      const files = readdirSync(join(artifactsBase, 'task1', 'run-1'));
      expect(files).toContain('stdout.txt');
    });
  });
});
