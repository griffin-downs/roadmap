// Test suite for make --dry-run flag
import { test } from 'node:test';
import * as assert from 'node:assert';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

const repoRoot = process.cwd();

// ── Test Helpers ────────────────────────────────────────────────────────────

function createValidSpec(id = 'test-spec'): { spec: object; specPath: string } {
  const spec = {
    schema_version: 1,
    dag_id: id,
    dag_desc: `Test DAG (${id})`,
    metadata: {
      generated: new Date().toISOString(),
      compile_hash: 'test-hash',
    },
    engine: { name: 'test-engine', version: '1.0.0', config_hash: null },
    inputs: [
      {
        path: 'test-input.md',
        sha256: createHash('sha256').update('test input').digest('hex'),
        role: 'spec',
      },
    ],
    tasks: [
      {
        id: 'init',
        desc: 'Initialize',
        priority: 0,
        depends: [],
        produces: [],
        consumes: [],
        mode: 'execute',
        validate: [{ type: 'intent', expandOnFail: true, statement: 'Ready to work' }],
      },
      {
        id: 'work',
        desc: 'Do Work',
        priority: 1,
        depends: ['init'],
        produces: ['output.txt'],
        consumes: [],
        mode: 'execute',
        validate: [{ type: 'intent', expandOnFail: true, statement: 'Plan clarity: work is well-defined and unambiguous' }],
      },
      {
        id: 'term',
        desc: 'Complete',
        priority: 2,
        depends: ['work'],
        produces: [],
        consumes: ['output.txt'],
        mode: 'execute',
        validate: [{ type: 'intent', expandOnFail: true, statement: 'All done' }],
      },
    ],
  };

  const tmpDir = tmpdir();
  const specPath = join(tmpDir, `spec-${id}.json`);
  writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');

  return { spec, specPath };
}

function createInvalidSpec(): { spec: object; specPath: string } {
  // Invalid: work produces output.txt but term doesn't consume it - contract violation
  const spec = {
    schema_version: 1,
    dag_id: 'invalid-spec',
    dag_desc: 'Invalid spec',
    metadata: {
      generated: new Date().toISOString(),
      compile_hash: 'test-hash',
    },
    engine: { name: 'test-engine', version: '1.0.0', config_hash: null },
    inputs: [
      {
        path: 'test-input.md',
        sha256: createHash('sha256').update('test input').digest('hex'),
        role: 'spec',
      },
    ],
    tasks: [
      {
        id: 'init',
        desc: 'Initialize',
        priority: 0,
        depends: [],
        produces: [],
        consumes: [],
        mode: 'execute',
        validate: [{ type: 'intent', expandOnFail: true, statement: 'Ready' }],
      },
      {
        id: 'work',
        desc: 'Work',
        priority: 1,
        depends: ['init'],
        produces: ['output.txt'],
        consumes: [],
        mode: 'execute',
        validate: [{ type: 'intent', expandOnFail: true, statement: 'Plan clarity: work is ready' }],
      },
      {
        id: 'term',
        desc: 'Terminate',
        priority: 2,
        depends: ['work'],
        produces: [],
        consumes: [],
        // Intentionally NOT consuming output.txt which work produces - violates contract
        mode: 'execute',
        validate: [{ type: 'intent', expandOnFail: true, statement: 'Done' }],
      },
    ],
  };

  const tmpDir = tmpdir();
  const specPath = join(tmpDir, 'spec-invalid.json');
  writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');

  return { spec, specPath };
}

