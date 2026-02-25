import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

const run = (cmd: string) =>
  execSync(`node --experimental-strip-types bin/roadmap.ts ${cmd}`, {
    cwd: process.cwd(),
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

const json = (cmd: string) => JSON.parse(run(cmd));

describe('bin/roadmap CLI', () => {
  describe('orient', () => {
    it('returns JSON with position + produces', () => {
      const result = json('orient');
      expect(result).toHaveProperty('position');
      expect(result).toHaveProperty('produces');
      expect(result).toHaveProperty('consumes');
      expect(result).toHaveProperty('done');
      expect(result).toHaveProperty('remaining');
      expect(result).toHaveProperty('complete');
      expect(typeof result.position).toBe('string');
      expect(typeof result.done).toBe('number');
    });
  });

  describe('describe', () => {
    it('returns full API surface', () => {
      const result = json('describe');
      expect(result.id).toBe('roadmap-adversarial');
      expect(result.nodes).toBeGreaterThan(90);
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
      const result = json('describe');
      expect(result.exports['src/protocol.ts']).toContain('define');
      expect(result.exports['src/protocol.ts']).toContain('orient');
      expect(result.exports['src/protocol.ts']).toContain('parallelOrder');
      expect(result.exports['src/predicates.ts']).toContain('fileExists');
      expect(result.exports['src/errors.ts']).toContain('RoadmapError');
    });
  });

  describe('parallel', () => {
    it('returns batched execution groups', () => {
      const result = json('parallel');
      expect(result.batches).toBeInstanceOf(Array);
      expect(result.batches.length).toBeGreaterThan(0);
      expect(result.totalLevels).toBeGreaterThan(0);
      expect(result.maxParallelism).toBeGreaterThanOrEqual(1);

      // First batch should be [init]
      expect(result.batches[0].nodes).toContain('init');
    });
  });

  describe('validate', () => {
    it('validates single node', () => {
      const result = json('validate init');
      expect(result).toHaveProperty('nodeId', 'init');
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('checks');
    });

    it('validates all nodes (summary)', { timeout: 60000 }, () => {
      const result = json('validate');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('failed');
      expect(result.total).toBeGreaterThan(90);
    });
  });

  describe('help', () => {
    it('outputs help text', () => {
      const output = run('help');
      expect(output).toContain('orient');
      expect(output).toContain('describe');
      expect(output).toContain('validate');
      expect(output).toContain('expand');
      expect(output).toContain('branch');
    });
  });

  describe('error handling', () => {
    it('returns JSON error for unknown command', () => {
      try {
        run('nonexistent-command');
        expect.unreachable('Should have thrown');
      } catch (e: any) {
        const stderr = e.stdout || '';
        expect(stderr).toContain('Unknown command');
      }
    });
  });
});
