import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeNodeCache, readNodeCache, type NodeContextCache } from '../src/lib/brief-cache.ts';
import { briefSlice } from '../src/lib/brief-slice.ts';
import { getBrief } from '../src/lib/brief.ts';
import type { Graph } from '../src/protocol.ts';

const TMP = join(import.meta.dirname ?? '.', '.tmp-brief-test');

function makeTestDAG(): Graph<string> {
  return {
    id: 'test-dag',
    desc: 'Test DAG for brief enrichment',
    init: 'setup',
    term: 'verify',
    nodes: {
      setup: {
        id: 'setup',
        desc: 'Create project structure with TypeScript config and initial modules',
        produces: ['src/index.ts', 'tsconfig.json'],
        consumes: [],
        deps: [],
        validate: [{ type: 'artifact-exists' }],
        idempotent: true,
      },
      implement: {
        id: 'implement',
        desc: 'Implement the core auth module with JWT validation and refresh token rotation',
        produces: ['src/auth.ts'],
        consumes: ['src/index.ts'],
        deps: ['setup'],
        validate: [{ type: 'shell', command: 'npx tsc --noEmit' }],
        idempotent: true,
        ambient: ['docs/auth-spec.md'],
      },
      verify: {
        id: 'verify',
        desc: 'Write integration tests verifying token refresh, expiry handling, and error cases',
        produces: ['test/auth.test.ts'],
        consumes: ['src/auth.ts'],
        deps: ['implement'],
        validate: [{ type: 'shell', command: 'npx vitest run' }],
        idempotent: true,
      },
    },
  } as any;
}

function writeTestFile(relPath: string, content: string) {
  const abs = join(TMP, relPath);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content);
}

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('writeNodeCache', () => {
  it('produces bounded JSON from code files', () => {
    const dag = makeTestDAG();
    writeTestFile('src/index.ts', [
      'import { readFileSync } from "node:fs";',
      'import { join } from "node:path";',
      '',
      'export function main(): void {',
      '  console.log("hello");',
      '}',
      '',
      'export const VERSION = "1.0.0";',
    ].join('\n'));
    writeTestFile('tsconfig.json', '{"compilerOptions":{}}');

    const wrote = writeNodeCache('setup', dag, TMP);
    expect(wrote).toBe(true);

    const cache = readNodeCache('setup', TMP);
    expect(cache).not.toBeNull();
    expect(cache!.nodeId).toBe('setup');
    expect(cache!.files.length).toBe(1); // only .ts, not .json
    expect(cache!.files[0].exports).toContain('export function main(): void');
    expect(cache!.files[0].exports).toContain('export const VERSION');

    // Budget check: serialized cache < 2000 chars
    const serialized = JSON.stringify(cache);
    expect(serialized.length).toBeLessThan(4000);
  });

  it('detects import and export conventions', () => {
    const dag = makeTestDAG();
    writeTestFile('src/index.ts', [
      'import { readFileSync } from "node:fs";',
      'import type { Graph } from "../protocol.ts";',
      '',
      'export function loadGraph(): Graph<string> {',
      '  return {} as any;',
      '}',
    ].join('\n'));

    writeNodeCache('setup', dag, TMP);
    const cache = readNodeCache('setup', TMP);

    expect(cache!.conventions.importStyle).toBe('named');
    expect(cache!.conventions.exportStyle).toBe('named-export');
    expect(cache!.conventions.namingHint).toBe('camelCase');
  });

  it('returns false for nodes with no code files', () => {
    const dag = makeTestDAG();
    writeTestFile('tsconfig.json', '{}');
    // setup produces src/index.ts and tsconfig.json, but only tsconfig exists
    // and it's not a code file
    const wrote = writeNodeCache('setup', dag, TMP);
    expect(wrote).toBe(false);
  });
});

describe('readNodeCache', () => {
  it('returns null for uncached nodes', () => {
    const cache = readNodeCache('nonexistent', TMP);
    expect(cache).toBeNull();
  });
});

