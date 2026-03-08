import { test } from 'node:test';
import * as assert from 'node:assert';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deduplicatedCommit } from '../src/lib/git-helpers.ts';

test('deduplicatedCommit: creates commit when tree differs', () => {
  const tmpDir = mkdtempSync('/tmp/git-dedup-test-');

  try {
    // Initialize git repo
    execSync('git init && git config user.name Test && git config user.email test@test.com', {
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Create initial commit
    writeFileSync(join(tmpDir, 'file1.txt'), 'content1');
    execSync('git add file1.txt && git commit -m "initial"', {
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Modify file and commit via deduplicatedCommit
    writeFileSync(join(tmpDir, 'file1.txt'), 'content2');
    const result = deduplicatedCommit('changed', ['file1.txt'], tmpDir);

    assert.ok(result, 'should return true when commit is created');

    // Verify the commit was created
    const logs = execSync('git log --oneline', {
      cwd: tmpDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.match(logs, /changed/, 'commit message should be in log');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('deduplicatedCommit: skips commit when tree is identical to HEAD', () => {
  const tmpDir = mkdtempSync('/tmp/git-dedup-test-');

  try {
    // Initialize git repo
    execSync('git init && git config user.name Test && git config user.email test@test.com', {
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Create initial commit
    writeFileSync(join(tmpDir, 'file1.txt'), 'content1');
    execSync('git add file1.txt && git commit -m "initial"', {
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Try to commit identical tree (no changes)
    const result = deduplicatedCommit('duplicate', ['file1.txt'], tmpDir);

    assert.equal(result, false, 'should return false when tree is identical');

    // Verify no new commit was created
    const logs = execSync('git log --oneline', {
      cwd: tmpDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const logLines = logs.trim().split('\n');
    assert.equal(logLines.length, 1, 'should still have only initial commit');
    assert.match(logs, /initial/, 'log should contain initial commit');
    assert.doesNotMatch(logs, /duplicate/, 'log should not contain duplicate commit message');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('deduplicatedCommit: handles new files', () => {
  const tmpDir = mkdtempSync('/tmp/git-dedup-test-');

  try {
    // Initialize git repo
    execSync('git init && git config user.name Test && git config user.email test@test.com', {
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Create initial commit (empty, just to have HEAD)
    writeFileSync(join(tmpDir, '.gitkeep'), '');
    execSync('git add .gitkeep && git commit -m "init"', {
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Add new file and commit
    writeFileSync(join(tmpDir, 'newfile.txt'), 'new content');
    const result = deduplicatedCommit('add file', ['newfile.txt'], tmpDir);

    assert.ok(result, 'should return true when adding new file');

    // Verify commit was created
    const logs = execSync('git log --oneline', {
      cwd: tmpDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.match(logs, /add file/, 'new commit should be in log');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