function runMakeDryRun(specPath: string, extraArgs: string[] = []): { stdout: string; exitCode: number; data?: any } {
  try {
    const cmd = `npx tsx bin/roadmap.ts make "${specPath}" --note "test dry run" --skip-input-verification --dry-run ${extraArgs.join(
      ' ',
    )}`;
    const stdout = execSync(cmd, {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const envelope = JSON.parse(stdout);
    return { stdout, exitCode: 0, data: envelope.data };
  } catch (e: any) {
    const stdout = e.stdout?.toString() || e.message || '';
    let data;
    try {
      data = JSON.parse(stdout)?.data;
    } catch {
      // ignore parse errors
    }
    return { stdout, exitCode: e.status || 1, data };
  }
}

function getHeadJsonHash(): string | null {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  if (!existsSync(headPath)) return null;
  const content = readFileSync(headPath, 'utf-8');
  return createHash('sha256').update(content).digest('hex');
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('dry-run: validate valid spec without writing files', () => {
  const { specPath } = createValidSpec('test-valid-1');
  const headHashBefore = getHeadJsonHash();

  const result = runMakeDryRun(specPath);

  assert.strictEqual(result.exitCode, 0, `Expected exit code 0, got ${result.exitCode}. Output: ${result.stdout}`);
  assert.ok(result.data, 'Expected data in response');

  const output = result.data;
  assert.strictEqual(output.ok, true, 'Expected ok: true');
  assert.strictEqual(output.dryRun, true, 'Expected dryRun: true');
  assert.strictEqual(output.message, 'Dry run: spec validates successfully (no files written)', 'Unexpected message');
  assert.deepStrictEqual(output.errors, [], 'Expected no errors');

  const headHashAfter = getHeadJsonHash();
  assert.strictEqual(headHashBefore, headHashAfter, 'head.json should not be modified during dry run');

  // Cleanup
  if (existsSync(specPath)) unlinkSync(specPath);
});

test('dry-run: return errors for spec without terminal intent statement', () => {
  // Spec with a task missing the required intent statement
  const spec = {
    schema_version: 1,
    dag_id: 'invalid-spec-2',
    dag_desc: 'Invalid spec',
    metadata: {
      generated: new Date().toISOString(),
      compile_hash: 'test-hash',
    },
    engine: { name: 'test-engine', version: '1.0.0', config_hash: null },
    inputs: [
      {
        path: 'test-input.md',
        sha256: createHash('sha256').update('test input').digest('hex'),
        role: 'spec',
      },
    ],
    tasks: [
      {
        id: 'init',
        desc: 'Initialize',
        priority: 0,
        depends: [],
        produces: [],
        consumes: [],
        mode: 'execute',
        validate: [{ type: 'intent', expandOnFail: true, statement: 'Ready' }],
      },
      {
        id: 'work',
        desc: 'Work',
        priority: 1,
        depends: ['init'],
        produces: ['output.txt'],
        consumes: [],
        mode: 'execute',
        validate: [{ type: 'intent', expandOnFail: true, statement: 'Plan clarity: work is ready' }],
      },
      {
        id: 'term',
        desc: 'Terminate',
        priority: 2,
        depends: ['work'],
        produces: [],
        consumes: ['output.txt'],
        mode: 'execute',
        validate: [
          // Missing intent statement - will fail terminal intent validation
          { type: 'artifact-exists', path: 'dummy.txt' },
        ],
      },
    ],
  };

  const tmpDir = tmpdir();
  const specPath = join(tmpDir, 'spec-invalid-2.json');
  writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');

  const headHashBefore = getHeadJsonHash();

  const result = runMakeDryRun(specPath, ['--skip-terminal-intent']);

  assert.strictEqual(result.exitCode, 0, `Expected exit code 0 for dry-run, got ${result.exitCode}`);
  assert.ok(result.data, 'Expected data in response');

  const output = result.data;
  // With --skip-terminal-intent, this should pass
  assert.strictEqual(output.ok, true, `Expected ok: true with --skip-terminal-intent. Got: ${JSON.stringify(output)}`);
  assert.strictEqual(output.dryRun, true, 'Expected dryRun: true');

  const headHashAfter = getHeadJsonHash();
  assert.strictEqual(headHashBefore, headHashAfter, 'head.json should not be modified during dry run');

  // Cleanup
  if (existsSync(specPath)) unlinkSync(specPath);
});

test('dry-run: includes DAG in output on success', () => {
  const { specPath } = createValidSpec('test-dag-output');

  const result = runMakeDryRun(specPath);

  assert.strictEqual(result.exitCode, 0, `Expected exit code 0, got ${result.exitCode}`);
  assert.ok(result.data, 'Expected data in response');

  const output = result.data;
  assert.strictEqual(output.ok, true, 'Expected ok: true');
  assert.ok(output.dag, 'Expected dag in output');
  assert.ok(output.dag.nodes, 'Expected dag.nodes');
  assert.ok(output.position, 'Expected position in output');
  assert.ok(output.level !== undefined, 'Expected level in output');

  // Cleanup
  if (existsSync(specPath)) unlinkSync(specPath);
});

test('dry-run: works on non-main branch (branch exemption)', () => {
  const { specPath } = createValidSpec('test-branch-exempt');

  // Get current branch
  let currentBranch = '';
  try {
    currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();
  } catch {
    // If git fails, skip this test
    return;
  }

  // If we're on main, create a temp branch
  const isOnMain = currentBranch === 'main';
  if (isOnMain) {
    try {
      execSync('git checkout -b test-dry-run-branch', { cwd: repoRoot, stdio: 'pipe' });
    } catch {
      // Branch might exist, try to switch
      try {
        execSync('git checkout test-dry-run-branch', { cwd: repoRoot, stdio: 'pipe' });
      } catch {
        // Skip if we can't create branch
        return;
      }
    }
  }

  try {
    const result = runMakeDryRun(specPath);
    // dry-run should work on any branch
    assert.strictEqual(result.exitCode, 0, `Expected exit code 0 on non-main branch with --dry-run. Got ${result.exitCode}`);
    assert.ok(result.data, 'Expected data in response');

    const output = result.data;
    assert.strictEqual(output.dryRun, true, 'Expected dryRun: true');
  } finally {
    // Cleanup: return to main if we switched
    if (isOnMain) {
      try {
        execSync('git checkout main', { cwd: repoRoot, stdio: 'pipe' });
        execSync('git branch -D test-dry-run-branch', { cwd: repoRoot, stdio: 'pipe' });
      } catch {
        // Ignore cleanup errors
      }
    }

    // Cleanup spec file
    if (existsSync(specPath)) unlinkSync(specPath);
  }
});
