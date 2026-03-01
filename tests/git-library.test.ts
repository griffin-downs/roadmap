import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { repoInfo, isClean, trackedFiles, fileHistory, artifactAtRef, shortHash } from '../src/lib/utils/git/git.ts';

const tmpRepo = join(process.cwd(), '.test-git-lib');

beforeAll(() => {
  rmSync(tmpRepo, { recursive: true, force: true });
  mkdirSync(tmpRepo, { recursive: true });
  execSync('git init', { cwd: tmpRepo, stdio: 'pipe' });
  execSync('git config user.email "test@example.com" && git config user.name "Test"', { cwd: tmpRepo, stdio: 'pipe' });
  writeFileSync(join(tmpRepo, 'file.txt'), 'content');
  execSync('git add file.txt && git commit -m "initial"', { cwd: tmpRepo, stdio: 'pipe' });
});

afterAll(() => {
  rmSync(tmpRepo, { recursive: true, force: true });
});

describe('git library', () => {
  it('repoInfo returns branch and HEAD', () => {
    const info = repoInfo(tmpRepo);
    expect(info.branch).toBe('master');
    expect(info.head.length).toBeGreaterThan(0);
    expect(info.clean).toBe(true);
  });

  it('isClean detects clean repo', () => {
    expect(isClean(tmpRepo)).toBe(true);
  });

  it('trackedFiles lists git-tracked files', () => {
    const files = trackedFiles(tmpRepo);
    expect(files).toContain('file.txt');
  });

  it('fileHistory returns commits for a file', () => {
    const history = fileHistory(tmpRepo, 'file.txt');
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].subject).toBe('initial');
  });

  it('artifactAtRef checks file existence at ref', () => {
    expect(artifactAtRef(tmpRepo, 'HEAD', 'file.txt')).toBe(true);
    expect(artifactAtRef(tmpRepo, 'HEAD', 'nonexistent.txt')).toBe(false);
  });

  it('shortHash returns abbreviated commit', () => {
    const hash = shortHash(tmpRepo);
    expect(hash.length).toBeLessThan(40);
    expect(hash.length).toBeGreaterThan(0);
  });
});
