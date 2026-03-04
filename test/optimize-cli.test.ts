import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');

test('optimize command with valid DAG', async (t) => {
  const testDir = join(tmpdir(), `roadmap-optimize-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    // Initialize git repo in test directory
    execSync('git init', { cwd: testDir, stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { cwd: testDir, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: testDir, stdio: 'pipe' });
    execSync('git checkout -b main', { cwd: testDir, stdio: 'pipe' });

    // Create minimal DAG with a simple structure
    const roadmapDir = join(testDir, '.roadmap');
    mkdirSync(roadmapDir, { recursive: true });

    const simpleDAG = {
      id: 'test-dag',
      desc: 'Simple test DAG',
      init: 'start',
      term: 'finish',
      nodes: {
        start: {
          id: 'start',
          desc: 'Start node',
          produces: [],
          consumes: [],
          deps: [],
          validate: [],
        },
        middle1: {
          id: 'middle1',
          desc: 'Middle node 1',
          produces: ['output1.txt'],
          consumes: [],
          deps: ['start'],
          validate: [{ type: 'artifact-exists' }],
        },
        middle2: {
          id: 'middle2',
          desc: 'Middle node 2',
          produces: ['output2.txt'],
          consumes: [],
          deps: ['start'],
          validate: [{ type: 'artifact-exists' }],
        },
        finish: {
          id: 'finish',
          desc: 'Finish node',
          produces: [],
          consumes: [],
          deps: ['middle1', 'middle2'],
          validate: [],
        },
      },
    };

    const headPath = join(roadmapDir, 'head.json');
    writeFileSync(headPath, JSON.stringify(simpleDAG, null, 2));

    // Run optimize command using the repo's roadmap binary from repo root
    const output = execSync(`npx tsx ${join(repoRoot, 'bin/roadmap.ts')} optimize --note "test"`, {
      cwd: testDir,
      encoding: 'utf-8',
    });

    const result = JSON.parse(output);
    assert.ok(result.ok, 'Command should succeed');
    assert.ok(result.data, 'Should have data field');
    assert.ok(Array.isArray(result.data.removable), 'Should have removable array');
    assert.ok(result.data.metrics, 'Should have metrics object');
    assert.ok(typeof result.data.metrics.levelsBefore === 'number', 'Should have levelsBefore in metrics');
    assert.ok(typeof result.data.metrics.levelsAfter === 'number', 'Should have levelsAfter in metrics');
    assert.ok(result.data.enforcement, 'Should have enforcement object');
  } finally {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  }
});

test('optimize command without DAG returns error', async (t) => {
  const testDir = join(tmpdir(), `roadmap-optimize-no-dag-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    // Initialize git repo in test directory
    execSync('git init', { cwd: testDir, stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { cwd: testDir, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: testDir, stdio: 'pipe' });
    execSync('git checkout -b main', { cwd: testDir, stdio: 'pipe' });

    // Run optimize without a DAG
    try {
      execSync(`npx tsx ${join(repoRoot, 'bin/roadmap.ts')} optimize --note "test"`, {
        cwd: testDir,
        encoding: 'utf-8',
      });
      assert.fail('Should have thrown an error');
    } catch (e: any) {
      const output = e.stdout || e.stderr || '';
      // The command should exit with error code 1 when no DAG exists
      assert.ok(e.status === 1 || output.includes('No roadmap tracked'), 'Should fail with appropriate error');
    }
  } finally {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  }
});
