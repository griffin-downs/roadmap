/**
 * FR consumer E2E: simulates the mono-fusion/donjon scenario end-to-end.
 *
 * Validates:
 *  FR-1: siblingArtifactExists predicate
 *  FR-2: orient with blockedBy
 *  FR-3: orderByDependencies transitive resolution
 *  FR-4: chart --deps (visual output, tested via CLI)
 *  FR-5: merge --from diagnostic
 *  FR-6: trail entries with dep context
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join, resolve } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { crossOrient } from '../src/lib/cross-orient.ts';
import { orderByDependencies } from '../src/lib/dependency-resolver.ts';
import { siblingArtifactExists, fileExists, any } from '../src/predicates.ts';
import { orient, CompletionStore } from '../src/protocol.ts';

const root = process.cwd();
const cli = join(root, 'bin/roadmap.ts');
const tmpBase = join(root, '.test-fr-e2e');
const donjonRepo = join(tmpBase, 'donjon');
const fusionRepo = join(tmpBase, 'mono-fusion');

function cliRun(cmd: string, cwd: string): string {
  return execSync(`node --experimental-strip-types ${cli} ${cmd}`, {
    cwd, encoding: 'utf-8', env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
}

beforeAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });

  // donjon: infra template repo
  mkdirSync(join(donjonRepo, '.roadmap'), { recursive: true });
  execSync('git init', { cwd: donjonRepo, stdio: 'pipe' });
  writeFileSync(join(donjonRepo, '.roadmap/head.json'), JSON.stringify({
    id: 'donjon', desc: 'Hermetic build platform', init: 'docker-base', term: 'build-container',
    nodes: {
      'docker-base': { id: 'docker-base', desc: 'Base Docker image', produces: ['Dockerfile.base'], consumes: [], deps: [], validate: [], idempotent: true },
      'style-config': { id: 'style-config', desc: 'Style enforcement', produces: ['.clang-format'], consumes: ['Dockerfile.base'], deps: ['docker-base'], validate: [], idempotent: true },
      'build-container': { id: 'build-container', desc: 'Build container', produces: ['Dockerfile.build'], consumes: ['.clang-format'], deps: ['style-config'], validate: [], idempotent: false },
    },
  }));
  writeFileSync(join(donjonRepo, 'Dockerfile.base'), 'FROM ubuntu:22.04');
  execSync('git add -A && git commit -m "init donjon"', { cwd: donjonRepo, stdio: 'pipe' });

  // mono-fusion: product repo depending on donjon
  mkdirSync(join(fusionRepo, '.roadmap'), { recursive: true });
  execSync('git init', { cwd: fusionRepo, stdio: 'pipe' });
  writeFileSync(join(fusionRepo, '.roadmap/head.json'), JSON.stringify({
    id: 'mono-fusion', desc: 'Sensor fusion monorepo', init: 'adr-setup', term: 'shared-protocol',
    nodes: {
      'adr-setup': { id: 'adr-setup', desc: 'ADR docs', produces: ['docs/adr-001.md'], consumes: [], deps: [], validate: [], idempotent: true },
      'shared-protocol': { id: 'shared-protocol', desc: 'Shared protocol types', produces: ['shared/protocol/fusion_types.h'], consumes: ['docs/adr-001.md', 'Dockerfile.build', '.clang-format'], deps: ['adr-setup'], validate: [], idempotent: false },
    },
  }));
  writeFileSync(join(fusionRepo, '.roadmap.json'), JSON.stringify({
    projectType: 'embedded-monorepo', init: ['docs/adr-001.md'], term: ['shared/protocol/fusion_types.h'],
    dependencies: [
      { repo: '../donjon', consumes: ['Dockerfile.build', '.clang-format'], phase: 'build', mustComplete: true },
    ],
  }));
  mkdirSync(join(fusionRepo, 'docs'), { recursive: true });
  writeFileSync(join(fusionRepo, 'docs/adr-001.md'), '# ADR-001');
  execSync('git add -A && git commit -m "init mono-fusion"', { cwd: fusionRepo, stdio: 'pipe' });
});

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

describe('FR-1: siblingArtifactExists predicate', () => {
  it('checks artifacts across repo boundaries', () => {
    const donjonExists = siblingArtifactExists(donjonRepo);
    expect(donjonExists('Dockerfile.base')).toBe(true);
    expect(donjonExists('Dockerfile.build')).toBe(false); // not produced yet
  });

  it('composes with any() for cross-repo orient', () => {
    const check = any(fileExists(fusionRepo), siblingArtifactExists(donjonRepo));
    expect(check('docs/adr-001.md')).toBe(true);     // local
    expect(check('Dockerfile.base')).toBe(true);      // sibling
    expect(check('Dockerfile.build')).toBe(false);    // neither
  });
});

describe('FR-2: orient with blockedBy', () => {
  it('reports blocking when donjon has not produced consumed artifacts', async () => {
    const dag = JSON.parse(readFileSync(join(fusionRepo, '.roadmap/head.json'), 'utf-8'));
    const result = await crossOrient(dag, fusionRepo, CompletionStore.empty());

    expect(result.blockedBy.length).toBeGreaterThanOrEqual(1);
    const donjonBlock = result.blockedBy.find(b => b.repo === 'donjon');
    expect(donjonBlock).toBeDefined();
    expect(donjonBlock!.waiting).toContain('Dockerfile.build');
    expect(donjonBlock!.waiting).toContain('.clang-format');
  });

  it('unblocks after donjon produces artifacts', async () => {
    // Simulate donjon progress
    writeFileSync(join(donjonRepo, '.clang-format'), 'BasedOnStyle: Google');
    writeFileSync(join(donjonRepo, 'Dockerfile.build'), 'FROM donjon-base:latest');

    const dag = JSON.parse(readFileSync(join(fusionRepo, '.roadmap/head.json'), 'utf-8'));
    const result = await crossOrient(dag, fusionRepo, CompletionStore.empty());

    expect(result.blockedBy).toHaveLength(0);
    expect(result.deps[0].satisfied).toBe(true);

    // Cleanup
    rmSync(join(donjonRepo, '.clang-format'));
    rmSync(join(donjonRepo, 'Dockerfile.build'));
  });
});

describe('FR-3: orderByDependencies transitive', () => {
  it('orders donjon before mono-fusion', async () => {
    const order = await orderByDependencies(fusionRepo);
    const donjonIdx = order.findIndex(p => p.includes('donjon'));
    const fusionIdx = order.findIndex(p => p.includes('mono-fusion'));
    expect(donjonIdx).toBeLessThan(fusionIdx);
  });
});

describe('FR-4: chart --deps', () => {
  it('shows donjon position in combined view', () => {
    const output = cliRun('chart --deps', fusionRepo);
    expect(output).toContain('donjon');
    expect(output).toContain('mono-fusion');
  });
});

describe('FR-5: merge --from diagnostic', () => {
  it('shows artifact connections between repos', () => {
    const output = cliRun('merge --from ../donjon --note "check connections"', fusionRepo);
    const _raw = JSON.parse(output);
    const result = (_raw && 'schema_version' in _raw && 'data' in _raw) ? _raw.data : _raw;
    expect(result.connections.siblingToLocal.length).toBeGreaterThanOrEqual(1);
    const conn = result.connections.siblingToLocal;
    const artifacts = conn.map((c: any) => c.artifact);
    expect(artifacts).toContain('Dockerfile.build');
  });
});

describe('FR-6: trail entries with dep context', () => {
  it('orient records dep status in trail', () => {
    cliRun('orient --note "check trail deps"', fusionRepo);
    const trail = readFileSync(join(fusionRepo, '.roadmap/trail.jsonl'), 'utf-8')
      .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
    const last = trail[trail.length - 1];
    expect(last.detail.deps).toBeDefined();
    expect(last.detail.deps[0].repo).toBe('donjon');
    expect(last.detail.deps[0].satisfied).toBeDefined();
  });
});
