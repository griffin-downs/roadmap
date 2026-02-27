/**
 * validate-plan-clarity tests: init intent gate evaluator.
 */

import { describe, it, expect } from 'vitest';
import { validatePlanClarity } from '../src/lib/validate-plan-clarity';
import type { Graph } from '../src/protocol';

describe('validatePlanClarity', () => {
  // ── Minimal valid graph for testing ──
  function validGraph(): Graph<'init' | 'build' | 'term'> {
    return {
      id: 'test-graph',
      desc: 'Test graph',
      init: 'init',
      term: 'term',
      nodes: {
        init: {
          id: 'init',
          desc: 'Initialize project',
          produces: ['package.json', 'tsconfig.json'],
          consumes: [],
          deps: [],
          validate: [{ type: 'artifact-exists', target: 'package.json' }],
          idempotent: true,
        },
        build: {
          id: 'build',
          desc: 'Build TypeScript sources',
          produces: ['dist/index.js'],
          consumes: ['package.json', 'tsconfig.json'],
          deps: ['init'],
          validate: [{ type: 'artifact-exists', target: 'dist/index.js' }],
          idempotent: true,
        },
        term: {
          id: 'term',
          desc: 'Run tests',
          produces: ['.test/results.json'],
          consumes: ['dist/index.js'],
          deps: ['build'],
          validate: [{ type: 'artifact-exists', target: '.test/results.json' }],
          idempotent: true,
        },
      },
    };
  }

  it('passes all checks on valid graph', async () => {
    const g = validGraph();
    const result = await validatePlanClarity(g, 'test');
    expect(result.passed).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.gaps.length).toBe(0);
    expect(result.evidence).toContain('✓ All nodes have concrete produces[]');
    expect(result.evidence).toContain('✓ All consumes[] resolved by predecessors');
    expect(result.evidence).toContain('✓ All nodes have validate rules');
    expect(result.evidence).toContain('✓ No ownership conflicts');
  });

  describe('check 1: vague produces', () => {
    it('detects empty produces array', async () => {
      const g = validGraph();
      (g.nodes.build as any).produces = [];
      const result = await validatePlanClarity(g, 'test');
      expect(result.passed).toBe(false);
      expect(result.gaps.some(g => g.type === 'VagueProduces' && g.node === 'build')).toBe(true);
    });

    it('detects placeholder "database"', async () => {
      const g = validGraph();
      (g.nodes.build as any).produces = ['database'];
      const result = await validatePlanClarity(g, 'test');
      expect(result.passed).toBe(false);
      const gap = result.gaps.find(g => g.type === 'VagueProduces' && g.node === 'build');
      expect(gap?.detail).toContain('database');
    });

    it('detects generic placeholder "config"', async () => {
      const g = validGraph();
      (g.nodes.build as any).produces = ['config'];
      const result = await validatePlanClarity(g, 'test');
      const gap = result.gaps.find(g => g.type === 'VagueProduces' && g.node === 'build');
      expect(gap).toBeDefined();
    });

    it('detects angle-bracket placeholders', async () => {
      const g = validGraph();
      (g.nodes.build as any).produces = ['<output>'];
      const result = await validatePlanClarity(g, 'test');
      const gap = result.gaps.find(g => g.type === 'VagueProduces' && g.node === 'build');
      expect(gap).toBeDefined();
    });

    it('accepts concrete file paths', async () => {
      const g = validGraph();
      (g.nodes.build as any).produces = ['src/lib/validate.ts', 'dist/bundle.js', 'config/app.json'];
      const result = await validatePlanClarity(g, 'test');
      expect(result.gaps.filter(g => g.type === 'VagueProduces').length).toBe(0);
    });
  });

  describe('check 2: unresolvable consumes', () => {
    it('detects artifact not produced by predecessors', async () => {
      const g = validGraph();
      (g.nodes.build as any).consumes = ['package.json', 'missing.json'];
      const result = await validatePlanClarity(g, 'test');
      expect(result.passed).toBe(false);
      const gap = result.gaps.find(g => g.type === 'UnresolvableConsumes' && g.node === 'build');
      expect(gap?.detail).toContain('missing.json');
    });

    it('resolves consumes across transitive dependencies', async () => {
      const g: Graph<'a' | 'b' | 'c' | 'd'> = {
        id: 'test',
        desc: 'test',
        init: 'a',
        term: 'd',
        nodes: {
          a: {
            id: 'a',
            desc: 'A',
            produces: ['out-a.txt'],
            consumes: [],
            deps: [],
            validate: [{ type: 'artifact-exists', target: 'out-a.txt' }],
            idempotent: true,
          },
          b: {
            id: 'b',
            desc: 'B',
            produces: ['out-b.txt'],
            consumes: ['out-a.txt'],
            deps: ['a'],
            validate: [{ type: 'artifact-exists', target: 'out-b.txt' }],
            idempotent: true,
          },
          c: {
            id: 'c',
            desc: 'C',
            produces: ['out-c.txt'],
            consumes: ['out-a.txt', 'out-b.txt'],
            deps: ['b'],
            validate: [{ type: 'artifact-exists', target: 'out-c.txt' }],
            idempotent: true,
          },
          d: {
            id: 'd',
            desc: 'D',
            produces: ['out-d.txt'],
            consumes: ['out-c.txt'],
            deps: ['c'],
            validate: [{ type: 'artifact-exists', target: 'out-d.txt' }],
            idempotent: true,
          },
        },
      };

      const result = await validatePlanClarity(g, 'test');
      expect(result.gaps.filter(g => g.type === 'UnresolvableConsumes').length).toBe(0);
    });

    it('allows acknowledged pending consumes (resolvedBy) when resolver node exists', async () => {
      const g: Graph<'init' | 'build' | 'codegen' | 'term'> = {
        id: 'test-graph',
        desc: 'Test graph',
        init: 'init',
        term: 'term',
        nodes: {
          init: {
            id: 'init',
            desc: 'Initialize project',
            produces: ['package.json', 'tsconfig.json'],
            consumes: [],
            deps: [],
            validate: [{ type: 'artifact-exists', target: 'package.json' }],
            idempotent: true,
          },
          codegen: {
            id: 'codegen',
            desc: 'Code generation',
            produces: ['src/generated.ts'],
            consumes: ['package.json'],
            deps: ['init'],
            validate: [{ type: 'artifact-exists', target: 'src/generated.ts' }],
            idempotent: true,
          },
          build: {
            id: 'build',
            desc: 'Build TypeScript sources',
            produces: ['dist/index.js'],
            consumes: [
              'package.json',
              { artifact: 'src/generated.ts', resolvedBy: 'codegen' },
            ] as any,
            deps: ['init', 'codegen'],
            validate: [{ type: 'artifact-exists', target: 'dist/index.js' }],
            idempotent: true,
          },
          term: {
            id: 'term',
            desc: 'Run tests',
            produces: ['.test/results.json'],
            consumes: ['dist/index.js'],
            deps: ['build'],
            validate: [{ type: 'artifact-exists', target: '.test/results.json' }],
            idempotent: true,
          },
        },
      };
      const result = await validatePlanClarity(g, 'test');
      expect(result.gaps.filter(g => g.type === 'UnresolvableConsumes').length).toBe(0);
    });
  });

  describe('check 3: no validate rules', () => {
    it('detects empty validate array', async () => {
      const g = validGraph();
      (g.nodes.build as any).validate = [];
      const result = await validatePlanClarity(g, 'test');
      expect(result.passed).toBe(false);
      const gap = result.gaps.find(g => g.type === 'NoValidate' && g.node === 'build');
      expect(gap).toBeDefined();
    });

    it('accepts single validate rule', async () => {
      const g = validGraph();
      (g.nodes.build as any).validate = [{ type: 'artifact-exists', target: 'dist/index.js' }];
      const result = await validatePlanClarity(g, 'test');
      expect(result.gaps.filter(g => g.type === 'NoValidate' && g.node === 'build').length).toBe(0);
    });

    it('accepts multiple validate rules', async () => {
      const g = validGraph();
      (g.nodes.build as any).validate = [
        { type: 'artifact-exists', target: 'dist/index.js' },
        { type: 'shell', command: 'npm run test' },
      ];
      const result = await validatePlanClarity(g, 'test');
      expect(result.gaps.filter(g => g.type === 'NoValidate' && g.node === 'build').length).toBe(0);
    });
  });

  describe('check 4: ownership conflict', () => {
    it('detects two nodes producing same artifact', async () => {
      const g = validGraph();
      (g.nodes.build as any).produces = ['dist/index.js'];
      (g.nodes.term as any).produces = ['dist/index.js'];
      const result = await validatePlanClarity(g, 'test');
      expect(result.passed).toBe(false);
      const gap = result.gaps.find(g => g.type === 'OwnershipConflict');
      expect(gap).toBeDefined();
      expect(gap?.detail).toContain('dist/index.js');
    });

    it('allows different artifacts from same node', async () => {
      const g = validGraph();
      (g.nodes.build as any).produces = ['dist/index.js', 'dist/types.d.ts'];
      const result = await validatePlanClarity(g, 'test');
      expect(result.gaps.filter(g => g.type === 'OwnershipConflict').length).toBe(0);
    });
  });

  describe('check 5: broad scope', () => {
    it('detects long description with conjunctions', async () => {
      const g = validGraph();
      (g.nodes.build as any).desc =
        'Build TypeScript sources and run linting and format code and generate docs and update changelog file';
      const result = await validatePlanClarity(g, 'test');
      const gap = result.gaps.find(g => g.type === 'BroadScope' && g.node === 'build');
      expect(gap).toBeDefined();
    });

    it('allows long description without conjunctions', async () => {
      const g = validGraph();
      (g.nodes.build as any).desc =
        'Build TypeScript sources with esbuild, minify output, emit source maps for debugging';
      const result = await validatePlanClarity(g, 'test');
      expect(result.gaps.filter(g => g.type === 'BroadScope' && g.node === 'build').length).toBe(0);
    });

    it('allows short description with conjunctions', async () => {
      const g = validGraph();
      (g.nodes.build as any).desc = 'Build and test';
      const result = await validatePlanClarity(g, 'test');
      expect(result.gaps.filter(g => g.type === 'BroadScope' && g.node === 'build').length).toBe(0);
    });

    it('detects "also" as conjunction', async () => {
      const g = validGraph();
      (g.nodes.build as any).desc =
        'Build TypeScript sources also validate the schema also run the tests also update the docs file';
      const result = await validatePlanClarity(g, 'test');
      const gap = result.gaps.find(g => g.type === 'BroadScope' && g.node === 'build');
      expect(gap).toBeDefined();
    });
  });

  describe('confidence calculation', () => {
    it('returns 0.95 when all checks pass', async () => {
      const g = validGraph();
      const result = await validatePlanClarity(g, 'test');
      expect(result.confidence).toBe(0.95);
    });

    it('returns 0.80 with 1 gap', async () => {
      const g = validGraph();
      (g.nodes.build as any).validate = [];
      const result = await validatePlanClarity(g, 'test');
      expect(result.gaps.length).toBe(1);
      expect(result.confidence).toBe(0.80);
    });

    it('returns 0.60 with 2 gaps total', async () => {
      const g = validGraph();
      (g.nodes.build as any).consumes = ['package.json', 'missing.json'];
      (g.nodes.build as any).validate = [];
      const result = await validatePlanClarity(g, 'test');
      expect(result.gaps.length).toBe(2);
      expect(result.confidence).toBe(0.60);
    });

    it('returns 0.30 with 3+ gaps', async () => {
      const g = validGraph();
      (g.nodes.build as any).produces = ['database'];
      (g.nodes.build as any).validate = [];
      (g.nodes.build as any).consumes = ['missing.txt'];
      const result = await validatePlanClarity(g, 'test');
      expect(result.gaps.length).toBeGreaterThanOrEqual(3);
      expect(result.confidence).toBe(0.30);
    });
  });

  describe('mixed failures', () => {
    it('reports all gaps when multiple issues detected', async () => {
      const g = validGraph();
      // Node has: vague produces, unresolvable consumes, no validate
      (g.nodes.build as any).produces = ['<output>'];
      (g.nodes.build as any).consumes = ['missing.txt'];
      (g.nodes.build as any).validate = [];
      const result = await validatePlanClarity(g, 'test');
      expect(result.passed).toBe(false);
      expect(result.gaps.length).toBeGreaterThanOrEqual(3);
      const types = new Set(result.gaps.map(g => g.type));
      expect(types.has('VagueProduces')).toBe(true);
      expect(types.has('UnresolvableConsumes')).toBe(true);
      expect(types.has('NoValidate')).toBe(true);
    });

    it('includes all gap details in evidence', async () => {
      const g = validGraph();
      (g.nodes.build as any).produces = [];
      (g.nodes.build as any).validate = [];
      const result = await validatePlanClarity(g, 'test');
      expect(result.evidence.some(e => e.includes('VagueProduces'))).toBe(true);
      expect(result.evidence.some(e => e.includes('NoValidate'))).toBe(true);
    });
  });
});
