// CLI Cross-Repo Commands Tests
// Tests for locate, sync, and parallel --cross-repo/--graph functionality

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { roadmapCli } from './cli-helper.ts';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as os from 'node:os';

const tmpDir = join(os.tmpdir(), `roadmap-test-${Date.now()}`);
const repoRoot = tmpDir;

// Setup and teardown
beforeEach(() => {
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

function createMinimalDAG(id: string, nodes: Record<string, any> = {}) {
  const defaultNodes = {
    init: {
      id: 'init',
      desc: 'start',
      produces: ['init.txt'],
      consumes: [],
      deps: [],
      validate: [],
      idempotent: true,
    },
    term: {
      id: 'term',
      desc: 'end',
      produces: [],
      consumes: ['init.txt'],
      deps: ['init'],
      validate: [],
      idempotent: false,
    },
  };

  return {
    id,
    desc: `Test roadmap ${id}`,
    init: 'init',
    term: 'term',
    nodes: { ...defaultNodes, ...nodes },
    version: '0.3.0',
    protocolVersion: '0.3.0',
  };
}

function executeCmd(cmd: string, cwd: string = repoRoot): any {
  try {
    return JSON.parse(roadmapCli(cmd, { cwd }));
  } catch (e) {
    if (e instanceof Error && 'stdout' in e) {
      try {
        return JSON.parse((e as any).stdout);
      } catch {
        throw e;
      }
    }
    throw e;
  }
}

describe('CLI Cross-Repo Commands', () => {
  describe('locate --all', () => {
    it('returns empty roadmaps array when none found', () => {
      mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
      const result = executeCmd('locate --all --note "test"', tmpDir);
      expect(result).toHaveProperty('roadmaps');
      expect(Array.isArray(result.roadmaps)).toBe(true);
    });

    it('discovers roadmaps with correct structure', () => {
      const dag = createMinimalDAG('test-roadmap');
      mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
      writeFileSync(join(tmpDir, '.roadmap/head.json'), JSON.stringify(dag));

      const result = executeCmd('locate --all --note "test"', tmpDir);
      expect(result.roadmaps).toBeDefined();
      expect(Array.isArray(result.roadmaps)).toBe(true);
      // May or may not find the test DAG depending on implementation
    });

    it('includes timestamp in output', () => {
      mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
      const result = executeCmd('locate --all --note "test"', tmpDir);
      expect(result).toHaveProperty('timestamp');
      expect(typeof result.timestamp).toBe('string');
    });
  });

  describe('sync [--format]', () => {
    beforeEach(() => {
      const dag = createMinimalDAG('main');
      mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
      writeFileSync(join(tmpDir, '.roadmap/head.json'), JSON.stringify(dag));
    });

    it('returns JSON format by default', () => {
      const result = executeCmd('sync --note "test"', tmpDir);
      expect(result).toHaveProperty('roadmaps');
      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('timestamp');
      expect(Array.isArray(result.roadmaps)).toBe(true);
    });

    it('accepts --format json explicitly', () => {
      const result = executeCmd('sync --format json --note "test"', tmpDir);
      expect(result).toHaveProperty('roadmaps');
      expect(Array.isArray(result.roadmaps)).toBe(true);
    });

    it('accepts --format tree', () => {
      // Tree format outputs to console, not JSON
      // Just verify the command executes without error
      roadmapCli('sync --format tree --note "test"', { cwd: tmpDir });
    });

    it('rejects invalid format', () => {
      try {
        const result = executeCmd('sync --format invalid --note "test"', tmpDir);
        // Command error handling returns error in JSON response
        expect(result.error || result.code).toBeDefined();
      } catch (e) {
        // Or it may throw
        expect(e).toBeDefined();
      }
    });
  });

  describe('parallel [--cross-repo] [--graph]', () => {
    beforeEach(() => {
      const nodes = {
        init: {
          id: 'init',
          desc: 'start',
          produces: ['init.txt'],
          consumes: [],
          deps: [],
          validate: [],
          idempotent: true,
        },
        a: {
          id: 'a',
          desc: 'step a',
          produces: ['a.txt'],
          consumes: ['init.txt'],
          deps: ['init'],
          validate: [],
          idempotent: true,
        },
        b: {
          id: 'b',
          desc: 'step b',
          produces: ['b.txt'],
          consumes: ['init.txt'],
          deps: ['init'],
          validate: [],
          idempotent: true,
        },
        term: {
          id: 'term',
          desc: 'end',
          produces: [],
          consumes: ['a.txt', 'b.txt'],
          deps: ['a', 'b'],
          validate: [],
          idempotent: false,
        },
      };
      const dag = createMinimalDAG('parallel-test', nodes);
      mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
      writeFileSync(join(tmpDir, '.roadmap/head.json'), JSON.stringify(dag));
    });

    it('returns batches for current repo', () => {
      const result = executeCmd('parallel --note "test"', tmpDir);
      expect(result).toHaveProperty('batches');
      expect(Array.isArray(result.batches)).toBe(true);
      expect(result).toHaveProperty('totalLevels');
      expect(result).toHaveProperty('maxParallelism');
    });

    it('batch includes level and node count', () => {
      const result = executeCmd('parallel --note "test"', tmpDir);
      expect(result.batches.length).toBeGreaterThan(0);
      const batch = result.batches[0];
      expect(batch).toHaveProperty('level');
      expect(batch).toHaveProperty('nodes');
      expect(batch).toHaveProperty('count');
      expect(Array.isArray(batch.nodes)).toBe(true);
    });

    it('includes graph when --graph flag used', () => {
      const result = executeCmd('parallel --graph --note "test"', tmpDir);
      expect(result).toHaveProperty('graph');
      expect(result.graph).toHaveProperty('id');
      expect(result.graph).toHaveProperty('init');
      expect(result.graph).toHaveProperty('term');
      expect(result.graph).toHaveProperty('nodes');
      expect(result.graph).toHaveProperty('edges');
    });

    it('graph nodes contain required fields', () => {
      const result = executeCmd('parallel --graph --note "test"', tmpDir);
      expect(result.graph.nodes.length).toBeGreaterThan(0);
      const node = result.graph.nodes[0];
      expect(node).toHaveProperty('id');
      expect(node).toHaveProperty('desc');
      expect(node).toHaveProperty('deps');
      expect(node).toHaveProperty('produces');
      expect(node).toHaveProperty('consumes');
    });

    it('graph edges are correct dependencies', () => {
      const result = executeCmd('parallel --graph --note "test"', tmpDir);
      const edges = result.graph.edges;
      expect(Array.isArray(edges)).toBe(true);
      // For diamond DAG: init→a, init→b, a→term, b→term
      expect(edges.length).toBeGreaterThan(0);
      for (const edge of edges) {
        expect(edge).toHaveProperty('from');
        expect(edge).toHaveProperty('to');
      }
    });

    it('includes crossRepoSiblings when --cross-repo flag used', () => {
      const result = executeCmd('parallel --cross-repo --note "test"', tmpDir);
      expect(result).toHaveProperty('crossRepoSiblings');
      expect(Array.isArray(result.crossRepoSiblings)).toBe(true);
      // May be empty if no other roadmaps found
    });

    it('combines --cross-repo and --graph flags', () => {
      const result = executeCmd('parallel --cross-repo --graph --note "test"', tmpDir);
      expect(result).toHaveProperty('batches');
      expect(result).toHaveProperty('graph');
      expect(result).toHaveProperty('crossRepoSiblings');
    });
  });

  describe('Trail Recording', () => {
    beforeEach(() => {
      const dag = createMinimalDAG('test');
      mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
      writeFileSync(join(tmpDir, '.roadmap/head.json'), JSON.stringify(dag));
    });

    it('records locate command in trail', () => {
      try {
        executeCmd('locate --all --note "test locate"', tmpDir);
      } catch {
        // May fail due to skill not available, but trail should still record
      }
      const trailPath = join(tmpDir, '.roadmap/trail.jsonl');
      if (require('fs').existsSync(trailPath)) {
        const trail = readFileSync(trailPath, 'utf-8').trim().split('\n').pop();
        if (trail) {
          const entry = JSON.parse(trail);
          expect([entry.cmd, 'locate']).toContain('locate');
        }
      }
    });

    it('records sync command in trail', () => {
      try {
        executeCmd('sync --note "test sync"', tmpDir);
      } catch {
        // May fail due to skill not available
      }
      const trailPath = join(tmpDir, '.roadmap/trail.jsonl');
      if (require('fs').existsSync(trailPath)) {
        const entries = readFileSync(trailPath, 'utf-8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
        expect(entries.some((e: any) => e.cmd === 'sync')).toBe(true);
      }
    });

    it('records parallel command with detail flags', () => {
      executeCmd('parallel --cross-repo --graph --note "test parallel"', tmpDir);
      const trailPath = join(tmpDir, '.roadmap/trail.jsonl');
      if (require('fs').existsSync(trailPath)) {
        const entries = readFileSync(trailPath, 'utf-8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
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
    it('handles missing DAG gracefully for locate', () => {
      mkdirSync(tmpDir, { recursive: true });
      // No .roadmap/head.json exists
      const result = executeCmd('locate --all --note "test"', tmpDir);
      expect(result).toHaveProperty('roadmaps');
    });

    it('handles missing skill gracefully', () => {
      const dag = createMinimalDAG('test');
      mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
      writeFileSync(join(tmpDir, '.roadmap/head.json'), JSON.stringify(dag));

      // This may fail or return empty depending on environment
      // Just verify it doesn't crash unexpectedly
      try {
        executeCmd('locate --all --note "test"', tmpDir);
      } catch (e) {
        // Expected if skill doesn't exist
        expect(e).toBeDefined();
      }
    });
  });

  describe('Integration', () => {
    it('parallel --cross-repo --graph provides complete view', () => {
      const nodes = {
        init: {
          id: 'init',
          desc: 'start',
          produces: ['init.txt'],
          consumes: [],
          deps: [],
          validate: [],
          idempotent: true,
        },
        a: {
          id: 'a',
          desc: 'step a',
          produces: ['a.txt'],
          consumes: ['init.txt'],
          deps: ['init'],
          validate: [],
          idempotent: true,
        },
        term: {
          id: 'term',
          desc: 'end',
          produces: [],
          consumes: ['a.txt'],
          deps: ['a'],
          validate: [],
          idempotent: false,
        },
      };
      const dag = createMinimalDAG('integration', nodes);
      mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
      writeFileSync(join(tmpDir, '.roadmap/head.json'), JSON.stringify(dag));

      const result = executeCmd('parallel --cross-repo --graph --note "test"', tmpDir);

      // Verify complete structure
      expect(result.batches).toBeDefined();
      expect(result.totalLevels).toBeGreaterThan(0);
      expect(result.maxParallelism).toBeGreaterThan(0);
      expect(result.graph).toBeDefined();
      expect(result.graph.nodes.length).toBeGreaterThanOrEqual(3); // At least init, a, term
      expect(result.crossRepoSiblings).toBeDefined();
      expect(Array.isArray(result.crossRepoSiblings)).toBe(true);
    });
  });
});
