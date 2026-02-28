import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join, resolve } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { crossOrient } from '../src/lib/cross-orient.ts';
import { define, graph, CompletionStore } from '../src/protocol.ts';
import { discoverDependencies, resolveSiblingPath, orderByDependencies, buildDepGraph } from '../src/lib/dependency-resolver.ts';
import type { DependencySpec } from '../src/lib/project-metadata.schema.ts';

const root = process.cwd();
const tmpBase = join(root, '.test-cross-orient');
const localRepo = join(tmpBase, 'local');
const siblingRepo = join(tmpBase, 'sibling');

function makeDAG(id: string, init: string, term: string, nodes: Record<string, any>) {
  return { id, desc: `test DAG ${id}`, init, term, nodes };
}

beforeAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });

  // Create local repo with .roadmap.json declaring sibling dep
  mkdirSync(join(localRepo, '.roadmap'), { recursive: true });
  writeFileSync(join(localRepo, '.roadmap/head.json'), JSON.stringify(makeDAG(
    'local-project', 'start', 'end', {
      start: { id: 'start', desc: 'init', produces: ['local.ts'], consumes: [], deps: [], validate: [], idempotent: true },
      mid: { id: 'mid', desc: 'needs sibling', produces: ['output.ts'], consumes: ['shared/types.h'], deps: ['start'], validate: [], idempotent: true },
      end: { id: 'end', desc: 'done', produces: [], consumes: ['output.ts'], deps: ['mid'], validate: [], idempotent: false },
    },
  )));
  writeFileSync(join(localRepo, 'local.ts'), 'export const x = 1;');
  writeFileSync(join(localRepo, '.roadmap.json'), JSON.stringify({
    projectType: 'test',
    init: ['local.ts'],
    term: ['output.ts'],
    dependencies: [{
      repo: '../sibling',
      consumes: ['shared/types.h'],
      phase: 'build',
      mustComplete: true,
    }],
  }));

  // Create sibling repo with its own DAG
  mkdirSync(join(siblingRepo, '.roadmap'), { recursive: true });
  mkdirSync(join(siblingRepo, 'shared'), { recursive: true });
  writeFileSync(join(siblingRepo, '.roadmap/head.json'), JSON.stringify(makeDAG(
    'sibling-project', 'init', 'done', {
      init: { id: 'init', desc: 'start', produces: ['base.h'], consumes: [], deps: [], validate: [], idempotent: true },
      build: { id: 'build', desc: 'build shared', produces: ['shared/types.h'], consumes: ['base.h'], deps: ['init'], validate: [], idempotent: true },
      done: { id: 'done', desc: 'complete', produces: [], consumes: ['shared/types.h'], deps: ['build'], validate: [], idempotent: false },
    },
  )));
  writeFileSync(join(siblingRepo, 'base.h'), '#pragma once');
});

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

describe('dependency-resolver', () => {
  it('discoverDependencies reads .roadmap.json', async () => {
    const deps = await discoverDependencies(localRepo);
    expect(deps).toHaveLength(1);
    expect(deps[0].repo).toBe('../sibling');
    expect(deps[0].consumes).toContain('shared/types.h');
  });

  it('discoverDependencies returns [] for repo without .roadmap.json', async () => {
    const deps = await discoverDependencies(siblingRepo);
    expect(deps).toEqual([]);
  });

  it('resolveSiblingPath resolves relative path', () => {
    const dep: DependencySpec = { repo: '../sibling', consumes: [], phase: 'build' };
    const resolved = resolveSiblingPath(localRepo, dep);
    expect(resolved).toBe(resolve(localRepo, '../sibling'));
  });

  it('resolveSiblingPath uses siblingPath override', () => {
    const dep: DependencySpec = { repo: '../sibling', consumes: [], phase: 'build', siblingPath: '/custom/path' };
    const resolved = resolveSiblingPath(localRepo, dep);
    expect(resolved).toBe(resolve(localRepo, '/custom/path'));
  });

  it('buildDepGraph discovers transitive deps', async () => {
    const depGraph = await buildDepGraph(localRepo);
    expect(depGraph.repos.has(resolve(localRepo))).toBe(true);
    expect(depGraph.repos.has(resolve(siblingRepo))).toBe(true);
  });

  it('orderByDependencies returns build order (deps first)', async () => {
    const order = await orderByDependencies(localRepo);
    const sibIdx = order.indexOf(resolve(siblingRepo));
    const localIdx = order.indexOf(resolve(localRepo));
    expect(sibIdx).toBeLessThan(localIdx);
  });
});

