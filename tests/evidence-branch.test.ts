// Test: evidence-branch awareness

import { test } from 'node:test';
import * as assert from 'node:assert';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { saveCompletionWithEvidence, loadCompletionsWithEvidence } from '../src/lib/evidence/completion-evidence.ts';

test('evidence-branch: records branch name in completion receipt', () => {
  const tmpDir = mkdtempSync('/tmp/evidence-branch-test-');

  try {
    // Initialize git repo with feat/* branch
    execSync('git init && git config user.name Test && git config user.email test@test.com', {
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Create initial commit
    writeFileSync(join(tmpDir, 'file.txt'), 'content');
    execSync('git add file.txt && git commit -m "initial"', {
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Create feat branch and switch to it
    execSync('git checkout -b feat/test-branch', {
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Create .roadmap and head.json
    execSync('mkdir -p .roadmap', { cwd: tmpDir, stdio: 'pipe' });
    writeFileSync(join(tmpDir, '.roadmap', 'head.json'), JSON.stringify({ id: 'test-dag' }));

    // Record completion with evidence
    saveCompletionWithEvidence(
      tmpDir,
      'test-node',
      [{ rule: 'test', passed: true, evidence: 'pass' }]
    );

    // Load and verify branch is recorded
    const completions = loadCompletionsWithEvidence(tmpDir);
    const record = completions.get('test-node');

    assert.ok(record, 'completion record should exist');
    assert.strictEqual(record.nodeId, 'test-node');
    assert.strictEqual(record.branch, 'feat/test-branch', 'branch should be recorded');
    assert.ok(record.gitSha, 'gitSha should be recorded');
    assert.ok(record.treeSha, 'treeSha should be recorded');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('evidence-branch: includes dagId from head.json', () => {
  const tmpDir = mkdtempSync('/tmp/evidence-branch-dag-test-');

  try {
    execSync('git init && git config user.name Test && git config user.email test@test.com', {
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    writeFileSync(join(tmpDir, 'file.txt'), 'content');
    execSync('git add file.txt && git commit -m "initial"', {
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Create .roadmap with specific DAG id
    execSync('mkdir -p .roadmap', { cwd: tmpDir, stdio: 'pipe' });
    writeFileSync(join(tmpDir, '.roadmap', 'head.json'), JSON.stringify({ id: 'my-custom-dag' }));

    // Record completion
    saveCompletionWithEvidence(
      tmpDir,
      'node-xyz',
      [{ rule: 'test', passed: true, evidence: 'pass' }]
    );

    // Load and verify dagId is recorded
    const completions = loadCompletionsWithEvidence(tmpDir);
    const record = completions.get('node-xyz');

    assert.ok(record, 'completion record should exist');
    assert.strictEqual(record.dagId, 'my-custom-dag', 'dagId should match head.json');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
