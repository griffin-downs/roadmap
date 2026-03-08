// @module orient-branch
// @entry test

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execSync } from 'child_process';

test('orient: adds branch and worktree fields to output', () => {
  const repoRoot = '/home/griffin/src/.dev/roadmap';

  // Run orient command and parse JSON output
  const output = execSync('npx tsx bin/roadmap.ts orient --json --note "test"', {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  const data = JSON.parse(output).data;

  // Verify branch field exists and is a non-empty string
  assert(typeof data.branch === 'string', 'branch should be a string');
  assert(data.branch.length > 0, 'branch should be non-empty');

  // Verify worktree field exists and is a boolean
  assert(typeof data.worktree === 'boolean', 'worktree should be a boolean');
  assert.equal(data.worktree, false, 'worktree should be false on main branch');

  // Verify branch matches current git branch
  const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf-8',
  }).trim();

  assert.equal(data.branch, gitBranch, 'branch field should match git branch');
});

test('orient: branch field is non-empty in current repo', () => {
  const repoRoot = '/home/griffin/src/.dev/roadmap';

  const output = execSync('npx tsx bin/roadmap.ts orient --json --note "test"', {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  const data = JSON.parse(output).data;

  // Verify branch is feat/hardening-004 on this branch
  assert.equal(data.branch, 'feat/hardening-004', 'should be on feat/hardening-004 branch');
  assert.equal(data.worktree, false, 'should not be in a worktree on main feature branch');
});