describe('crossOrient', () => {
  it('returns standard orientation fields', async () => {
    const dag = JSON.parse(require('node:fs').readFileSync(join(localRepo, '.roadmap/head.json'), 'utf-8'));
    const result = await crossOrient(dag, localRepo, CompletionStore.empty());
    expect(result.position).toBeDefined();
    expect(result.done).toBeDefined();
    expect(result.produces).toBeDefined();
    expect(result.remaining).toBeDefined();
  });

  it('includes deps array with sibling status', async () => {
    const dag = JSON.parse(require('node:fs').readFileSync(join(localRepo, '.roadmap/head.json'), 'utf-8'));
    const result = await crossOrient(dag, localRepo, CompletionStore.empty());
    expect(result.deps).toHaveLength(1);
    expect(result.deps[0].repo).toBe('sibling');
    expect(result.deps[0].repoExists).toBe(true);
    expect(result.deps[0].dagExists).toBe(true);
  });

  it('reports blocking when sibling has not produced consumed artifact', async () => {
    const dag = JSON.parse(require('node:fs').readFileSync(join(localRepo, '.roadmap/head.json'), 'utf-8'));
    const result = await crossOrient(dag, localRepo, CompletionStore.empty());

    // sibling hasn't produced shared/types.h yet, and dep is mustComplete
    expect(result.blockedBy.length).toBeGreaterThanOrEqual(1);
    expect(result.blockedBy[0].waiting).toContain('shared/types.h');
  });

  it('clears blocking once sibling produces the artifact', async () => {
    // Create the artifact in sibling
    writeFileSync(join(siblingRepo, 'shared/types.h'), '#pragma once\ntypedef int fusion_t;');

    const dag = JSON.parse(require('node:fs').readFileSync(join(localRepo, '.roadmap/head.json'), 'utf-8'));
    const result = await crossOrient(dag, localRepo, CompletionStore.empty());

    expect(result.deps[0].satisfied).toBe(true);
    expect(result.blockedBy).toHaveLength(0);

    // Cleanup
    rmSync(join(siblingRepo, 'shared/types.h'));
  });

  it('handles missing sibling repo gracefully', async () => {
    // Point to nonexistent repo
    writeFileSync(join(localRepo, '.roadmap.json'), JSON.stringify({
      projectType: 'test', init: ['local.ts'], term: ['output.ts'],
      dependencies: [{ repo: '../nonexistent', consumes: ['x.h'], phase: 'build', mustComplete: true }],
    }));

    const dag = JSON.parse(require('node:fs').readFileSync(join(localRepo, '.roadmap/head.json'), 'utf-8'));
    const result = await crossOrient(dag, localRepo, CompletionStore.empty());
    expect(result.deps[0].repoExists).toBe(false);
    expect(result.blockedBy[0].waiting).toContain('x.h');

    // Restore original
    writeFileSync(join(localRepo, '.roadmap.json'), JSON.stringify({
      projectType: 'test', init: ['local.ts'], term: ['output.ts'],
      dependencies: [{ repo: '../sibling', consumes: ['shared/types.h'], phase: 'build', mustComplete: true }],
    }));
  });

  it('returns no blockedBy when repo has no deps', async () => {
    const dag = JSON.parse(require('node:fs').readFileSync(join(siblingRepo, '.roadmap/head.json'), 'utf-8'));
    const result = await crossOrient(dag, siblingRepo, CompletionStore.empty());
    expect(result.blockedBy).toHaveLength(0);
    expect(result.deps).toHaveLength(0);
  });
});
