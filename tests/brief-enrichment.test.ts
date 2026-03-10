import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readNodeCache, extractFileSummary, type NodeContextCache } from '../src/lib/brief-slice.ts';
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

/**
 * Write a NodeContextCache fixture directly (replaces writeNodeCache which was removed).
 * Used to set up ancestor cache state for briefSlice tests.
 */
function writeTestCache(nodeId: string, repoRoot: string, cache: NodeContextCache): void {
  const cacheDir = join(repoRoot, '.roadmap', '.cache');
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(
    join(cacheDir, `${nodeId}.context.json`),
    JSON.stringify(cache, null, 2) + '\n',
  );
}

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('readNodeCache', () => {
  it('returns null for uncached nodes', () => {
    const cache = readNodeCache('nonexistent', TMP);
    expect(cache).toBeNull();
  });

  it('reads a written cache fixture', () => {
    const fixture: NodeContextCache = {
      nodeId: 'setup',
      timestamp: '2024-01-01T00:00:00.000Z',
      files: [{ path: 'src/index.ts', headLines: ['import { x } from "y";'], exports: ['export function main(): void'], signatures: [] }],
      conventions: { importStyle: 'named', exportStyle: 'named-export', namingHint: 'camelCase' },
    };
    writeTestCache('setup', TMP, fixture);
    const cache = readNodeCache('setup', TMP);
    expect(cache).not.toBeNull();
    expect(cache!.nodeId).toBe('setup');
    expect(cache!.conventions.importStyle).toBe('named');
  });
});

describe('extractFileSummary', () => {
  it('extracts exports from a TypeScript file', () => {
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

    const summary = extractFileSummary('src/index.ts', TMP);
    expect(summary).not.toBeNull();
    expect(summary!.exports).toContain('export function main(): void');
    expect(summary!.exports).toContain('export const VERSION');
  });

  it('returns null for non-code files', () => {
    writeTestFile('tsconfig.json', '{"compilerOptions":{}}');
    const summary = extractFileSummary('tsconfig.json', TMP);
    expect(summary).toBeNull();
  });

  it('returns null for missing files', () => {
    const summary = extractFileSummary('nonexistent.ts', TMP);
    expect(summary).toBeNull();
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

    // Write cache fixture for setup node (depth 2 ancestor of verify)
    writeTestCache('setup', TMP, {
      nodeId: 'setup',
      timestamp: '2024-01-01T00:00:00.000Z',
      files: [{ path: 'src/index.ts', headLines: ['import { readFileSync } from "node:fs";'], exports: ['export function main(): void'], signatures: [] }],
      conventions: { importStyle: 'named', exportStyle: 'named-export', namingHint: 'camelCase' },
    });

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

    // Write cache fixture for setup (depth 1 ancestor of implement)
    writeTestCache('setup', TMP, {
      nodeId: 'setup',
      timestamp: '2024-01-01T00:00:00.000Z',
      files: [{ path: 'src/index.ts', headLines: [], exports: ['export function main(): void'], signatures: [] }],
      conventions: { importStyle: 'named', exportStyle: null, namingHint: null },
    });

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

describe('produces preview', () => {
  it('includes file summaries for produces that exist on disk', () => {
    const dag = makeTestDAG();
    writeTestFile('src/index.ts', [
      'import { readFileSync } from "node:fs";',
      'export function main(): void {}',
      'export const VERSION = "1.0.0";',
    ].join('\n'));

    const slice = briefSlice('setup', dag, TMP);

    // setup produces src/index.ts (exists) and tsconfig.json (not a code file)
    expect(slice.producesPreview.length).toBe(1);
    expect(slice.producesPreview[0].path).toBe('src/index.ts');
    expect(slice.producesPreview[0].exports.length).toBeGreaterThan(0);
  });

  it('returns empty preview when produces files do not exist', () => {
    const dag = makeTestDAG();
    // Don't create any files
    const slice = briefSlice('setup', dag, TMP);
    expect(slice.producesPreview.length).toBe(0);
  });

  it('is included in getBrief output when files exist', async () => {
    const dag = makeTestDAG();
    writeTestFile('src/auth.ts', [
      'import { verify } from "jsonwebtoken";',
      'export function validateToken(token: string): boolean {',
      '  return verify(token, "secret") !== null;',
      '}',
    ].join('\n'));

    const brief = await getBrief(dag, 'implement', TMP);
    expect(brief.producesPreview).toBeDefined();
    expect(brief.producesPreview!.length).toBe(1);
    expect(brief.producesPreview![0].path).toBe('src/auth.ts');
  });

  it('gives init nodes context even with no ancestors', () => {
    const dag = makeTestDAG();
    writeTestFile('src/index.ts', [
      'import { readFileSync } from "node:fs";',
      'export function main(): void {}',
    ].join('\n'));

    const slice = briefSlice('setup', dag, TMP);

    // Init node: no ancestors (empty cone), but produces preview exists
    expect(slice.ancestorContext.immediate.length).toBe(0);
    expect(slice.ancestorContext.heritage.length).toBe(0);
    expect(slice.producesPreview.length).toBe(1);
    expect(slice.producesPreview[0].headLines[0]).toBe('import { readFileSync } from "node:fs";');
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

    // Write cache fixture directly for setup (ancestor of implement)
    writeTestCache('setup', TMP, {
      nodeId: 'setup',
      timestamp: '2024-01-01T00:00:00.000Z',
      files: [{ path: 'src/index.ts', headLines: ['import { readFileSync } from "node:fs";'], exports: ['export function main(): void'], signatures: [] }],
      conventions: { importStyle: 'named', exportStyle: 'named-export', namingHint: 'camelCase' },
    });

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
