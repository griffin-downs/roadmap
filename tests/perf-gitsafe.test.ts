// @module gitsafe-perf-tests
// @purpose Performance benchmarks for gitsafe (P50 < 100ms target, S1)

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  listRefs,
  readBlob,
  readJson,
  lsTree,
  diffPaths,
  GitSafeConfig,
} from '../src/lib/gitsafe/index.js';

interface LatencyStats {
  samples: number[];
  p50: number;
  p95: number;
  max: number;
}

function computeStats(samples: number[]): LatencyStats {
  const sorted = [...samples].sort((a, b) => a - b);
  const p50idx = Math.floor(sorted.length * 0.5);
  const p95idx = Math.floor(sorted.length * 0.95);
  return {
    samples,
    p50: sorted[p50idx],
    p95: sorted[p95idx],
    max: sorted[sorted.length - 1],
  };
}

async function measureLatency(
  fn: () => Promise<any>,
  iterations: number
): Promise<LatencyStats> {
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const duration = performance.now() - start;
    samples.push(duration);
  }
  return computeStats(samples);
}

describe('GitSafe Performance (S1)', () => {
  let testRepo: string;
  let config: GitSafeConfig;
  const ITERATIONS = 20; // Multiple runs to get meaningful percentiles

  beforeAll(() => {
    // Create temporary test repo
    testRepo = mkdtempSync(join(process.cwd(), 'perf-test-'));

    // Initialize git repo
    execSync('git init', { cwd: testRepo, stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', {
      cwd: testRepo,
      stdio: 'pipe',
    });
    execSync('git config user.name "Test User"', {
      cwd: testRepo,
      stdio: 'pipe',
    });

    // Create ~10k files in multiple directories to simulate real repo structure
    const dirs = ['src', 'lib', 'tests', 'docs', 'config', 'assets', 'data'];
    const filesPerDir = 1500; // ~10.5k files total

    for (const dir of dirs) {
      const dirPath = join(testRepo, dir);
      mkdirSync(dirPath, { recursive: true });

      for (let i = 0; i < filesPerDir; i++) {
        const filename = `file-${String(i).padStart(5, '0')}.txt`;
        const content = `File ${i} content\n`.repeat(10); // Small but measurable size
        writeFileSync(join(dirPath, filename), content);
      }
    }

    // Create config file for readJson test
    const configContent = {
      version: '1.0',
      debug: false,
      maxRetries: 3,
    };
    writeFileSync(
      join(testRepo, 'config.json'),
      JSON.stringify(configContent)
    );

    // Add all files and commit
    execSync('git add .', { cwd: testRepo, stdio: 'pipe' });
    execSync('git commit -m "Initial commit with 10k files"', {
      cwd: testRepo,
      stdio: 'pipe',
    });

    // Create a second commit for diff testing
    const newFile = join(testRepo, 'src', 'new-file.txt');
    writeFileSync(newFile, 'New file for diff test');
    execSync('git add .', { cwd: testRepo, stdio: 'pipe' });
    execSync('git commit -m "Add new file for diff"', {
      cwd: testRepo,
      stdio: 'pipe',
    });

    // Setup GitSafe config
    config = {
      denylist: ['\\.env$', '\\.ssh/', 'credentials/', '\\.git/'],
      maxBytes: 10 * 1024 * 1024, // 10MB
      maxDepth: 20,
    };
  });

  afterAll(() => {
    // Cleanup
    if (testRepo) {
      rmSync(testRepo, { recursive: true, force: true });
    }
  });

  describe('listRefs performance', () => {
    it('should complete with P50 < 100ms', async () => {
      const stats = await measureLatency(
        () => listRefs(testRepo, config),
        ITERATIONS
      );

      console.log('listRefs latency:', {
        p50: stats.p50.toFixed(2) + 'ms',
        p95: stats.p95.toFixed(2) + 'ms',
        max: stats.max.toFixed(2) + 'ms',
        iterations: stats.samples.length,
      });

      expect(stats.p50).toBeLessThan(100);
      expect(stats.p95).toBeLessThan(200);
    });
  });

  describe('readBlob performance', () => {
    it('should complete with P50 < 100ms', async () => {
      const stats = await measureLatency(
        () => readBlob(testRepo, 'HEAD', 'config.json', config),
        ITERATIONS
      );

      console.log('readBlob latency:', {
        p50: stats.p50.toFixed(2) + 'ms',
        p95: stats.p95.toFixed(2) + 'ms',
        max: stats.max.toFixed(2) + 'ms',
        iterations: stats.samples.length,
      });

      expect(stats.p50).toBeLessThan(100);
      expect(stats.p95).toBeLessThan(200);
    });
  });

  describe('readJson performance', () => {
    it('should complete with P50 < 100ms', async () => {
      const stats = await measureLatency(
        () => readJson(testRepo, 'HEAD', 'config.json', config),
        ITERATIONS
      );

      console.log('readJson latency:', {
        p50: stats.p50.toFixed(2) + 'ms',
        p95: stats.p95.toFixed(2) + 'ms',
        max: stats.max.toFixed(2) + 'ms',
        iterations: stats.samples.length,
      });

      expect(stats.p50).toBeLessThan(100);
      expect(stats.p95).toBeLessThan(200);
    });
  });

  describe('lsTree performance', () => {
    it('should complete with P50 < 100ms on 10k file repo', async () => {
      const stats = await measureLatency(
        () => lsTree(testRepo, 'HEAD', config),
        ITERATIONS
      );

      console.log('lsTree latency:', {
        p50: stats.p50.toFixed(2) + 'ms',
        p95: stats.p95.toFixed(2) + 'ms',
        max: stats.max.toFixed(2) + 'ms',
        iterations: stats.samples.length,
      });

      expect(stats.p50).toBeLessThan(100);
      expect(stats.p95).toBeLessThan(200);
    });
  });

  describe('diffPaths performance', () => {
    it('should complete with P50 < 100ms', async () => {
      const stats = await measureLatency(
        () => diffPaths(testRepo, 'HEAD~1', 'HEAD', config),
        ITERATIONS
      );

      console.log('diffPaths latency:', {
        p50: stats.p50.toFixed(2) + 'ms',
        p95: stats.p95.toFixed(2) + 'ms',
        max: stats.max.toFixed(2) + 'ms',
        iterations: stats.samples.length,
      });

      expect(stats.p50).toBeLessThan(100);
      expect(stats.p95).toBeLessThan(200);
    });
  });

  describe('Integration: combined operations', () => {
    it('should handle sequential operations within budget', async () => {
      const start = performance.now();

      // Simulate realistic workflow
      const refs = await listRefs(testRepo, config);
      expect(refs.length).toBeGreaterThan(0);

      const tree = await lsTree(testRepo, refs[0], config);
      expect(tree.length).toBeGreaterThan(0);

      const data = await readJson(testRepo, refs[0], 'config.json', config);
      expect(data).toHaveProperty('version');

      const duration = performance.now() - start;
      console.log('Combined operations latency:', duration.toFixed(2) + 'ms');

      // Combined should stay under reasonable bounds (5x single operation)
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Latency Report', () => {
    it('should generate performance report', async () => {
      const report: Record<string, LatencyStats> = {};

      report['listRefs'] = await measureLatency(
        () => listRefs(testRepo, config),
        ITERATIONS
      );
      report['readBlob'] = await measureLatency(
        () => readBlob(testRepo, 'HEAD', 'config.json', config),
        ITERATIONS
      );
      report['readJson'] = await measureLatency(
        () => readJson(testRepo, 'HEAD', 'config.json', config),
        ITERATIONS
      );
      report['lsTree'] = await measureLatency(
        () => lsTree(testRepo, 'HEAD', config),
        ITERATIONS
      );
      report['diffPaths'] = await measureLatency(
        () => diffPaths(testRepo, 'HEAD~1', 'HEAD', config),
        ITERATIONS
      );

      console.log('\n=== GitSafe Performance Report (S1) ===');
      console.log(`Test repo: ${testRepo}`);
      console.log(`Files created: ~10,500`);
      console.log(`Iterations per operation: ${ITERATIONS}`);
      console.log(`Target: P50 < 100ms\n`);

      let allPass = true;
      for (const [op, stats] of Object.entries(report)) {
        const pass = stats.p50 < 100 ? '✓' : '✗';
        console.log(`${pass} ${op}`);
        console.log(`  P50: ${stats.p50.toFixed(2)}ms`);
        console.log(`  P95: ${stats.p95.toFixed(2)}ms`);
        console.log(`  MAX: ${stats.max.toFixed(2)}ms`);

        if (stats.p50 >= 100) {
          allPass = false;
        }
      }

      console.log('\n=== Result ===');
      console.log(allPass ? 'All operations meet S1 criteria' : 'Some operations exceed S1 threshold');

      expect(allPass).toBe(true);
    });
  });
});
