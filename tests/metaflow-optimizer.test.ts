import { describe, it, expect } from 'vitest';
import { checkTargets, readTargets, writeTargets, type MetricsSnapshot } from '../src/lib/metaflow/optimizer/targets.ts';
import { buildOptimizerFlow, buildAllOptimizerFlows } from '../src/lib/metaflow/optimizer/flow-builder.ts';
import { measureIteration } from '../src/lib/metaflow/optimizer/measure.ts';

describe('metaflow-optimizer', () => {
  describe('targets', () => {
    it('checkTargets detects when targets are met', () => {
      const metrics: MetricsSnapshot = {
        timestamp: new Date().toISOString(),
        iterN: 1,
        tokensPerCommand: 1100,
        latencyP95: 700,
        latencyP50: 500,
        latencyP50ReducedFrom: 850,
        cacheHitRate: 0.8,
        commandsAnalyzed: 1300,
        failureModesDetected: 60,
        coherenceScore: 0.96,
        recoverySuccessRate: 0.96,
        performanceRegressions: 0,
      };

      const result = checkTargets(metrics);
      expect(result.met).toBe(true);
      expect(result.gaps).toHaveLength(0);
    });

    it('checkTargets detects when targets are not met', () => {
      const metrics: MetricsSnapshot = {
        timestamp: new Date().toISOString(),
        iterN: 0,
        tokensPerCommand: 2000,
        latencyP95: 1200,
        latencyP50: 700,
        cacheHitRate: 0.5,
        commandsAnalyzed: 100,
        failureModesDetected: 20,
        coherenceScore: 0.85,
        recoverySuccessRate: 0.8,
        performanceRegressions: 2,
      };

      const result = checkTargets(metrics);
      expect(result.met).toBe(false);
      expect(result.gaps.length).toBeGreaterThan(0);
    });

    it('checkTargets correctly identifies specific gaps', () => {
      const metrics: MetricsSnapshot = {
        timestamp: new Date().toISOString(),
        iterN: 0,
        tokensPerCommand: 1500,
        latencyP95: 900,
        latencyP50: 700,
        cacheHitRate: 0.7,
        commandsAnalyzed: 1200,
        failureModesDetected: 50,
        coherenceScore: 0.95,
        recoverySuccessRate: 0.95,
        performanceRegressions: 0,
      };

      const result = checkTargets(metrics);
      expect(result.met).toBe(false);

      // Should identify latencyP95 and tokenCount gaps
      const latencyGap = result.gaps.find(g => g.name === 'latency_p95');
      const tokenGap = result.gaps.find(g => g.name === 'tokens_per_command');

      expect(latencyGap).toBeDefined();
      expect(tokenGap).toBeDefined();
    });
  });

  describe('flow-builder', () => {
    it('buildOptimizerFlow generates correct flow schema', () => {
      const flow = buildOptimizerFlow(1);

      expect(flow.schemaVersion).toBe(1);
      expect(flow.id).toBe('optimizer-iter-1');
      expect(flow.stageMin).toBe(1);
      expect(flow.stageMax).toBe(5);
      expect(flow.requiresAuthority).toBe(false);
      expect(flow.steps).toHaveLength(5);
    });

    it('buildOptimizerFlow steps reference correct handlers', () => {
      const flow = buildOptimizerFlow(1);
      const cmds = flow.steps.map(s => s.cmd);

      expect(cmds).toContain('roadmap internal optimizer-mine');
      expect(cmds).toContain('roadmap internal optimizer-audit');
      expect(cmds).toContain('roadmap internal optimizer-propose');
      expect(cmds).toContain('roadmap internal optimizer-implement');
      expect(cmds).toContain('roadmap internal optimizer-measure');
    });

    it('buildAllOptimizerFlows generates 8 flows', () => {
      const flows = buildAllOptimizerFlows();

      expect(flows).toHaveLength(8);
      expect(flows.map(f => f.id)).toEqual([
        'optimizer-iter-1',
        'optimizer-iter-2',
        'optimizer-iter-3',
        'optimizer-iter-4',
        'optimizer-iter-5',
        'optimizer-iter-6',
        'optimizer-iter-7',
        'optimizer-iter-8',
      ]);
    });

    it('flow steps have artifact-exists validators only', () => {
      const flow = buildOptimizerFlow(1);

      for (const step of flow.steps) {
        expect(step.validate).toHaveLength(1);
        expect(step.validate[0].type).toBe('artifact-exists');
        expect(step.validate[0].target).toBeDefined();
      }
    });
  });

  describe('measure', () => {
    it('measureIteration without data returns defaults', async () => {
      const metrics = await measureIteration(1, '/tmp/nonexistent');

      // Should have all required fields
      expect(metrics.iterN).toBe(1);
      expect(metrics.timestamp).toBeDefined();
      expect(typeof metrics.tokensPerCommand).toBe('number');
      expect(typeof metrics.latencyP95).toBe('number');
      expect(typeof metrics.cacheHitRate).toBe('number');
      expect(typeof metrics.commandsAnalyzed).toBe('number');
    });

    it('measureIteration has sane defaults', async () => {
      const metrics = await measureIteration(1, '/tmp/nonexistent');

      // Should not be ramps (linear progressions)
      // If baselineish, all iterations should have similar values
      expect(metrics.cacheHitRate).toBeGreaterThanOrEqual(0.5);
      expect(metrics.cacheHitRate).toBeLessThanOrEqual(0.95);
      expect(metrics.commandsAnalyzed).toBeGreaterThan(0);
      expect(metrics.coherenceScore).toBeGreaterThanOrEqual(0.5);
      expect(metrics.recoverySuccessRate).toBeGreaterThanOrEqual(0.5);
    });
  });
});
