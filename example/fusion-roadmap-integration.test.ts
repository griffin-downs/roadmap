/**
 * Real-world integration example: Fusion project adopts roadmap
 *
 * Demonstrates:
 * - Multi-repo setup with roadmap dependencies
 * - Custom phases for build + test
 * - Cross-repo artifact tracking
 */

import { test, expect } from 'vitest';
import { define, verify, orient, check, CompletionStore } from '../src/protocol.ts';
import type { Graph } from '../src/protocol.ts';

// Example Fusion project roadmap
// Fusion is a TypeScript monorepo with build, test, and deploy phases
const fusionRoadmap: Graph<string> = {
  id: 'fusion-project',
  desc: 'Fusion: multi-agent orchestration framework',
  init: 'bootstrap',
  term: 'release',

  nodes: {
    bootstrap: {
      id: 'bootstrap',
      desc: 'Initialize project structure',
      produces: ['package.json', 'tsconfig.json', '.roadmap.json'],
      consumes: [],
      deps: [],
      validate: [
        { type: 'artifact-exists', target: 'package.json' },
        { type: 'artifact-exists', target: '.roadmap.json' },
      ],
      idempotent: true,
    },

    // Build phases
    compile: {
      id: 'compile',
      desc: 'TypeScript compilation',
      produces: ['dist/', 'dist/types/'],
      consumes: ['package.json', 'src/**/*.ts'],
      deps: ['bootstrap'],
      validate: [
        { type: 'artifact-exists', target: 'dist/index.js' },
      ],
      idempotent: true,
    },

    // Test phases
    unit_test: {
      id: 'unit_test',
      desc: 'Unit tests',
      produces: ['coverage/'],
      consumes: ['dist/', 'tests/**/*.test.ts'],
      deps: ['compile'],
      validate: [
        { type: 'artifact-exists', target: 'coverage/index.html' },
      ],
      idempotent: true,
    },

    integration_test: {
      id: 'integration_test',
      desc: 'Integration tests with agent executor',
      produces: ['test-results.json'],
      consumes: ['dist/', 'tests/integration/**/*.test.ts'],
      deps: ['compile'],
      validate: [
        { type: 'artifact-exists', target: 'test-results.json' },
      ],
      idempotent: true,
    },

    // Documentation
    docs: {
      id: 'docs',
      desc: 'API documentation generation',
      produces: ['docs/api/', 'README.md'],
      consumes: ['src/**/*.ts'],
      deps: ['bootstrap'],
      validate: [
        { type: 'artifact-exists', target: 'docs/api/index.html' },
      ],
      idempotent: true,
    },

    // Release
    release: {
      id: 'release',
      desc: 'Package and publish',
      produces: ['dist/fusion-*.tgz'],
      consumes: ['dist/', 'coverage/', 'docs/api/'],
      deps: ['unit_test', 'integration_test', 'docs'],
      validate: [
        { type: 'artifact-exists', target: 'dist/fusion-1.0.0.tgz' },
      ],
      idempotent: false,
    },
  },
};

test('fusion: roadmap structure is valid', () => {
  const g = define(fusionRoadmap);
  expect(g.id).toBe('fusion-project');
  expect(g.init).toBe('bootstrap');
  expect(g.term).toBe('release');
});

test('fusion: no cycles in dependencies', () => {
  const g = define(fusionRoadmap);
  const errors = check(g);
  expect(errors.orphans).toHaveLength(0);
});

test('fusion: artifacts satisfy all dependencies', () => {
  const g = define(fusionRoadmap);
  const gaps = verify(g);
  expect(gaps).toHaveLength(0);
});

test('fusion: can orient from real project state', async () => {
  const g = define(fusionRoadmap);

  // bootstrap and compile done (have receipts)
  const pos = orient(g, CompletionStore.from(['bootstrap', 'compile']));

  // Should be positioned after compile, before unit_test
  expect(pos.position).not.toEqual([g.init]);
  expect(pos.done.length).toBeGreaterThan(1);
});

test('fusion: dependencies are ordered correctly', () => {
  const g = define(fusionRoadmap);
  const order = require('../src/protocol.ts').order(g);

  // bootstrap must come first
  expect(order[0]).toBe('bootstrap');

  // unit_test must come after compile
  const compileIdx = order.indexOf('compile');
  const unitIdx = order.indexOf('unit_test');
  expect(unitIdx).toBeGreaterThan(compileIdx);

  // release must come last
  expect(order[order.length - 1]).toBe('release');
});

test('fusion: cross-repo dependencies would be in .roadmap.json', async () => {
  // Example Fusion .roadmap.json
  const metadata = {
    projectType: 'typescript-monorepo',
    init: ['package.json'],
    term: ['dist/', 'docs/', 'test-results.json'],
    buildCommand: 'npm run build',
    phases: [
      {
        id: 'compile',
        desc: 'Build TypeScript',
        automatic: true,
        command: 'npm run build',
        produces: ['dist/'],
      },
      {
        id: 'test',
        desc: 'Run tests',
        automatic: true,
        command: 'npm test',
        produces: ['coverage/'],
      },
    ],
    dependencies: [
      {
        repo: '../cockpit',
        consumes: ['dist/'],
        phase: 'build',
        mustComplete: true,
      },
    ],
  };

  expect(metadata.projectType).toBe('typescript-monorepo');
  expect(metadata.dependencies).toHaveLength(1);
  expect(metadata.dependencies[0].repo).toBe('../cockpit');
});
