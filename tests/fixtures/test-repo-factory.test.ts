import { describe, it, expect, afterEach } from 'vitest';
import { TestRepo, createTestRepo } from './test-repo-factory.ts';

describe('TestRepo Factory', () => {
  let repo: TestRepo;

  afterEach(() => {
    if (repo) repo.teardown();
  });

  describe('initialization', () => {
    it('creates temp directory', () => {
      repo = createTestRepo();
      expect(repo.fileExists('.roadmap')).toBe(true);
      expect(repo.fileExists('src')).toBe(true);
    });

    it('initializes git repo', () => {
      repo = createTestRepo();
      expect(repo.fileExists('.git')).toBe(true);
    });

    it('sets up git config', () => {
      repo = createTestRepo();
      const sha = repo.createCommit('initial');
      expect(sha).toMatch(/^[a-f0-9]{40}$/);
    });
  });

  describe('git operations', () => {
    it('creates commits and returns SHA', () => {
      repo = createTestRepo();
      const sha = repo.createCommit('test commit');
      expect(sha).toMatch(/^[a-f0-9]{40}$/);
      expect(sha.length).toBe(40);
    });

    it('tracks multiple commits', () => {
      repo = createTestRepo();
      const sha1 = repo.createCommit('commit 1', 'file1.txt', 'content1');
      const sha2 = repo.createCommit('commit 2', 'file2.txt', 'content2');
      expect(sha1).not.toBe(sha2);
    });

    it('getCurrentSha returns HEAD', () => {
      repo = createTestRepo();
      repo.createCommit('test');
      const sha = repo.getCurrentSha();
      expect(sha).toMatch(/^[a-f0-9]{40}$/);
    });

    it('createCommit with custom file', () => {
      repo = createTestRepo();
      const sha = repo.createCommit('add module', 'src/module.ts', 'export const x = 1;');
      expect(sha).toBeTruthy();
      expect(repo.readFile('src/module.ts')).toContain('export');
    });
  });

  describe('file operations', () => {
    it('writes and reads files', () => {
      repo = createTestRepo();
      repo.writeFile('test.txt', 'hello world');
      expect(repo.readFile('test.txt')).toBe('hello world');
    });

    it('checks file existence', () => {
      repo = createTestRepo();
      repo.writeFile('exists.txt', 'content');
      expect(repo.fileExists('exists.txt')).toBe(true);
      expect(repo.fileExists('missing.txt')).toBe(false);
    });

    it('creates nested directories', () => {
      repo = createTestRepo();
      repo.writeFile('src/lib/module.ts', 'code');
      expect(repo.fileExists('src/lib/module.ts')).toBe(true);
    });

    it('resolves absolute paths', () => {
      repo = createTestRepo();
      const path = repo.resolve('test.txt');
      expect(path).toContain('roadmap-test-');
      expect(path).toContain('test.txt');
      expect(path).toMatch(/^\/tmp\//);
    });
  });

  describe('roadmap state operations', () => {
    it('sets and gets head.json', () => {
      repo = createTestRepo();
      const dag = { id: 'test-dag', nodes: {} };
      repo.setHeadJson(dag);
      expect(repo.getHeadJson()).toEqual(dag);
    });

    it('returns null for missing head.json', () => {
      repo = createTestRepo();
      expect(repo.getHeadJson()).toBeNull();
    });

    it('sets and gets git-state.json', () => {
      repo = createTestRepo();
      repo.createCommit('initial');
      const sha = repo.getCurrentSha();
      const state = { lastCommit: sha, timestamp: new Date().toISOString() };
      repo.setGitState(state);
      expect(repo.getGitState()).toEqual(state);
    });

    it('returns null for missing git-state.json', () => {
      repo = createTestRepo();
      expect(repo.getGitState()).toBeNull();
    });

    it('sets and gets recovery-state.json', () => {
      repo = createTestRepo();
      const recovery = { lastHeadSha: 'abc', lastGitState: 'def', recoveredAt: new Date().toISOString(), mismatchCount: 1 };
      repo.setRecoveryState(recovery);
      expect(repo.getRecoveryState()).toEqual(recovery);
    });

    it('returns null for missing recovery-state.json', () => {
      repo = createTestRepo();
      expect(repo.getRecoveryState()).toBeNull();
    });
  });

  describe('trail operations', () => {
    it('returns empty array when trail missing', () => {
      repo = createTestRepo();
      expect(repo.getTrailEntries()).toEqual([]);
    });

    it('appends trail entries', () => {
      repo = createTestRepo();
      repo.appendTrailEntry({ ts: '2026-03-02T00:00:00Z', cmd: 'orient' });
      const entries = repo.getTrailEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].cmd).toBe('orient');
    });

    it('appends multiple entries', () => {
      repo = createTestRepo();
      repo.appendTrailEntry({ ts: '2026-03-02T00:00:00Z', cmd: 'orient' });
      repo.appendTrailEntry({ ts: '2026-03-02T00:00:01Z', cmd: 'complete', detail: { nodeId: 'n1' } });
      const entries = repo.getTrailEntries();
      expect(entries).toHaveLength(2);
      expect(entries[1].detail.nodeId).toBe('n1');
    });

    it('parses complex trail entries', () => {
      repo = createTestRepo();
      const entry = {
        ts: '2026-03-02T00:00:00Z',
        cmd: 'complete',
        level: 2,
        detail: { nodeId: 'work-node', produces: ['output.txt'] },
      };
      repo.appendTrailEntry(entry);
      const entries = repo.getTrailEntries();
      expect(entries[0]).toEqual(entry);
    });
  });

  describe('alternate DAG operations', () => {
    it('creates alternate DAG files', () => {
      repo = createTestRepo();
      const dag = { id: 'alt-dag', desc: 'Alternate DAG', nodes: {} };
      repo.createAlternateDag('alt-dag', dag);
      expect(repo.fileExists('.roadmap/head.alt-dag.json')).toBe(true);
    });

    it('stores and retrieves alternate DAG content', () => {
      repo = createTestRepo();
      const dag = { id: 'other', desc: 'Other DAG', nodes: { a: { id: 'a' } } };
      repo.createAlternateDag('other', dag);
      const content = JSON.parse(repo.readFile('.roadmap/head.other.json'));
      expect(content.id).toBe('other');
      expect(content.nodes.a).toBeDefined();
    });
  });

  describe('lifecycle', () => {
    it('tears down cleanly', () => {
      repo = createTestRepo();
      const path = repo.resolve('.');
      expect(repo.fileExists('.')).toBe(true);
      repo.teardown();
      // Verify teardown doesn't throw
      expect(true).toBe(true);
    });

    it('handles multiple teardowns gracefully', () => {
      repo = createTestRepo();
      repo.teardown();
      repo.teardown(); // Should not throw
      expect(true).toBe(true);
    });

    it('static setup factory works', () => {
      repo = TestRepo.setup('my-test');
      expect(repo.fileExists('.roadmap')).toBe(true);
      expect(repo.fileExists('.git')).toBe(true);
    });
  });

  describe('integration scenario', () => {
    it('supports full hardening workflow setup', () => {
      repo = createTestRepo();

      // Create initial commit
      const sha1 = repo.createCommit('init', 'test.txt', 'initial');

      // Setup head.json aligned with git
      const dag = { id: 'test-dag', nodes: { init: { id: 'init' } }, init: 'init', term: 'init' };
      repo.setHeadJson(dag);

      // Setup git-state.json
      repo.setGitState({
        lastCommit: sha1,
        timestamp: new Date().toISOString(),
        message: 'init',
      });

      // Add trail entry
      repo.appendTrailEntry({
        ts: new Date().toISOString(),
        cmd: 'complete',
        level: 0,
        detail: { nodeId: 'init' },
      });

      // Verify complete state
      expect(repo.getHeadJson().id).toBe('test-dag');
      expect(repo.getGitState().lastCommit).toBe(sha1);
      expect(repo.getTrailEntries()).toHaveLength(1);
    });
  });
});
