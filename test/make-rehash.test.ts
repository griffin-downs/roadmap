// Test suite for make auto-rehash behavior
import { test } from 'node:test';
import * as assert from 'node:assert';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

const repoRoot = process.cwd();

// ── Test Helpers ────────────────────────────────────────────────────────────

function createValidSpec(id = 'test-spec', inputHash?: string): { spec: object; specPath: string; inputPath: string; inputHash: string } {
  const inputContent = 'test input content for rehash';
  const actualHash = createHash('sha256').update(inputContent).digest('hex');
  const hashToUse = inputHash || actualHash;

  // Write input to repoRoot so make resolves it correctly
  const inputPath = join(repoRoot, `test-input-${id}.md`);
  const specPath = join(tmpdir(), `${id}.json`);

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
        path: `test-input-${id}.md`,
        sha256: hashToUse,
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
        validate: [{ type: 'intent', expandOnFail: true, statement: 'Plan the work with clarity' }],
      },
      {
        id: 'work',
        desc: 'Do work',
        priority: 50,
        depends: ['init'],
        produces: ['output.txt'],
        consumes: [],
        mode: 'execute',
        validate: [
          { type: 'intent', expandOnFail: true, statement: 'Plan with clarity', confidence: 0.9, evaluator: 'self' },
          { type: 'artifact-exists', path: 'output.txt' },
        ],
      },
      {
        id: 'term',
        desc: 'Terminate',
        priority: 100,
        depends: ['work'],
        produces: [],
        consumes: ['output.txt'],
        mode: 'execute',
        validate: [{ type: 'intent', expandOnFail: true, statement: 'Work complete', confidence: 0.9, evaluator: 'self' }],
      },
    ],
  };

  writeFileSync(inputPath, inputContent);
  writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');

  return { spec, specPath, inputPath, inputHash: actualHash };
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('make: auto-updates stale input hashes', async (t) => {
  const { specPath, inputPath, inputHash } = createValidSpec('rehash-test', 'wrong-hash-value');

  try {
    execSync(`node bin/roadmap.ts make ${specPath} --note "test"`, {
      cwd: repoRoot,
      stdio: 'pipe',
    });

    // Verify spec file was updated with correct hash
    const updatedSpec = JSON.parse(readFileSync(specPath, 'utf-8'));
    assert.strictEqual(updatedSpec.inputs[0].sha256, inputHash, 'Should update input hash to correct value');
  } finally {
    if (existsSync(specPath)) unlinkSync(specPath);
    if (existsSync(inputPath)) unlinkSync(inputPath);
    if (existsSync(join(repoRoot, '.roadmap', 'head.json'))) {
      rmSync(join(repoRoot, '.roadmap'), { recursive: true, force: true });
    }
  }
});

test('make: does not modify spec if hash matches', async (t) => {
  const { specPath, inputPath } = createValidSpec('rehash-no-change-test', undefined);

  try {
    const originalContent = readFileSync(specPath, 'utf-8');

    execSync(`node bin/roadmap.ts make ${specPath} --note "test"`, {
      cwd: repoRoot,
      stdio: 'pipe',
    });

    const currentContent = readFileSync(specPath, 'utf-8');
    assert.strictEqual(currentContent, originalContent, 'Should not modify spec when hash already matches');
  } finally {
    if (existsSync(specPath)) unlinkSync(specPath);
    if (existsSync(inputPath)) unlinkSync(inputPath);
    if (existsSync(join(repoRoot, '.roadmap', 'head.json'))) {
      rmSync(join(repoRoot, '.roadmap'), { recursive: true, force: true });
    }
  }
});

test('make: handles multiple inputs with mixed hash states', async (t) => {
  const input1Path = join(repoRoot, 'test-input-1.md');
  const input2Path = join(repoRoot, 'test-input-2.md');
  const input1Content = 'content one';
  const input2Content = 'content two';

  const hash1 = createHash('sha256').update(input1Content).digest('hex');
  const hash2 = createHash('sha256').update(input2Content).digest('hex');

  writeFileSync(input1Path, input1Content);
  writeFileSync(input2Path, input2Content);

  const spec = {
    schema_version: 1,
    dag_id: 'multi-input-test',
    dag_desc: 'Test with multiple inputs',
    metadata: {
      generated: new Date().toISOString(),
      compile_hash: 'test-hash',
    },
    engine: { name: 'test-engine', version: '1.0.0', config_hash: null },
    inputs: [
      { path: 'test-input-1.md', sha256: hash1, role: 'spec' },
      { path: 'test-input-2.md', sha256: 'wrong-hash-for-input-2', role: 'plan' },
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
        validate: [{ type: 'intent', expandOnFail: true, statement: 'Plan the work' }],
      },
      {
        id: 'work',
        desc: 'Do work',
        priority: 50,
        depends: ['init'],
        produces: ['output.txt'],
        consumes: [],
        mode: 'execute',
        validate: [
          { type: 'intent', expandOnFail: true, statement: 'Plan with clarity', confidence: 0.9, evaluator: 'self' },
          { type: 'artifact-exists', path: 'output.txt' },
        ],
      },
      {
        id: 'term',
        desc: 'Terminate',
        priority: 100,
        depends: ['work'],
        produces: [],
        consumes: ['output.txt'],
        mode: 'execute',
        validate: [{ type: 'intent', expandOnFail: true, statement: 'Done', confidence: 0.9, evaluator: 'self' }],
      },
    ],
  };

  const specPath = join(tmpdir(), 'multi-input-test.json');
  writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');

  try {
    execSync(`node bin/roadmap.ts make ${specPath} --note "test"`, {
      cwd: repoRoot,
      stdio: 'pipe',
    });

    const updatedSpec = JSON.parse(readFileSync(specPath, 'utf-8'));
    assert.strictEqual(updatedSpec.inputs[0].sha256, hash1, 'First input hash should remain correct');
    assert.strictEqual(updatedSpec.inputs[1].sha256, hash2, 'Second input hash should be updated');
  } finally {
    [specPath, input1Path, input2Path].forEach(p => {
      if (existsSync(p)) unlinkSync(p);
    });
    if (existsSync(join(repoRoot, '.roadmap', 'head.json'))) {
      rmSync(join(repoRoot, '.roadmap'), { recursive: true, force: true });
    }
  }
});
