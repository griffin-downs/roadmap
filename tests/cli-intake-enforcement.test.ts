import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { validateNode } from '../src/lib/protocol/validation.ts';
import { validateConsumesNonEmpty, validateConsumesHaveProducer } from '../src/lib/validate-dag.ts';

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
    inputs: [
      { path: 'requirements.md', sha256: 'a'.repeat(64), role: 'spec' as const },
    ],
    tasks: [
      {
        id: 'setup',
        desc: 'Setup task',
        produces: ['setup.txt'],
        consumes: [],
        mode: 'execute',
        validate: [{ type: 'artifact-exists' }],
      },
      {
        id: 'build',
        desc: 'Build task',
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
    expect(result.stdout).toContain('tasks[]');
  });

  it('rejects spec missing tasks array', () => {
    const badSpec = { schema_version: 1, metadata: { generated: 'now', compile_hash: 'x' } };
    writeFileSync(join(repo, 'bad.json'), JSON.stringify(badSpec));

    const result = runRoadmap(repo, `make bad.json --note "test"`);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain('Missing \\"tasks\\" array');
  });

  it('rejects spec missing metadata', () => {
    const badSpec = { schema_version: 1, tasks: [{ id: 'a', desc: 'A', produces: [], consumes: [], mode: 'execute', validate: [] }] };
    writeFileSync(join(repo, 'bad.json'), JSON.stringify(badSpec));

    const result = runRoadmap(repo, `make bad.json --note "test"`);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain('Missing \\"metadata\\" object');
  });

  it('rejects spec missing schema_version', () => {
    const badSpec = { tasks: [], metadata: { generated: 'now', compile_hash: 'x' } };
    writeFileSync(join(repo, 'bad.json'), JSON.stringify(badSpec));

    const result = runRoadmap(repo, `make bad.json --note "test"`);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain('Missing \\"schema_version\\"');
  });

  it('accepts valid SpecIR and creates DAG + spec-origin', () => {
    const spec = validSpec();
    writeFileSync(join(repo, 'spec.json'), JSON.stringify(spec));

    const result = runRoadmap(repo, `make spec.json --note "test"`);
    expect(result.exitCode).toBe(0);

    // head.json should exist
    const headPath = join(repo, '.roadmap', 'head.json');
    expect(existsSync(headPath)).toBe(true);

    // _origin should be embedded in head.json with correct fields
    const dag = JSON.parse(readFileSync(headPath, 'utf-8'));
    const origin = dag._origin;
    expect(origin).toBeDefined();
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

    // _origin is now embedded in head.json
    const dag = JSON.parse(readFileSync(join(repo, '.roadmap', 'head.json'), 'utf-8'));
    const origin = dag._origin;
    expect(origin.dagId).toBe('provenance-test');
    expect(origin.compile_hash).toBe('abc123');
    expect(origin.spec_sha).toMatch(/^[a-f0-9]{64}$/);
  });

  // --- v0.4.0 engine cut: dead-field + wiring enforcement ---

  it('rejects spec with depends field on a task (points at MIGRATION.md)', () => {
    const spec = validSpec();
    spec.tasks[1] = { ...spec.tasks[1], depends: ['setup'] };
    writeFileSync(join(repo, 'spec.json'), JSON.stringify(spec));

    const result = runRoadmap(repo, `make spec.json --note "test"`);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain('depends');
    expect(result.stdout).toContain('MIGRATION.md');
  });

  it('rejects non-init node with empty consumes (gate-without-data-flow)', () => {
    // Direct validator call — make's importer auto-wires roots through a
    // synth-init receipt, so the empty-consumes rule is exercised at the
    // graph-validator boundary rather than via the CLI.
    const dag: any = {
      id: 'g', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: 'I', produces: ['i.txt'], consumes: [], deps: [], validate: [] },
        orphan: { id: 'orphan', desc: 'Orphan', produces: ['o.txt'], consumes: [], deps: [], validate: [] },
        term: { id: 'term', desc: 'T', produces: [], consumes: ['i.txt', 'o.txt'], deps: ['init', 'orphan'], validate: [] },
      },
    };
    const r = validateConsumesNonEmpty(dag);
    expect(r.valid).toBe(false);
    const joined = r.errors.join(' ');
    expect(joined).toContain('orphan');
    expect(joined).toContain('every gate must be consumes-of-an-upstream-produces');
  });

  it('rejects consumes path that does not trace to any produce', () => {
    // Direct validator call: phantom.txt is consumed but produced by nobody.
    const dag: any = {
      id: 'g', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: 'I', produces: ['i.txt'], consumes: [], deps: [], validate: [] },
        bad: { id: 'bad', desc: 'B', produces: ['b.txt'], consumes: ['i.txt', 'phantom.txt'], deps: ['init'], validate: [] },
        term: { id: 'term', desc: 'T', produces: [], consumes: ['b.txt'], deps: ['bad'], validate: [] },
      },
    };
    const r = validateConsumesHaveProducer(dag);
    expect(r.valid).toBe(false);
    const joined = r.errors.join(' ');
    expect(joined).toContain('bad');
    expect(joined).toContain('phantom.txt');
  });

  // --- receipt validator (engine-enforced shape) ---

  it('receipt validator passes on matching shape and fails (with field path) on shape drift', async () => {
    // Build a tiny one-node graph carrying a receipt validator rule.
    const dag: any = {
      id: 'receipt-test',
      init: 'rcpt',
      term: 'rcpt',
      nodes: {
        rcpt: {
          id: 'rcpt',
          desc: 'Emit receipt',
          produces: ['receipt.json'],
          consumes: [],
          deps: [],
          validate: [
            {
              type: 'receipt',
              target: 'receipt.json',
              schema: {
                type: 'object',
                required: ['node', 'verdict'],
                properties: {
                  node: { type: 'string' },
                  verdict: { type: 'string' },
                  count: { type: 'number' },
                },
              },
            },
          ],
        },
      },
    };

    // 1. Matching shape → passes.
    const goodReceipt = JSON.stringify({ node: 'rcpt', verdict: 'GREEN', count: 3 });
    const goodResult = await validateNode(dag, 'rcpt', () => true, {
      repoRoot: repo,
      readFile: (p: string) => (p.endsWith('receipt.json') ? goodReceipt : null),
    });
    expect(goodResult.passed).toBe(true);

    // 2. Shape drift (count is a string, verdict missing) → fails with field path.
    const badReceipt = JSON.stringify({ node: 'rcpt', count: 'three' });
    const badResult = await validateNode(dag, 'rcpt', () => true, {
      repoRoot: repo,
      readFile: (p: string) => (p.endsWith('receipt.json') ? badReceipt : null),
    });
    expect(badResult.passed).toBe(false);
    const evidence = (badResult.checks ?? []).map(c => c.evidence ?? '').join(' ');
    expect(evidence).toContain('verdict');
    expect(evidence).toContain('count');
  });
});
