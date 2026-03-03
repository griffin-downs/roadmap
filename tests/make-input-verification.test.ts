// Tests for: roadmap make — input artifact verification

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const BIN = join(__dirname, '..', 'bin', 'roadmap.ts');
const RUNNER = 'npx tsx';

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

// Valid 2-task spec (init != term) so DAG passes define/verify/check
const VALID_TASKS = [
  { id: 'setup', desc: 'Setup', priority: 0, depends: [], produces: ['setup.txt'], consumes: [], mode: 'execute', validate: [{ type: 'artifact-exists' }] },
  { id: 'build', desc: 'Build', priority: 1, depends: ['setup'], produces: ['out.txt'], consumes: ['setup.txt'], mode: 'execute', validate: [{ type: 'artifact-exists' }] },
];

function makeSpec(root: string, overrides: Record<string, unknown> = {}): string {
  const specPath = join(root, 'spec.json');
  const spec = {
    schema_version: 1,
    engine: { name: 'spec-kit', version: '1.0.0', config_hash: null },
    dag_id: 'test-dag',
    inputs: [],
    tasks: VALID_TASKS,
    metadata: { generated: '2026-03-03T00:00:00Z', compile_hash: 'abc123' },
    ...overrides,
  };
  writeFileSync(specPath, JSON.stringify(spec));
  return specPath;
}

function initTestRepo(root: string) {
  mkdirSync(join(root, '.roadmap'), { recursive: true });
  writeFileSync(join(root, '.roadmap', 'enforcement.json'), JSON.stringify({
    version: '1.1',
    denylist: ['node_modules/**'],
    maxBytes: 10485760,
    auditTrail: false,
    branchRestrictions: { cliEnforcement: false },
  }));
  try { execSync('git rev-parse --git-dir', { cwd: root, stdio: 'pipe' }); } catch {
    execSync('git init && git checkout -b main', { cwd: root, stdio: 'pipe' });
    execSync('git config user.email "test@test.com" && git config user.name "test"', { cwd: root, stdio: 'pipe' });
    writeFileSync(join(root, '.gitignore'), '');
    execSync('git add -A && git commit -m "init"', { cwd: root, stdio: 'pipe' });
  }
}

function runMake(root: string, specPath: string, extraArgs = ''): { ok: boolean; stdout: string; stderr: string; exitCode: number } {
  initTestRepo(root);

  try {
    const stdout = execSync(
      `${RUNNER} ${BIN} make ${specPath} --note "test" --skip-terminal-intent ${extraArgs}`,
      { cwd: root, stdio: 'pipe', env: { ...process.env, NODE_ENV: 'test' } }
    ).toString();
    return { ok: true, stdout, stderr: '', exitCode: 0 };
  } catch (e: any) {
    return {
      ok: false,
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
      exitCode: e.status ?? 1,
    };
  }
}

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'make-input-'));
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('make input verification', () => {
  it('rejects spec with missing inputs array', () => {
    const specPath = makeSpec(tmpRoot, { inputs: undefined });
    const raw = JSON.parse(readFileSync(specPath, 'utf-8'));
    delete raw.inputs;
    writeFileSync(specPath, JSON.stringify(raw));

    const result = runMake(tmpRoot, specPath);
    expect(result.ok).toBe(false);
    expect(result.stdout).toContain('missing or empty');
  });

  it('rejects spec with empty inputs array', () => {
    const specPath = makeSpec(tmpRoot, { inputs: [] });
    const result = runMake(tmpRoot, specPath);
    expect(result.ok).toBe(false);
    expect(result.stdout).toContain('missing or empty');
  });

  it('rejects spec with no spec/tasks/plan role', () => {
    const specPath = makeSpec(tmpRoot, {
      inputs: [{ path: 'foo.txt', sha256: 'aaa', role: 'other' }],
    });
    const result = runMake(tmpRoot, specPath);
    expect(result.ok).toBe(false);
    expect(result.stdout).toContain('no input with spec/tasks/plan role');
  });

  it('rejects spec with wrong sha256 for existing file', () => {
    const inputContent = 'hello world';
    writeFileSync(join(tmpRoot, 'source.md'), inputContent);
    const wrongHash = 'deadbeef'.repeat(8);

    const specPath = makeSpec(tmpRoot, {
      inputs: [{ path: 'source.md', sha256: wrongHash, role: 'spec' }],
    });
    const result = runMake(tmpRoot, specPath);
    expect(result.ok).toBe(false);
    expect(result.stdout).toContain('hash mismatch');
  });

  it('passes with correct sha256 for existing file', () => {
    const inputContent = 'hello world';
    writeFileSync(join(tmpRoot, 'source.md'), inputContent);
    const correctHash = sha256(inputContent);

    const specPath = makeSpec(tmpRoot, {
      inputs: [{ path: 'source.md', sha256: correctHash, role: 'spec' }],
    });
    const result = runMake(tmpRoot, specPath);
    expect(result.ok).toBe(true);
  });

  it('warns (does not fail) for missing input file', () => {
    const specPath = makeSpec(tmpRoot, {
      inputs: [{ path: 'nonexistent.md', sha256: 'aaa', role: 'spec' }],
    });
    const result = runMake(tmpRoot, specPath);
    expect(result.ok).toBe(true);
  });

  it('skips verification with --skip-input-verification', () => {
    const specPath = makeSpec(tmpRoot, { inputs: undefined });
    const raw = JSON.parse(readFileSync(specPath, 'utf-8'));
    delete raw.inputs;
    writeFileSync(specPath, JSON.stringify(raw));

    const result = runMake(tmpRoot, specPath, '--skip-input-verification');
    expect(result.ok).toBe(true);
  });

  it('rejects malformed input entry', () => {
    const specPath = makeSpec(tmpRoot, {
      inputs: [{ path: 'foo.txt' }],
    });
    const result = runMake(tmpRoot, specPath);
    expect(result.ok).toBe(false);
    expect(result.stdout).toContain('malformed input entry');
  });
});
