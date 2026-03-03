import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

// Helper: create a temp git repo with .roadmap dir and gitsafe config
function makeTestRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'intake-enforcement-'));
  execSync('git init -b main', { cwd: root, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: root, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: root, stdio: 'pipe' });
  mkdirSync(join(root, '.roadmap'), { recursive: true });
  // Gitsafe enforcement config (required by CLI)
  writeFileSync(join(root, '.roadmap', 'enforcement.json'), JSON.stringify({
    version: '1.1',
    denylist: ['node_modules/**', '.env'],
    maxBytes: 1048576,
    auditTrail: false,
    allowedFilePatterns: ['**/*.ts', '**/*.json', '**/*.md'],
  }));
  // Initial commit so git works
  writeFileSync(join(root, 'init.txt'), 'init');
  execSync('git add -A && git commit -m "init"', { cwd: root, stdio: 'pipe' });
  return root;
}

// Helper: run roadmap CLI in a test repo (captures both stdout and stderr)
function runRoadmap(repoRoot: string, argsStr: string): { stdout: string; exitCode: number } {
  const binPath = join(__dirname, '..', 'bin', 'roadmap.ts');
  try {
    const stdout = execSync(`npx tsx ${binPath} ${argsStr} 2>&1`, {
      cwd: repoRoot,
      stdio: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
    }).toString();
    return { stdout, exitCode: 0 };
  } catch (e: any) {
    const output = (e.stdout?.toString() ?? '') + (e.stderr?.toString() ?? '');
    return { stdout: output, exitCode: e.status ?? 1 };
  }
}

// Helper: build a valid SpecIR JSON
function validSpec(overrides?: Partial<any>): any {
  return {
    schema_version: 1,
    engine: { name: 'spec-kit', version: '0.1.0', config_hash: null },
    dag_id: 'test-dag',
    dag_desc: 'Test DAG',
    inputs: [],
    tasks: [
      {
        id: 'setup',
        desc: 'Setup task',
        priority: 0,
        depends: [],
        produces: ['setup.txt'],
        consumes: [],
        mode: 'execute',
        validate: [{ type: 'artifact-exists' }],
      },
      {
        id: 'build',
        desc: 'Build task',
        priority: 1,
        depends: ['setup'],
        produces: ['build.txt'],
        consumes: ['setup.txt'],
        mode: 'execute',
        validate: [
          { type: 'artifact-exists' },
          { type: 'intent', expandOnFail: true, description: 'All build artifacts produced' },
        ],
      },
    ],
    metadata: {
      generated: '2026-03-03T00:00:00Z',
      compile_hash: 'abc123',
    },
    ...overrides,
  };
}

