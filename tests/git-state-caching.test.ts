import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { orient } from '../src/protocol.ts';
import { readGitState, isFresh, validateGitState } from '../src/lib/utils/git/git-state.schema.ts';
import { orientCached, updateRoadmapPosition } from '../src/lib/core/orient-cached.ts';

describe('git-state-caching', () => {
  let tmpRepo: string;

  beforeEach(() => {
    // Create temporary test repo
    tmpRepo = join(tmpdir(), `roadmap-test-${Date.now()}`);
    mkdirSync(tmpRepo, { recursive: true });
    process.chdir(tmpRepo);

    // Initialize git repo
    execSync('git init', { stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { stdio: 'ignore' });
    execSync('git config user.name "Test User"', { stdio: 'ignore' });
  });

  afterEach(() => {
    process.chdir('/');
    try {
      rmSync(tmpRepo, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('validates git-state.json schema', () => {
    const validState = {
      timestamp: Date.now(),
      branch: 'master',
      head: { hash: 'abc123', subject: 'test', phase: null, checkpoint: null },
      clean: true,
      lastCheckpoint: null,
      roadmapPosition: null,
      dirtyCommits: 0,
    };

    expect(validateGitState(validState)).toBe(true);
    expect(validateGitState(null)).toBe(false);
    expect(validateGitState({ branch: 'master' })).toBe(false);
  });

  it('checks freshness correctly', () => {
    const now = Date.now();
    const fresh = { timestamp: now - 5000, clean: true } as any;
    const stale = { timestamp: now - 15000, clean: true } as any;

    expect(isFresh(fresh, 10000)).toBe(true);
    expect(isFresh(stale, 10000)).toBe(false);
  });

  it('handles cache miss gracefully', async () => {
    // No .regent/git-state.json exists
    const result = await readGitState(tmpRepo);
    expect(result).toBeNull();
  });

  it('detects dirty files from git status', () => {
    writeFileSync('file1.txt', 'content');
    execSync('git add file1.txt', { stdio: 'ignore' });
    execSync('git commit -m "add file1"', { stdio: 'ignore' });

    writeFileSync('file1.txt', 'modified');
    writeFileSync('file2.txt', 'new');

    const status = execSync('git status --porcelain', { encoding: 'utf-8' });
    const dirty = status
      .split('\n')
      .filter(line => line.trim())
      .map(line => ({
        status: line.slice(0, 2).trim(),
        path: line.slice(3),
      }));

    expect(dirty.length).toBeGreaterThan(0);
    expect(dirty.some(d => d.path === 'file1.txt')).toBe(true);
  });

  it('infers phase from commit message', () => {
    const messages = [
      { msg: 'git-state-spec: define schema', expected: 'git-state' },
      { msg: 'bootstrap-gen: create template', expected: 'bootstrap' },
      { msg: 'unrelated work', expected: null },
    ];

    for (const { msg, expected } of messages) {
      const match = msg.match(/^(git-state|bootstrap|multi-repo|checkpoint|audit|regent)/);
      const phase = match ? match[1] : null;
      expect(phase).toBe(expected);
    }
  });

  it('saves and restores roadmap position', async () => {
    const regentDir = join(tmpRepo, '.regent');
    mkdirSync(regentDir, { recursive: true });

    const initialState = {
      timestamp: Date.now(),
      branch: 'master',
      head: { hash: 'abc123', subject: 'test', phase: null, checkpoint: null },
      clean: true,
      lastCheckpoint: null,
      roadmapPosition: null,
      dirtyCommits: 0,
    };

    writeFileSync(join(regentDir, 'git-state.json'), JSON.stringify(initialState, null, 2));

    // Update position (batch of one node)
    await updateRoadmapPosition(tmpRepo, ['git-state-spec']);

    // Read back
    const state = await readGitState(tmpRepo);
    expect(state?.roadmapPosition).toEqual(['git-state-spec']);
  });
});
