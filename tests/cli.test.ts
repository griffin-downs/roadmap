import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { roadmapCli, roadmapCliJson } from './cli-helper.ts';

const N = '--note "test"';

const run = (cmd: string) => roadmapCli(cmd);
const json = (cmd: string) => roadmapCliJson(cmd);

const trailPath = join(process.cwd(), '.roadmap', 'trail.jsonl');

// Clear trail before test run so we get deterministic counts
beforeAll(() => {
  if (existsSync(trailPath)) unlinkSync(trailPath);
});

describe('bin/roadmap CLI', () => {
  describe('--note gate', () => {
    it('rejects commands without --note', () => {
      try {
        run('orient');
        expect.unreachable('Should have thrown');
      } catch (e: any) {
        expect(e.stdout).toContain('Missing --note');
      }
    });

    it('help does not require --note', () => {
      const output = run('help');
      expect(output).toContain('orient');
    });

    it('trail does not require --note', () => {
      const result = json('trail');
      expect(result).toHaveProperty('count');
    });
  });

  describe('orient', () => {
    it('returns JSON with position + produces', () => {
      const result = json(`orient ${N}`);
      expect(result).toHaveProperty('position');
      expect(result).toHaveProperty('produces');
      expect(result).toHaveProperty('consumes');
      expect(result).toHaveProperty('done');
      expect(result).toHaveProperty('remaining');
      expect(result).toHaveProperty('complete');
      expect(Array.isArray(result.position)).toBe(true);
      expect(typeof result.done).toBe('number');
    });
  });

  describe('describe', () => {
    it('returns full API surface', () => {
      const result = json(`describe ${N}`);
      expect(typeof result.id).toBe('string');
      expect(result.id.length).toBeGreaterThan(0);
      expect(result.nodes).toBeGreaterThan(0);
      expect(result.entryPoints).toHaveProperty('roadmap');
      expect(result.entryPoints).toHaveProperty('roadmap/protocol');
      expect(result.entryPoints).toHaveProperty('roadmap/agent');
      expect(result.entryPoints).toHaveProperty('roadmap/recovery');
      expect(result.entryPoints).toHaveProperty('roadmap/validation');
      expect(result.entryPoints).toHaveProperty('roadmap/versioning');
      expect(result.types).toContain('Graph<T>');
      expect(result.types).toContain('RoadmapError');
    });

    it('includes @exports from file headers', () => {
      const result = json(`describe ${N}`);
      expect(result.exports['src/protocol.ts']).toContain('define');
      expect(result.exports['src/protocol.ts']).toContain('orient');
      expect(result.exports['src/protocol.ts']).toContain('parallelOrder');
      expect(result.exports['src/predicates.ts']).toContain('fileExists');
      expect(result.exports['src/errors.ts']).toContain('RoadmapError');
    });
  });

  describe('parallel', () => {
    it('returns batched execution groups', () => {
      const result = json(`parallel ${N}`);
      expect(result.batches).toBeInstanceOf(Array);
      expect(result.batches.length).toBeGreaterThan(0);
      expect(result.totalLevels).toBeGreaterThan(0);
      expect(result.maxParallelism).toBeGreaterThanOrEqual(1);
      expect(result.batches[0].nodes).toContain('init');
    });
  });

  describe('validate', () => {
    it('validates single node', () => {
      const result = json(`validate init ${N}`);
      expect(result).toHaveProperty('nodeId', 'init');
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('checks');
    });

    // Skipped: runs full tsc + vitest as term node validators (~66s).
    // Use `roadmap validate --note "..."` directly for full validation.
    it.skip('validates all nodes (summary)', { timeout: 60000 }, () => {
      const result = json(`validate ${N}`);
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('failed');
      expect(result.total).toBeGreaterThan(90);
    });
  });

  describe('trail', () => {
    it('records invocations to trail.jsonl', () => {
      const result = json('trail');
      // orient + describe + describe + parallel + validate + validate = 6 entries from tests above
      // (trail is cleared by beforeAll, so we expect entries from tests that ran)
      expect(result.count).toBeGreaterThanOrEqual(5);
      expect(result.entries[0]).toHaveProperty('ts');
      expect(result.entries[0]).toHaveProperty('cmd');
      expect(result.entries[0]).toHaveProperty('note');
    });

    it('orient entries include position', () => {
      const result = json('trail');
      const orients = result.entries.filter((e: any) => e.cmd === 'orient');
      expect(orients.length).toBeGreaterThanOrEqual(1);
      expect(orients[0]).toHaveProperty('position');
      expect(orients[0]).toHaveProperty('dagId');
    });

    it('supports --last N', () => {
      const result = json('trail --last 2');
      expect(result.entries.length).toBeLessThanOrEqual(2);
      expect(result.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('help', () => {
    it('outputs help text with --note docs', () => {
      const output = run('help');
      expect(output).toContain('--note');
      expect(output).toContain('trail');
      expect(output).toContain('orient');
      expect(output).toContain('expand');
    });
  });

  describe('error handling', () => {
    it('returns JSON error for unknown command', () => {
      try {
        run(`nonexistent-command ${N}`);
        expect.unreachable('Should have thrown');
      } catch (e: any) {
        expect(e.stdout).toContain('Unknown command');
      }
    });
  });
});
