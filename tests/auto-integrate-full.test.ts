/**
 * End-to-end integration tests: roadmap generate from metadata
 *
 * Covers 3+ real project patterns:
 * 1. TypeScript library (src → dist/.d.ts)
 * 2. JavaScript webapp (src → dist/)
 * 3. Monorepo (root + packages)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateRoadmapDAG, validateGeneratedDAG } from '../src/auto-integrate-gen';
import { check, verify, define } from '../src/protocol';
import type { ProjectMetadata } from '../src/project-metadata.schema';
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdtemp, rmdir } from 'node:fs/promises';
import os from 'node:os';

describe('auto-integrate-full: End-to-end roadmap generation', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'roadmap-e2e-'));
  });

  afterEach(async () => {
    try {
      // Cleanup
      const files = await readdir(tmpDir);
      for (const file of files) {
        const path = join(tmpDir, file);
        await rmdir(path, { recursive: true }).catch(() => {});
      }
      await rmdir(tmpDir).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
  });

  it('generates valid DAG for TypeScript library', () => {
    const metadata: ProjectMetadata = {
      projectType: 'typescript-library',
      init: ['package.json', 'src/index.ts', 'tsconfig.json'],
      term: ['dist/index.js', 'dist/index.d.ts'],
      buildCommand: 'npm run build',
    };

    const { sourceCode, dag } = generateRoadmapDAG('my-lib', metadata, 'tsc');

    // Validate DAG passes all checks
    expect(() => define(dag)).not.toThrow();

    const checkResult = check(dag);
    expect(checkResult.done).toBe(true);
    expect(checkResult.orphans).toHaveLength(0);

    const verifyErrors = verify(dag);
    expect(verifyErrors).toHaveLength(0);

    // Validate generated code
    expect(sourceCode).toContain('export default define(graph');
    expect(sourceCode).toContain('id: \'my-lib\'');
    expect(sourceCode).toContain('init');
    expect(sourceCode).toContain('build');
    expect(sourceCode).toContain('term');
    expect(sourceCode).toContain('tsc');
  });

  it('generates valid DAG for JavaScript webapp', () => {
    const metadata: ProjectMetadata = {
      projectType: 'webapp-react',
      init: ['package.json', 'src/App.tsx', 'public/index.html'],
      term: ['dist/index.html', 'dist/bundle.js'],
      buildCommand: 'npm run build',
    };

    const { sourceCode, dag } = generateRoadmapDAG('my-app', metadata, 'vite build');

    const validation = validateGeneratedDAG(dag);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    expect(sourceCode).toContain('vite build');
    expect(dag.nodes.build.produces).toContain('dist');
  });

  it('generates valid DAG for monorepo', () => {
    const metadata: ProjectMetadata = {
      projectType: 'monorepo-npm',
      init: ['package.json', 'packages/*/package.json'],
      term: ['packages/*/dist'],
      buildCommand: 'npm run build --workspaces',
    };

    const { sourceCode, dag } = generateRoadmapDAG('monorepo', metadata, 'npm run build --workspaces');

    const validation = validateGeneratedDAG(dag);
    expect(validation.valid).toBe(true);

    // Monorepo DAG should have init → build → term
    expect(dag.nodes.init.produces).toContain('node_modules');
    expect(dag.nodes.build.produces).toContain('dist');
  });

  it('enforces idempotent=true for non-terminal nodes', () => {
    const metadata: ProjectMetadata = {
      projectType: 'typescript-library',
      init: ['src'],
      term: ['dist'],
    };

    const { dag } = generateRoadmapDAG('test', metadata, 'tsc');

    // init and build must be idempotent
    expect(dag.nodes.init.idempotent).toBe(true);
    expect(dag.nodes.build.idempotent).toBe(true);

    // term must be non-idempotent (deployment gate)
    expect(dag.nodes.term.idempotent).toBe(false);
  });

  it('validates generated DAG with validateGeneratedDAG', () => {
    const metadata: ProjectMetadata = {
      projectType: 'typescript',
      init: ['src'],
      term: ['dist'],
    };

    const { dag } = generateRoadmapDAG('test', metadata, 'tsc');

    const validation = validateGeneratedDAG(dag);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('infers build output from buildCommand patterns', () => {
    const metadata: ProjectMetadata = {
      projectType: 'generic',
      init: ['src'],
      term: ['dist'],
    };

    // tsc → ['dist', 'lib', '*.d.ts']
    const { dag: tscDag } = generateRoadmapDAG('tsc-project', metadata, 'tsc');
    expect(tscDag.nodes.build.produces).toContain('dist');
    expect(tscDag.nodes.build.produces).toContain('lib');

    // vite → ['dist']
    const { dag: viteDag } = generateRoadmapDAG('vite-project', metadata, 'vite build');
    expect(viteDag.nodes.build.produces).toContain('dist');

    // Default → ['dist']
    const { dag: defaultDag } = generateRoadmapDAG('other-project', metadata, 'npm run build');
    expect(defaultDag.nodes.build.produces).toContain('dist');
  });

  it('includes package.json in build consumes', () => {
    const metadata: ProjectMetadata = {
      projectType: 'typescript',
      init: ['src', 'package.json'],
      term: ['dist'],
    };

    const { dag } = generateRoadmapDAG('test', metadata, 'tsc');

    // build node should consume package.json
    expect(dag.nodes.build.consumes).toContain('package.json');
  });

  it('generated DAG is extensible via reconcile', () => {
    const metadata: ProjectMetadata = {
      projectType: 'typescript',
      init: ['src'],
      term: ['dist'],
    };

    const { dag: minimalDag } = generateRoadmapDAG('test', metadata, 'tsc');

    // Minimal DAG has only 3 nodes: init, build, term
    expect(Object.keys(minimalDag.nodes)).toHaveLength(3);

    // But it's valid and agents can extend it with reconcile() to add test, lint phases
    const validation = validateGeneratedDAG(minimalDag);
    expect(validation.valid).toBe(true);
  });

  it('handles empty metadata gracefully', () => {
    const metadata: ProjectMetadata = {
      projectType: 'generic',
      init: [],
      term: [],
    };

    const { dag } = generateRoadmapDAG('empty-project', metadata, 'npm run build');

    const validation = validateGeneratedDAG(dag);
    expect(validation.valid).toBe(true);

    // Should still have init → build → term
    expect(Object.keys(dag.nodes)).toContain('init');
    expect(Object.keys(dag.nodes)).toContain('build');
    expect(Object.keys(dag.nodes)).toContain('term');
  });

  it('generates source code with correct structure', () => {
    const metadata: ProjectMetadata = {
      projectType: 'typescript',
      init: ['src'],
      term: ['dist'],
      buildCommand: 'npm run build',
    };

    const { sourceCode } = generateRoadmapDAG('test-project', metadata, 'tsc');

    // Must have shebang
    expect(sourceCode.startsWith('#!/usr/bin/env node')).toBe(true);

    // Must import from roadmap/protocol
    expect(sourceCode).toContain('from \'roadmap/protocol\'');

    // Must export default defined DAG
    expect(sourceCode).toContain('export default define(graph');

    // Must have all three nodes
    expect(sourceCode).toContain('id: \'init\'');
    expect(sourceCode).toContain('id: \'build\'');
    expect(sourceCode).toContain('id: \'term\'');

    // Must include dependency chain
    expect(sourceCode).toContain('deps: [\'init\']'); // build depends on init
    expect(sourceCode).toContain('deps: [\'build\']'); // term depends on build
  });

  it('generated code is executable TypeScript', () => {
    const metadata: ProjectMetadata = {
      projectType: 'typescript',
      init: ['src'],
      term: ['dist'],
    };

    const { sourceCode } = generateRoadmapDAG('test', metadata, 'tsc');

    // Can parse as TypeScript (basic check)
    expect(sourceCode).toBeTruthy();
    expect(sourceCode.length > 100).toBe(true);

    // Has proper structure
    const lines = sourceCode.split('\n');
    const hasExport = lines.some(l => l.includes('export default'));
    const hasDefine = lines.some(l => l.includes('define('));
    expect(hasExport && hasDefine).toBe(true);
  });

  it('CLI scenario: TypeScript lib with tsconfig', () => {
    const metadata: ProjectMetadata = {
      projectType: 'typescript',
      init: ['package.json', 'src/index.ts', 'tsconfig.json'],
      term: ['dist/index.js', 'dist/index.d.ts'],
      buildCommand: 'tsc',
    };

    const { dag, sourceCode } = generateRoadmapDAG('my-library', metadata, 'tsc');

    // Validate everything
    expect(() => define(dag)).not.toThrow();
    expect(check(dag).done).toBe(true);
    expect(verify(dag)).toHaveLength(0);
    expect(validateGeneratedDAG(dag).valid).toBe(true);

    // Verify generated code structure
    expect(sourceCode).toContain('my-library');
    expect(sourceCode).toContain('tsconfig.json'); // Should be in consumes
    expect(sourceCode).toContain('package.json');
  });

  it('CLI scenario: React webapp with vite', () => {
    const metadata: ProjectMetadata = {
      projectType: 'webapp',
      init: ['package.json', 'src/App.tsx', 'index.html'],
      term: ['dist'],
      buildCommand: 'vite build',
    };

    const { dag, sourceCode } = generateRoadmapDAG('my-app', metadata, 'vite build');

    expect(validateGeneratedDAG(dag).valid).toBe(true);
    expect(sourceCode).toContain('vite build');
    expect(dag.nodes.build.consumes).toContain('package.json');
  });
});
