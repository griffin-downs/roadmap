import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateNode, define } from '../src/protocol.ts';

// --- helpers ---

function tmpDir(): string {
  const dir = join(tmpdir(), `roadmap-test-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function fileExistsIn(root: string) {
  return (artifact: string) => existsSync(join(root, artifact));
}

function dagWith(validate: any[]): any {
  return define({
    id: 'test', desc: 'test', init: 'node', term: 'term',
    nodes: {
      node: { id: 'node', desc: 'test node', produces: [], consumes: [], deps: [], validate, idempotent: true },
      term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['node'], validate: [], idempotent: false },
    },
  });
}

// --- build-produces ---

describe('build-produces', () => {
  it('passes when build exits 0 and all outputs exist', async () => {
    const root = tmpDir();
    writeFileSync(join(root, 'output.js'), 'ok');
    const dag = dagWith([{ type: 'build-produces', command: 'true', outputs: ['output.js'] }]);
    const result = await validateNode(dag, 'node', fileExistsIn(root));
    expect(result.passed).toBe(true);
    expect(result.checks[0].evidence).toContain('output.js');
    rmSync(root, { recursive: true });
  });

  it('fails when build command exits non-zero', async () => {
    const root = tmpDir();
    const dag = dagWith([{ type: 'build-produces', command: 'false', outputs: ['output.js'] }]);
    const result = await validateNode(dag, 'node', fileExistsIn(root));
    expect(result.passed).toBe(false);
    expect(result.checks[0].evidence).toContain('build failed');
    rmSync(root, { recursive: true });
  });

  it('fails when build exits 0 but output is missing', async () => {
    const root = tmpDir();
    const dag = dagWith([{ type: 'build-produces', command: 'true', outputs: ['missing.js'] }]);
    const result = await validateNode(dag, 'node', fileExistsIn(root));
    expect(result.passed).toBe(false);
    expect(result.checks[0].evidence).toContain('missing.js');
    rmSync(root, { recursive: true });
  });

  it('recursion guard: skips when ROADMAP_VALIDATING is set', async () => {
    const root = tmpDir();
    const dag = dagWith([{ type: 'build-produces', command: 'false', outputs: ['x'] }]);
    const orig = process.env.ROADMAP_VALIDATING;
    process.env.ROADMAP_VALIDATING = '1';
    const result = await validateNode(dag, 'node', fileExistsIn(root));
    expect(result.passed).toBe(true);
    expect(result.checks[0].evidence).toContain('skipped');
    if (orig === undefined) delete process.env.ROADMAP_VALIDATING;
    else process.env.ROADMAP_VALIDATING = orig;
    rmSync(root, { recursive: true });
  });
});

// --- launch-check ---

describe('launch-check', () => {
  it('passes when process exits 0 without successSignal', async () => {
    const root = tmpDir();
    const dag = dagWith([{ type: 'launch-check', command: 'true' }]);
    const result = await validateNode(dag, 'node', fileExistsIn(root));
    expect(result.passed).toBe(true);
    expect(result.checks[0].evidence).toContain('exited 0');
    rmSync(root, { recursive: true });
  });

  it('fails when process exits non-zero without successSignal', async () => {
    const root = tmpDir();
    const dag = dagWith([{ type: 'launch-check', command: 'false' }]);
    const result = await validateNode(dag, 'node', fileExistsIn(root));
    expect(result.passed).toBe(false);
    expect(result.checks[0].evidence).toContain('exit');
    rmSync(root, { recursive: true });
  });

  it('passes when stdout contains successSignal', async () => {
    const root = tmpDir();
    const dag = dagWith([{
      type: 'launch-check',
      command: 'echo "[main] window created"',
      successSignal: '[main] window created',
    }]);
    const result = await validateNode(dag, 'node', fileExistsIn(root));
    expect(result.passed).toBe(true);
    expect(result.checks[0].evidence).toContain('contained signal');
    rmSync(root, { recursive: true });
  });

  it('fails when stdout does not contain successSignal', async () => {
    const root = tmpDir();
    const dag = dagWith([{
      type: 'launch-check',
      command: 'echo "something else"',
      successSignal: '[main] window created',
    }]);
    const result = await validateNode(dag, 'node', fileExistsIn(root));
    expect(result.passed).toBe(false);
    expect(result.checks[0].evidence).toContain('missing signal');
    rmSync(root, { recursive: true });
  });

  it('recursion guard: skips when ROADMAP_VALIDATING is set', async () => {
    const root = tmpDir();
    const dag = dagWith([{ type: 'launch-check', command: 'false' }]);
    const orig = process.env.ROADMAP_VALIDATING;
    process.env.ROADMAP_VALIDATING = '1';
    const result = await validateNode(dag, 'node', fileExistsIn(root));
    expect(result.passed).toBe(true);
    if (orig === undefined) delete process.env.ROADMAP_VALIDATING;
    else process.env.ROADMAP_VALIDATING = orig;
    rmSync(root, { recursive: true });
  });
});

// --- spec-conformance ---

describe('spec-conformance', () => {
  it('passes when spec exists and all story refs found', async () => {
    const root = tmpDir();
    const specPath = join(root, 'spec.md');
    writeFileSync(specPath, 'Story 1: do thing\nStory 2: do other thing');
    const dag = dagWith([{ type: 'spec-conformance', spec: specPath, stories: [1, 2] }]);
    const result = await validateNode(dag, 'node', fileExistsIn(root));
    expect(result.passed).toBe(true);
    expect(result.checks[0].evidence).toContain('stories [1, 2]');
    rmSync(root, { recursive: true });
  });

  it('fails when spec file is missing', async () => {
    const root = tmpDir();
    const dag = dagWith([{ type: 'spec-conformance', spec: join(root, 'nonexistent.md'), stories: [1] }]);
    const result = await validateNode(dag, 'node', fileExistsIn(root));
    expect(result.passed).toBe(false);
    expect(result.checks[0].evidence).toContain('not found');
    rmSync(root, { recursive: true });
  });

  it('fails when a story ref is absent from spec', async () => {
    const root = tmpDir();
    const specPath = join(root, 'spec.md');
    writeFileSync(specPath, 'Story 1: do thing');
    const dag = dagWith([{ type: 'spec-conformance', spec: specPath, stories: [1, 3] }]);
    const result = await validateNode(dag, 'node', fileExistsIn(root));
    expect(result.passed).toBe(false);
    expect(result.checks[0].evidence).toContain('3');
    rmSync(root, { recursive: true });
  });

  it('accepts US-prefixed story IDs', async () => {
    const root = tmpDir();
    const specPath = join(root, 'spec.md');
    writeFileSync(specPath, 'US4: handle edge case');
    const dag = dagWith([{ type: 'spec-conformance', spec: specPath, stories: [4] }]);
    const result = await validateNode(dag, 'node', fileExistsIn(root));
    expect(result.passed).toBe(true);
    rmSync(root, { recursive: true });
  });
});

// --- validate-node: no-rules fast path ---

describe('validateNode base cases', () => {
  it('node with no validate rules: passes with no checks', async () => {
    const dag = dagWith([]);
    const result = await validateNode(dag, 'node', () => false);
    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(0);
  });

  it('unknown node: returns failed result', async () => {
    const dag = dagWith([]);
    const result = await validateNode(dag, 'nonexistent', () => false);
    expect(result.passed).toBe(false);
    expect(result.failedReason).toContain('not found');
  });
});
