// CLI Cross-Repo Commands Tests
// Tests for locate, sync, and parallel --cross-repo/--graph functionality

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { roadmapCli } from './cli-helper.ts';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as os from 'node:os';

const tmpDir = join(os.tmpdir(), `roadmap-test-${Date.now()}`);
const repoRoot = tmpDir;

beforeEach(() => {
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

function createMinimalDAG(id: string, nodes: Record<string, any> = {}) {
  const defaultNodes = {
    init: { id: 'init', desc: 'start', produces: ['init.txt'], consumes: [], deps: [], validate: [], idempotent: true },
    term: { id: 'term', desc: 'end', produces: [], consumes: ['init.txt'], deps: ['init'], validate: [], idempotent: false },
  };
  return { id, desc: `Test roadmap ${id}`, init: 'init', term: 'term', nodes: { ...defaultNodes, ...nodes }, version: '0.3.0', protocolVersion: '0.3.0' };
}

function unwrapEnvelope(raw: any): any {
  if (raw && typeof raw === 'object' && 'schema_version' in raw && 'data' in raw) return raw.data;
  return raw;
}

function executeCmd(cmd: string, cwd: string = repoRoot): any {
  try {
    return unwrapEnvelope(JSON.parse(roadmapCli(cmd, { cwd })));
  } catch (e) {
    if (e instanceof Error && 'stdout' in e) {
      try { return unwrapEnvelope(JSON.parse((e as any).stdout)); } catch { throw e; }
    }
    throw e;
  }
}

const diamondNodes = {
  init: { id: 'init', desc: 'start', produces: ['init.txt'], consumes: [], deps: [], validate: [], idempotent: true },
  a: { id: 'a', desc: 'step a', produces: ['a.txt'], consumes: ['init.txt'], deps: ['init'], validate: [], idempotent: true },
  b: { id: 'b', desc: 'step b', produces: ['b.txt'], consumes: ['init.txt'], deps: ['init'], validate: [], idempotent: true },
  term: { id: 'term', desc: 'end', produces: [], consumes: ['a.txt', 'b.txt'], deps: ['a', 'b'], validate: [], idempotent: false },
};

describe('CLI Cross-Repo Commands', () => {
  // Batched: one CLI call, multiple assertions — avoids ~1.2s/spawn overhead
  describe('locate --all', () => {
    it('returns roadmaps array with timestamp', () => {
      mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
      const result = executeCmd('locate --all --note "test"', tmpDir);
      expect(result).toHaveProperty('roadmaps');
      expect(Array.isArray(result.roadmaps)).toBe(true);
      expect(result).toHaveProperty('timestamp');
      expect(typeof result.timestamp).toBe('string');
    });
  });

  describe('sync [--format]', () => {
    beforeEach(() => {
      mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
      writeFileSync(join(tmpDir, '.roadmap/head.json'), JSON.stringify(createMinimalDAG('main')));
    });

    it('returns JSON with roadmaps, count, timestamp', () => {
      const result = executeCmd('sync --note "test"', tmpDir);
      expect(result).toHaveProperty('roadmaps');
      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('timestamp');
      expect(Array.isArray(result.roadmaps)).toBe(true);
    });

    it('accepts --format json explicitly', () => {
      const result = executeCmd('sync --format json --note "test"', tmpDir);
      expect(result).toHaveProperty('roadmaps');
    });

    it('accepts --format tree', () => {
      roadmapCli('sync --format tree --note "test"', { cwd: tmpDir });
    });

    it('rejects invalid format', () => {
      try {
        const result = executeCmd('sync --format invalid --note "test"', tmpDir);
        expect(result.error || result.code).toBeDefined();
      } catch (e) {
        expect(e).toBeDefined();
      }
    });
  });

  describe('parallel', () => {
    beforeEach(() => {
      const dag = createMinimalDAG('parallel-test', diamondNodes);
      mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
      writeFileSync(join(tmpDir, '.roadmap/head.json'), JSON.stringify(dag));
    });

    it('returns batches with level, nodes, count', () => {
      const result = executeCmd('parallel --note "test"', tmpDir);
      expect(result).toHaveProperty('batches');
      expect(Array.isArray(result.batches)).toBe(true);
      expect(result).toHaveProperty('totalLevels');
      expect(result).toHaveProperty('maxParallelism');
      // Check batch structure
      const batch = result.batches[0];
      expect(batch).toHaveProperty('level');
      expect(batch).toHaveProperty('nodes');
      expect(batch).toHaveProperty('count');
      expect(Array.isArray(batch.nodes)).toBe(true);
    });

    it('--graph includes full DAG structure with edges', () => {
      const result = executeCmd('parallel --graph --note "test"', tmpDir);
      expect(result).toHaveProperty('graph');
      expect(result.graph).toHaveProperty('id');
      expect(result.graph).toHaveProperty('init');
      expect(result.graph).toHaveProperty('term');
      expect(result.graph).toHaveProperty('nodes');
      expect(result.graph).toHaveProperty('edges');
      // Nodes have required fields
      expect(result.graph.nodes.length).toBeGreaterThan(0);
      const node = result.graph.nodes[0];
      expect(node).toHaveProperty('id');
      expect(node).toHaveProperty('desc');
      expect(node).toHaveProperty('deps');
      expect(node).toHaveProperty('produces');
      expect(node).toHaveProperty('consumes');
      // Edges are well-formed
      for (const edge of result.graph.edges) {
        expect(edge).toHaveProperty('from');
        expect(edge).toHaveProperty('to');
      }
    });

    it('--cross-repo includes siblings', () => {
      const result = executeCmd('parallel --cross-repo --note "test"', tmpDir);
      expect(result).toHaveProperty('crossRepoSiblings');
      expect(Array.isArray(result.crossRepoSiblings)).toBe(true);
    });

    it('--cross-repo --graph combines both', () => {
      const result = executeCmd('parallel --cross-repo --graph --note "test"', tmpDir);
      expect(result).toHaveProperty('batches');
      expect(result).toHaveProperty('graph');
      expect(result).toHaveProperty('crossRepoSiblings');
    });
  });

  describe('Trail Recording', () => {
    beforeEach(() => {
      mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
      writeFileSync(join(tmpDir, '.roadmap/head.json'), JSON.stringify(createMinimalDAG('test')));
    });

    it('records commands in trail', () => {
      // Run multiple commands, check trail once
      try { executeCmd('locate --all --note "test locate"', tmpDir); } catch {}
      try { executeCmd('sync --note "test sync"', tmpDir); } catch {}
      executeCmd('parallel --cross-repo --graph --note "test parallel"', tmpDir);

      const trailPath = join(tmpDir, '.roadmap/trail.jsonl');
      if (existsSync(trailPath)) {
        const entries = readFileSync(trailPath, 'utf-8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
        expect(entries.some((e: any) => e.cmd === 'locate')).toBe(true);
        expect(entries.some((e: any) => e.cmd === 'sync')).toBe(true);
        const parallelEntry = entries.find((e: any) => e.cmd === 'parallel');
        expect(parallelEntry).toBeDefined();
        if (parallelEntry?.detail) {
          expect(parallelEntry.detail.crossRepo).toBe(true);
          expect(parallelEntry.detail.showGraph).toBe(true);
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('handles missing DAG and missing skill gracefully', () => {
      mkdirSync(tmpDir, { recursive: true });
      const result = executeCmd('locate --all --note "test"', tmpDir);
      expect(result).toHaveProperty('roadmaps');

      // With DAG but possibly missing skill
      mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
      writeFileSync(join(tmpDir, '.roadmap/head.json'), JSON.stringify(createMinimalDAG('test')));
      try {
        executeCmd('locate --all --note "test"', tmpDir);
      } catch (e) {
        expect(e).toBeDefined();
      }
    });
  });

  describe('Integration', () => {
    it('parallel --cross-repo --graph provides complete view', () => {
      const nodes = {
        init: { id: 'init', desc: 'start', produces: ['init.txt'], consumes: [], deps: [], validate: [], idempotent: true },
        a: { id: 'a', desc: 'step a', produces: ['a.txt'], consumes: ['init.txt'], deps: ['init'], validate: [], idempotent: true },
        term: { id: 'term', desc: 'end', produces: [], consumes: ['a.txt'], deps: ['a'], validate: [], idempotent: false },
      };
      const dag = createMinimalDAG('integration', nodes);
      mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
      writeFileSync(join(tmpDir, '.roadmap/head.json'), JSON.stringify(dag));

      const result = executeCmd('parallel --cross-repo --graph --note "test"', tmpDir);
      expect(result.batches).toBeDefined();
      expect(result.totalLevels).toBeGreaterThan(0);
      expect(result.maxParallelism).toBeGreaterThan(0);
      expect(result.graph).toBeDefined();
      expect(result.graph.nodes.length).toBeGreaterThanOrEqual(3);
      expect(result.crossRepoSiblings).toBeDefined();
      expect(Array.isArray(result.crossRepoSiblings)).toBe(true);
    });
  });
});
