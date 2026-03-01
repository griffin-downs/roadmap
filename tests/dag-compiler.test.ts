import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { define } from '../src/protocol.ts';
import { buildScaffold } from '../src/lib/scaffold.ts';
import { buildClusters } from '../src/lib/utils/cluster/cluster.ts';
import { buildSchedule } from '../src/lib/schedule.ts';
import type { Graph } from '../src/protocol.ts';

// --- helpers ---

function tmpDir(): string {
  const dir = join(tmpdir(), `dag-compiler-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const dirs: string[] = [];
function managedTmpDir(): string {
  const d = tmpDir();
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs.splice(0)) {
    if (existsSync(d)) rmSync(d, { recursive: true });
  }
});

// DAG with data-flow coupling: shared-types → db → api, and isolated ui
function coupledDag(): Graph<'init' | 'shared-types' | 'db' | 'api' | 'ui' | 'term'> {
  return define({
    id: 'coupled', desc: 'coupled', init: 'init', term: 'term',
    nodes: {
      init:         { id: 'init',         desc: 'start',        produces: ['pkg'],            consumes: [],                       deps: [],                    validate: [], idempotent: true },
      'shared-types': { id: 'shared-types', desc: 'types',      produces: ['shared/types.ts'], consumes: ['pkg'],                  deps: ['init'],              validate: [], idempotent: true },
      db:           { id: 'db',           desc: 'database',     produces: ['src/db.ts'],       consumes: ['shared/types.ts'],      deps: ['shared-types'],      validate: [], idempotent: true },
      api:          { id: 'api',          desc: 'api layer',    produces: ['src/api.ts'],      consumes: ['src/db.ts'],            deps: ['db'],                validate: [], idempotent: true },
      ui:           { id: 'ui',           desc: 'ui (isolated)', produces: ['src/ui.ts'],      consumes: [],                       deps: ['init'],              validate: [], idempotent: true },
      term:         { id: 'term',         desc: 'end',          produces: [],                  consumes: ['src/api.ts','src/ui.ts'], deps: ['api','ui'],         validate: [], idempotent: false },
    },
  });
}

// --- scaffold ---

describe('buildScaffold', () => {
  it('generates stubs for all non-init/term nodes produces', async () => {
    const root = managedTmpDir();
    const dag = coupledDag();
    const result = await buildScaffold(dag, root, {});
    expect(result.dryRun).toBe(false);
    // shared-types, db, api, ui each have one produce; init has 'pkg' (non-file)
    const paths = result.stubs.map(s => s.path);
    expect(paths).toContain('shared/types.ts');
    expect(paths).toContain('src/db.ts');
    expect(paths).toContain('src/api.ts');
    expect(paths).toContain('src/ui.ts');
  });

  it('creates files on disk with @stub comment', async () => {
    const root = managedTmpDir();
    const dag = coupledDag();
    await buildScaffold(dag, root, {});
    const content = readFileSync(join(root, 'shared/types.ts'), 'utf-8');
    expect(content).toContain('@stub');
    expect(content).toContain('shared-types');
  });

  it('does not overwrite existing files', async () => {
    const root = managedTmpDir();
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/db.ts'), 'existing content');
    const dag = coupledDag();
    const result = await buildScaffold(dag, root, {});
    const dbStub = result.stubs.find(s => s.path === 'src/db.ts')!;
    expect(dbStub.existed).toBe(true);
    expect(readFileSync(join(root, 'src/db.ts'), 'utf-8')).toBe('existing content');
  });

  it('dry-run returns stubs without writing to disk', async () => {
    const root = managedTmpDir();
    const dag = coupledDag();
    const result = await buildScaffold(dag, root, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.filesGenerated).toBe(0);
    expect(existsSync(join(root, 'shared/types.ts'))).toBe(false);
    expect(result.stubs.length).toBeGreaterThan(0);
  });

  it('counts filesGenerated correctly', async () => {
    const root = managedTmpDir();
    const dag = coupledDag();
    const result = await buildScaffold(dag, root, {});
    // pkg is not a real file path (no extension filter), but it shouldn't matter
    // All 4 non-init/term produces should generate
    expect(result.filesGenerated).toBeGreaterThan(0);
    expect(result.filesGenerated).toBe(result.stubs.filter(s => !s.existed).length);
  });

  it('generates .vue stub with template block', async () => {
    const root = managedTmpDir();
    const dag = define({
      id: 'vue-test', desc: 'vue', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: 's', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
        comp: { id: 'comp', desc: 'component', produces: ['src/App.vue'], consumes: [], deps: ['init'], validate: [], idempotent: true },
        term: { id: 'term', desc: 'e', produces: [], consumes: ['src/App.vue'], deps: ['comp'], validate: [], idempotent: false },
      },
    });
    await buildScaffold(dag, root, {});
    const content = readFileSync(join(root, 'src/App.vue'), 'utf-8');
    expect(content).toContain('<template>');
    expect(content).toContain('<script setup');
  });
});

// --- cluster ---

describe('buildClusters', () => {
  it('groups coupled nodes (db consumes shared-types produces) into same cluster', () => {
    const dag = coupledDag();
    const result = buildClusters(dag, {});
    // shared-types → db → api should be in one cluster (coupled chain)
    const allNodes = result.clusters.flatMap(c => c.nodes);
    const sharedCluster = result.clusters.find(c => c.nodes.includes('shared-types'))!;
    expect(sharedCluster.nodes).toContain('db');
  });

  it('isolates ui (no data flow to main chain) into separate cluster', () => {
    const dag = coupledDag();
    const result = buildClusters(dag, {});
    const sharedCluster = result.clusters.find(c => c.nodes.includes('shared-types'))!;
    expect(sharedCluster.nodes).not.toContain('ui');
  });

  it('marks critical clusters correctly', () => {
    const dag = coupledDag();
    const result = buildClusters(dag, {});
    // The critical path includes shared-types → db → api → term
    const criticalCluster = result.clusters.find(c => c.nodes.includes('api'));
    expect(criticalCluster?.critical).toBe(true);
  });

  it('coupling score is positive for clusters with shared edges', () => {
    const dag = coupledDag();
    const result = buildClusters(dag, {});
    const chain = result.clusters.find(c => c.nodes.includes('shared-types') && c.nodes.length > 1);
    expect(chain?.coupling).toBeGreaterThan(0);
  });

  it('maxSize splits large components', () => {
    const dag = coupledDag();
    const result = buildClusters(dag, { maxSize: 2 });
    for (const cluster of result.clusters) {
      expect(cluster.nodes.length).toBeLessThanOrEqual(2);
    }
  });

  it('context includes produces and consumes of all cluster nodes', () => {
    const dag = coupledDag();
    const result = buildClusters(dag, {});
    const chain = result.clusters.find(c => c.nodes.includes('db'))!;
    expect(chain.context).toContain('src/db.ts');
  });

  it('agentCount equals cluster count', () => {
    const dag = coupledDag();
    const result = buildClusters(dag, {});
    expect(result.agentCount).toBe(result.clusters.length);
  });
});

// --- schedule ---

describe('buildSchedule', () => {
  it('produces waves with increasing wave numbers', () => {
    const dag = coupledDag();
    const clusters = buildClusters(dag, {});
    const schedule = buildSchedule(dag, clusters);
    for (let i = 0; i < schedule.waves.length; i++) {
      expect(schedule.waves[i].wave).toBe(i);
    }
  });

  it('wave 0 contains clusters with no inter-cluster dependencies', () => {
    const dag = coupledDag();
    const clusters = buildClusters(dag, { maxSize: 2 }); // force splits to see deps
    const schedule = buildSchedule(dag, clusters);
    expect(schedule.waves[0].spawn.length).toBeGreaterThan(0);
  });

  it('pipelineDepth matches wave count', () => {
    const dag = coupledDag();
    const clusters = buildClusters(dag, {});
    const schedule = buildSchedule(dag, clusters);
    expect(schedule.pipelineDepth).toBe(schedule.waves.length);
  });

  it('maxConcurrency is max wave size', () => {
    const dag = coupledDag();
    const clusters = buildClusters(dag, {});
    const schedule = buildSchedule(dag, clusters);
    const actual = Math.max(...schedule.waves.map(w => w.spawn.length));
    expect(schedule.maxConcurrency).toBe(actual);
  });

  it('criticalPath is subset of cluster IDs', () => {
    const dag = coupledDag();
    const clusters = buildClusters(dag, {});
    const schedule = buildSchedule(dag, clusters);
    const allIds = new Set(clusters.clusters.map(c => c.id));
    for (const id of schedule.criticalPath) {
      expect(allIds.has(id)).toBe(true);
    }
  });

  it('all clusters appear in exactly one wave', () => {
    const dag = coupledDag();
    const clusters = buildClusters(dag, {});
    const schedule = buildSchedule(dag, clusters);
    const assigned = schedule.waves.flatMap(w => w.spawn);
    expect(assigned.length).toBe(clusters.clusters.length);
    expect(new Set(assigned).size).toBe(clusters.clusters.length);
  });
});
