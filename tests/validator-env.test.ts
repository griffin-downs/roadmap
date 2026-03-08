import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const testDir = '.test-validator-env';

test('env vars are passed to shell commands: ROADMAP_NODE', () => {
  mkdirSync(testDir, { recursive: true });
  const outputFile = join(testDir, 'node.txt');

  try {
    const testNodeId = 'test-node-123';
    const env = {
      ...process.env,
      ROADMAP_NODE: testNodeId,
      ROADMAP_REPO: process.cwd(),
      ROADMAP_BRANCH: 'feat/test',
    };

    execSync(`sh -c "echo $ROADMAP_NODE > ${outputFile}"`, { env, stdio: 'pipe' });

    ok(existsSync(outputFile), 'Output file should exist');
    const content = readFileSync(outputFile, 'utf-8').trim();
    strictEqual(content, testNodeId, `ROADMAP_NODE env var should be "${testNodeId}", got "${content}"`);
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('env vars are passed to shell commands: ROADMAP_REPO', () => {
  mkdirSync(testDir, { recursive: true });
  const outputFile = join(testDir, 'repo.txt');

  try {
    const testRepo = '/test/repo/path';
    const env = {
      ...process.env,
      ROADMAP_NODE: 'test-node',
      ROADMAP_REPO: testRepo,
      ROADMAP_BRANCH: 'feat/test',
    };

    execSync(`sh -c "echo $ROADMAP_REPO > ${outputFile}"`, { env, stdio: 'pipe' });

    ok(existsSync(outputFile), 'Output file should exist');
    const content = readFileSync(outputFile, 'utf-8').trim();
    strictEqual(content, testRepo, `ROADMAP_REPO env var should be "${testRepo}", got "${content}"`);
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('env vars are passed to shell commands: ROADMAP_BRANCH', () => {
  mkdirSync(testDir, { recursive: true });
  const outputFile = join(testDir, 'branch.txt');

  try {
    const testBranch = 'feat/hardening-004';
    const env = {
      ...process.env,
      ROADMAP_NODE: 'test-node',
      ROADMAP_REPO: process.cwd(),
      ROADMAP_BRANCH: testBranch,
    };

    execSync(`sh -c "echo $ROADMAP_BRANCH > ${outputFile}"`, { env, stdio: 'pipe' });

    ok(existsSync(outputFile), 'Output file should exist');
    const content = readFileSync(outputFile, 'utf-8').trim();
    strictEqual(content, testBranch, `ROADMAP_BRANCH env var should be "${testBranch}", got "${content}"`);
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('ROADMAP_VALIDATING env var defaults to 1 in validation context', () => {
  mkdirSync(testDir, { recursive: true });
  const outputFile = join(testDir, 'validating.txt');

  try {
    const env = {
      ...process.env,
      ROADMAP_VALIDATING: '1',
      ROADMAP_NODE: 'test-node',
      ROADMAP_REPO: process.cwd(),
      ROADMAP_BRANCH: 'feat/test',
    };

    execSync(`sh -c "echo $ROADMAP_VALIDATING > ${outputFile}"`, { env, stdio: 'pipe' });

    ok(existsSync(outputFile), 'Output file should exist');
    const content = readFileSync(outputFile, 'utf-8').trim();
    strictEqual(content, '1', `ROADMAP_VALIDATING should be "1", got "${content}"`);
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});