describe('CLI intake enforcement', () => {
  let repo: string;

  beforeEach(() => { repo = makeTestRepo(); });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

  // --- roadmap make: spec validation ---

  it('rejects raw DAG JSON (has nodes, no tasks)', () => {
    const rawDag = { id: 'raw', init: 'start', term: 'end', nodes: { start: { id: 'start', desc: 'S', produces: [], consumes: [], deps: [], validate: [] }, end: { id: 'end', desc: 'E', produces: [], consumes: [], deps: ['start'], validate: [] } } };
    const specPath = join(repo, 'raw-dag.json');
    writeFileSync(specPath, JSON.stringify(rawDag));

    const result = runRoadmap(repo, `make raw-dag.json --note "test"`);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain('raw DAG detected');
    expect(result.stdout).toContain('spec pipeline');
  });

  it('rejects spec missing tasks array', () => {
    const badSpec = { schema_version: 1, metadata: { generated: 'now', compile_hash: 'x' } };
    writeFileSync(join(repo, 'bad.json'), JSON.stringify(badSpec));

    const result = runRoadmap(repo, `make bad.json --note "test"`);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain('missing \\"tasks\\" array');
  });

  it('rejects spec missing metadata', () => {
    const badSpec = { schema_version: 1, tasks: [{ id: 'a', desc: 'A', priority: 0, depends: [], produces: [], consumes: [], mode: 'execute', validate: [] }] };
    writeFileSync(join(repo, 'bad.json'), JSON.stringify(badSpec));

    const result = runRoadmap(repo, `make bad.json --note "test"`);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain('missing \\"metadata\\" object');
  });

  it('rejects spec missing schema_version', () => {
    const badSpec = { tasks: [], metadata: { generated: 'now', compile_hash: 'x' } };
    writeFileSync(join(repo, 'bad.json'), JSON.stringify(badSpec));

    const result = runRoadmap(repo, `make bad.json --note "test"`);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain('missing \\"schema_version\\"');
  });

  it('accepts valid SpecIR and creates DAG + spec-origin', () => {
    const spec = validSpec();
    writeFileSync(join(repo, 'spec.json'), JSON.stringify(spec));

    const result = runRoadmap(repo, `make spec.json --note "test"`);
    expect(result.exitCode).toBe(0);

    // head.json should exist
    expect(existsSync(join(repo, '.roadmap', 'head.json'))).toBe(true);

    // spec-origin.json should exist with correct fields
    const originPath = join(repo, '.roadmap', 'spec-origin.json');
    expect(existsSync(originPath)).toBe(true);
    const origin = JSON.parse(readFileSync(originPath, 'utf-8'));
    expect(origin.schemaVersion).toBe(1);
    expect(origin.engine).toBe('spec-kit');
    expect(origin.dagId).toBe('test-dag');
    expect(typeof origin.spec_sha).toBe('string');
    expect(typeof origin.importedAt).toBe('string');
  });

  it('error message for raw DAG includes proper workflow steps', () => {
    const rawDag = { id: 'raw', nodes: { a: {} } };
    writeFileSync(join(repo, 'raw.json'), JSON.stringify(rawDag));

    const result = runRoadmap(repo, `make raw.json --note "test"`);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain('roadmap spec plan');
    expect(result.stdout).toContain('roadmap make');
    expect(result.stdout).toContain('roadmap show');
  });

  // --- consolidation enforcement ---

  it('auto-consolidation is disabled (no auto-discovery)', () => {
    // Write two DAG files that would previously be auto-merged
    writeFileSync(join(repo, '.roadmap', 'phase-a.json'), JSON.stringify({
      id: 'phase-a', init: 'a-start', term: 'a-end',
      nodes: { 'a-start': { id: 'a-start', desc: 'S', produces: [], consumes: [], deps: [], validate: [] }, 'a-end': { id: 'a-end', desc: 'E', produces: [], consumes: [], deps: ['a-start'], validate: [] } },
    }));
    writeFileSync(join(repo, '.roadmap', 'phase-b.json'), JSON.stringify({
      id: 'phase-b', init: 'b-start', term: 'b-end',
      nodes: { 'b-start': { id: 'b-start', desc: 'S', produces: [], consumes: [], deps: [], validate: [] }, 'b-end': { id: 'b-end', desc: 'E', produces: [], consumes: [], deps: ['b-start'], validate: [] } },
    }));

    // Orient should not auto-merge these into head.json
    const result = runRoadmap(repo, `orient --note "check"`);
    // Without head.json, orient should report untracked, not auto-consolidate
    expect(result.stdout).toContain('untracked');
  });

  it('valid spec creates provenance chain (spec-origin fields)', () => {
    const spec = validSpec({ dag_id: 'provenance-test' });
    writeFileSync(join(repo, 'spec.json'), JSON.stringify(spec));

    runRoadmap(repo, `make spec.json --note "provenance"`);

    const origin = JSON.parse(readFileSync(join(repo, '.roadmap', 'spec-origin.json'), 'utf-8'));
    expect(origin.dagId).toBe('provenance-test');
    expect(origin.compile_hash).toBe('abc123');
    expect(origin.spec_sha).toMatch(/^[a-f0-9]{64}$/);
  });
});
