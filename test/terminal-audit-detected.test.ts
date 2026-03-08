import { describe, it, expect } from 'vitest';
import { detectGaps } from '../src/lib/terminal-audit/detected.ts';
import type { Graph, NodeSpec } from '../src/lib/protocol/types.ts';

function buildDAG(specs: Record<string, Partial<NodeSpec<string, any>>>): Graph<string> {
  const nodes: Record<string, any> = {};
  for (const [id, spec] of Object.entries(specs)) {
    nodes[id] = {
      id, desc: 'test', produces: [], consumes: [], deps: [], validate: [], idempotent: true,
      ...spec,
    };
  }
  return { id: 'test', desc: 'test', init: 'init', term: 'term', nodes } as any;
}

describe('detectGaps', () => {
  describe('uncovered-consume detection', () => {
    it('flags consumes not covered by any artifact-exists validator', () => {
      const dag = buildDAG({
        init: { produces: ['init.marker'] },
        a: { produces: ['src/a.ts'], deps: ['init'] },
        b: {
          consumes: ['src/a.ts'], deps: ['a'], produces: ['src/b.ts'],
          validate: [{ type: 'shell', command: 'npm test' }],
        },
        term: { consumes: ['src/b.ts'], deps: ['b'] },
      });

      const result = detectGaps(dag);

      const uncovered = result.gaps.filter(g => g.type === 'uncovered-consume');
      // src/a.ts is consumed by 'b' but no node has artifact-exists validating it
      expect(uncovered.some(g => g.artifact === 'src/a.ts')).toBe(true);
    });

    it('does not flag consumes covered by artifact-exists', () => {
      const dag = buildDAG({
        init: { produces: ['init.marker'] },
        a: { produces: ['src/a.ts'], deps: ['init'] },
        b: {
          consumes: ['src/a.ts'], deps: ['a'], produces: ['src/b.ts'],
          validate: [{ type: 'artifact-exists', path: 'src/a.ts' }],
        },
        term: { deps: ['b'] },
      });

      const result = detectGaps(dag);
      const uncovered = result.gaps.filter(g => g.type === 'uncovered-consume' && g.artifact === 'src/a.ts');
      expect(uncovered).toHaveLength(0);
    });

    it('skips init.marker consumes', () => {
      const dag = buildDAG({
        init: { produces: ['init.marker'] },
        a: { consumes: ['init.marker'], deps: ['init'], produces: ['out.ts'] },
        term: { deps: ['a'] },
      });

      const result = detectGaps(dag);
      const uncovered = result.gaps.filter(g => g.type === 'uncovered-consume');
      expect(uncovered).toHaveLength(0);
    });
  });

  describe('untested-produce detection', () => {
    it('flags produces not referenced by any shell command', () => {
      const dag = buildDAG({
        init: { produces: ['init.marker'] },
        work: {
          produces: ['src/a.ts', 'src/b.ts'], deps: ['init'],
          validate: [{ type: 'shell', command: 'npx vitest run test/a.test.ts' }],
        },
        term: { deps: ['work'] },
      });

      const result = detectGaps(dag);
      const untested = result.gaps.filter(g => g.type === 'untested-produce');
      // src/b.ts is not referenced in any shell command
      expect(untested.some(g => g.artifact === 'src/b.ts')).toBe(true);
      // src/a.ts basename matches test/a.test.ts — arguably not a direct reference,
      // but the shell command contains 'a' in the filename
    });

    it('does not flag produces referenced by shell command', () => {
      const dag = buildDAG({
        init: { produces: ['init.marker'] },
        work: {
          produces: ['src/foo.ts'], deps: ['init'],
          validate: [{ type: 'shell', command: 'npx tsc --noEmit src/foo.ts' }],
        },
        term: { deps: ['work'] },
      });

      const result = detectGaps(dag);
      const untested = result.gaps.filter(g => g.type === 'untested-produce' && g.artifact === 'src/foo.ts');
      expect(untested).toHaveLength(0);
    });

    it('skips marker files', () => {
      const dag = buildDAG({
        init: { produces: ['init.marker'] },
        term: { deps: ['init'] },
      });

      const result = detectGaps(dag);
      const untested = result.gaps.filter(g => g.type === 'untested-produce');
      expect(untested).toHaveLength(0);
    });

    it('blanket tsc --noEmit covers all .ts produces', () => {
      const dag = buildDAG({
        init: { produces: ['init.marker'] },
        work: {
          produces: ['src/deep/nested/module.ts'], deps: ['init'],
          validate: [{ type: 'shell', command: 'npx tsc --noEmit' }],
        },
        term: { deps: ['work'] },
      });

      const result = detectGaps(dag);
      const untested = result.gaps.filter(g => g.type === 'untested-produce' && g.artifact === 'src/deep/nested/module.ts');
      expect(untested).toHaveLength(0);
    });

    it('test file basename maps to produce basename', () => {
      const dag = buildDAG({
        init: { produces: ['init.marker'] },
        work: {
          produces: ['src/lib/terminal-audit/computed.ts'], deps: ['init'],
          validate: [{ type: 'shell', command: 'npx vitest run test/terminal-audit-computed.test.ts' }],
        },
        term: { deps: ['work'] },
      });

      const result = detectGaps(dag);
      const untested = result.gaps.filter(g => g.type === 'untested-produce' && g.artifact === 'src/lib/terminal-audit/computed.ts');
      expect(untested).toHaveLength(0);
    });

    it('still flags produces with no matching test or blanket validator', () => {
      const dag = buildDAG({
        init: { produces: ['init.marker'] },
        work: {
          produces: ['src/orphan.ts'], deps: ['init'],
          validate: [{ type: 'shell', command: 'npx vitest run test/unrelated.test.ts' }],
        },
        term: { deps: ['work'] },
      });

      const result = detectGaps(dag);
      const untested = result.gaps.filter(g => g.type === 'untested-produce' && g.artifact === 'src/orphan.ts');
      expect(untested).toHaveLength(1);
    });
  });

  describe('summary', () => {
    it('counts all gap types correctly', () => {
      const dag = buildDAG({
        init: { produces: ['init.marker'] },
        a: { produces: ['src/a.ts'], deps: ['init'] },
        b: {
          consumes: ['src/a.ts'], deps: ['a'], produces: ['src/b.ts'],
          validate: [{ type: 'shell', command: 'echo ok' }],
        },
        term: { deps: ['b'] },
      });

      const result = detectGaps(dag);

      expect(result.summary.uncoveredConsumes).toBeGreaterThanOrEqual(1);
      expect(result.summary.total).toBe(
        result.summary.uncoveredConsumes + result.summary.untestedProduces,
      );
    });

    it('returns zero totals for clean DAG', () => {
      const dag = buildDAG({
        init: { produces: ['init.marker'] },
        work: {
          consumes: ['init.marker'], deps: ['init'], produces: ['src/a.ts'],
          validate: [
            { type: 'artifact-exists', path: 'src/a.ts' },
            { type: 'shell', command: 'npx tsc --noEmit src/a.ts' },
          ],
        },
        term: {
          consumes: ['src/a.ts'], deps: ['work'],
          validate: [{ type: 'artifact-exists', path: 'src/a.ts' }],
        },
      });

      const result = detectGaps(dag);
      expect(result.summary.total).toBe(0);
    });
  });
});
