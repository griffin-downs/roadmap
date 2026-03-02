import { describe, it, expect } from 'vitest';
import { registerPreAgentMetricsHook, registerPostAgentMetricsHook, parseMetricsFile, analyzeMetrics } from '../src/hooks/agent-metrics-hooks.ts';

describe('agent-metrics-hooks', () => {
  it('registerPreAgentMetricsHook creates hook function', () => {
    const hook = registerPreAgentMetricsHook('/tmp/metrics.jsonl');
    expect(typeof hook).toBe('function');
  });

  it('registerPostAgentMetricsHook creates hook function', () => {
    const hook = registerPostAgentMetricsHook('/tmp/metrics.jsonl');
    expect(typeof hook).toBe('function');
  });

  it('parseMetricsFile handles empty file', () => {
    const result = parseMetricsFile('/nonexistent');
    expect(result.pre).toEqual([]);
    expect(result.post).toEqual([]);
  });

  it('analyzeMetrics returns error for empty metrics', () => {
    const result = analyzeMetrics('/nonexistent');
    expect(result).toHaveProperty('error');
  });
});
