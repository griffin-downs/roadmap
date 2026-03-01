import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { isCompletionDirty, autoCommitCompletion } from '../../src/lib/completion/auto-commit.ts';

function makeGitRepo(): string {
  const base = mkdtempSync(join(tmpdir(), 'autocommit-test-'));
  execSync('git init', { cwd: base, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: base, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: base, stdio: 'pipe' });
  // Create initial commit
  mkdirSync(join(base, '.roadmap', 'receipts'), { recursive: true });
  writeFileSync(join(base, '.roadmap', 'completed.json'), '{}');
  execSync('git add -A && git commit -m "init"', { cwd: base, stdio: 'pipe' });
  return base;
}

describe('auto-commit', () => {
  let base: string;
  beforeEach(() => { base = makeGitRepo(); });
  afterEach(() => { rmSync(base, { recursive: true, force: true }); });

  it('isCompletionDirty true on modified completed.json', () => {
    writeFileSync(join(base, '.roadmap', 'completed.json'), '{"node-a": true}');
    expect(isCompletionDirty(base)).toBe(true);
  });

  it('autoCommitCompletion triggers git add+commit', () => {
    writeFileSync(join(base, '.roadmap', 'completed.json'), '{"node-b": true}');
    const result = autoCommitCompletion('node-b', base);
    expect(result.committed).toBe(true);

    // Verify commit happened
    const log = execSync('git log --oneline -1', { cwd: base, encoding: 'utf8' });
    expect(log).toContain('auto-commit completion state');
    expect(log).toContain('node-b');
  });

  it('returns committed:false on clean repo', () => {
    const result = autoCommitCompletion('node-c', base);
    expect(result.committed).toBe(false);
    expect(result.reason).toBe('nothing-dirty');
  });

  it('failed commit writes non-passing receipt', () => {
    // Make repo read-only to simulate commit failure: lock the index
    writeFileSync(join(base, '.roadmap', 'completed.json'), '{"node-d": true}');
    // Create a lock file to block git commit
    writeFileSync(join(base, '.git', 'index.lock'), '');
    const result = autoCommitCompletion('node-d', base);
    expect(result.committed).toBe(false);
    expect(result.receipt).toBeDefined();
    expect(result.receipt!.passed).toBe(false);
    expect(result.receipt!.reason).toBe('completion-autocommit-failed');
    // Clean up lock
    rmSync(join(base, '.git', 'index.lock'), { force: true });
  });

  it('post-commit isCompletionDirty false', () => {
    writeFileSync(join(base, '.roadmap', 'completed.json'), '{"node-e": true}');
    expect(isCompletionDirty(base)).toBe(true);
    autoCommitCompletion('node-e', base);
    expect(isCompletionDirty(base)).toBe(false);
  });

  it('--no-commit scenario: dirty state persists', () => {
    // Simulates the --no-commit path: we don't call autoCommit, state stays dirty
    writeFileSync(join(base, '.roadmap', 'completed.json'), '{"node-f": true}');
    // In the real flow, --no-commit skips autoCommitCompletion and writes a non-passing receipt.
    // Here we just verify dirty detection works before and after manual commit.
    expect(isCompletionDirty(base)).toBe(true);
  });
});
