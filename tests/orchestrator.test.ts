import { describe, it, expect } from 'vitest';
import type { OrchestratorOptions, OrchestratorResult } from '../src/lib/agent-dispatch/orchestrator.ts';

describe('orchestrator', () => {
  it('exports OrchestratorOptions and OrchestratorResult types', () => {
    // Type-level test: ensure types are importable
    const opts: Partial<OrchestratorOptions> = {
      level: 0,
      agents: ['w1'],
      parallel: false,
    };
    expect(opts.level).toBe(0);
    expect(opts.agents).toEqual(['w1']);
  });

  it('OrchestratorResult shape', () => {
    const result: Partial<OrchestratorResult> = {
      batchLevel: 1,
      allPassed: true,
      failedNodes: [],
    };
    expect(result.allPassed).toBe(true);
    expect(result.failedNodes).toEqual([]);
  });
});