describe('briefSlice', () => {
  it('returns full description without truncation', () => {
    const dag = makeTestDAG();
    const slice = briefSlice('implement', dag, TMP);

    expect(slice.specContext.description).toBe(
      'Implement the core auth module with JWT validation and refresh token rotation',
    );
    expect(slice.specContext.description.length).toBeGreaterThan(50);
  });

  it('includes ambient files in specContext', () => {
    const dag = makeTestDAG();
    const slice = briefSlice('implement', dag, TMP);

    expect(slice.specContext.ambient).toContain('docs/auth-spec.md');
  });

  it('contracts ancestor context by distance', () => {
    const dag = makeTestDAG();

    // Cache setup node (depth 1 ancestor of implement)
    writeTestFile('src/index.ts', [
      'import { readFileSync } from "node:fs";',
      'export function main(): void {}',
    ].join('\n'));
    writeNodeCache('setup', dag, TMP);

    const slice = briefSlice('verify', dag, TMP);

    // implement is depth 1 from verify, but has no cache
    // setup is depth 2 from verify, has cache → should be in heritage
    expect(slice.ancestorContext.heritage.length).toBeGreaterThanOrEqual(1);
    expect(slice.ancestorContext.heritage[0].nodeId).toBe('setup');
    expect(slice.ancestorContext.heritage[0].depth).toBeGreaterThanOrEqual(2);

    // Merged conventions should pick up setup's conventions
    expect(slice.ancestorContext.merged.importStyle).toBe('named');
  });

  it('puts depth-1 ancestors in immediate, not heritage', () => {
    const dag = makeTestDAG();

    // Cache setup node
    writeTestFile('src/index.ts', 'export function main(): void {}');
    writeNodeCache('setup', dag, TMP);

    const slice = briefSlice('implement', dag, TMP);

    // setup is depth 1 from implement → should be in immediate
    expect(slice.ancestorContext.immediate.length).toBe(1);
    expect(slice.ancestorContext.immediate[0].nodeId).toBe('setup');
  });

  it('includes node contract', () => {
    const dag = makeTestDAG();
    const slice = briefSlice('implement', dag, TMP);

    expect(slice.nodeContract.produces).toEqual(['src/auth.ts']);
    expect(slice.nodeContract.consumes).toEqual(['src/index.ts']);
  });

  it('computes topology metadata', () => {
    const dag = makeTestDAG();
    const slice = briefSlice('implement', dag, TMP);

    expect(slice.topology.descendantCount).toBe(1); // verify
    expect(slice.topology.depth).toBeGreaterThanOrEqual(1);
  });
});

describe('getBrief (enriched)', () => {
  it('returns full description not truncated', async () => {
    const dag = makeTestDAG();
    const brief = await getBrief(dag, 'implement', TMP);

    expect(brief.description).toBe(
      'Implement the core auth module with JWT validation and refresh token rotation',
    );
    // Must NOT be truncated to 150 chars
    expect(brief.description.length).toBeGreaterThan(50);
  });

  it('includes specContext when slice succeeds', async () => {
    const dag = makeTestDAG();
    const brief = await getBrief(dag, 'implement', TMP);

    expect(brief.specContext).toBeDefined();
    expect(brief.specContext!.ambient).toContain('docs/auth-spec.md');
  });

  it('includes topology', async () => {
    const dag = makeTestDAG();
    const brief = await getBrief(dag, 'implement', TMP);

    expect(brief.topology).toBeDefined();
    expect(brief.topology!.descendantCount).toBe(1);
  });

  it('includes codeContext when ancestor caches exist', async () => {
    const dag = makeTestDAG();

    writeTestFile('src/index.ts', [
      'import { readFileSync } from "node:fs";',
      'export function main(): void {}',
    ].join('\n'));
    writeNodeCache('setup', dag, TMP);

    const brief = await getBrief(dag, 'implement', TMP);

    expect(brief.codeContext).toBeDefined();
    expect(brief.codeContext!.immediate.length).toBe(1);
    expect(brief.codeContext!.merged.importStyle).toBe('named');
  });

  it('preserves backward compat fields', async () => {
    const dag = makeTestDAG();
    const brief = await getBrief(dag, 'implement', TMP);

    // All original Brief fields must still exist
    expect(brief.position).toBe('implement');
    expect(brief.mode).toBe('execute');
    expect(brief.produces).toEqual(['src/auth.ts']);
    expect(brief.consumes).toEqual(['src/index.ts']);
    expect(typeof brief.pattern).toBe('string');
    expect(typeof brief.remaining).toBe('number');
    expect(Array.isArray(brief.handoffJournal)).toBe(true);
  });
});
