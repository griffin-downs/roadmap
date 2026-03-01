import { describe, it, expect } from 'vitest';
import { checkTargets, readTargets, writeTargets, type MetricsSnapshot } from '../src/lib/metaflow/optimizer/targets.ts';

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
});
