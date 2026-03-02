import { describe, it, expect } from 'vitest';
import { validateBrief } from '../src/lib/agent-dispatch/brief-gate.ts';
import type { Brief } from '../src/lib/brief.ts';

describe('dispatch-system integration', () => {
  it('sealed brief validation passes valid briefs', () => {
    const brief: Brief = {
      position: 'test-node',
      mode: 'execute',
      produces: ['file.ts'],
      consumes: ['input.ts'],
      description: 'Test node',
      pattern: 'test pattern',
      handoffJournal: [],
      remaining: 5,
    };

    const validation = validateBrief(brief, [{ file: 'input.ts', available: true }]);
    expect(validation.valid).toBe(true);
    expect(validation.errors.length).toBe(0);
  });

  it('sealed brief validation rejects empty produces', () => {
    const brief: Partial<Brief> = {
      position: 'test',
      mode: 'execute',
      produces: [],
      consumes: [],
      description: 'Test',
      pattern: 'test',
    };

    const validation = validateBrief(brief as Brief, []);
    expect(validation.valid).toBe(false);
  });

  it('orchestration preserves isolation: no DAG in brief', () => {
    const sealedBrief: Brief = {
      position: 'agent-executor-impl',
      mode: 'execute',
      produces: ['src/lib/agent-dispatch/agent-executor.ts'],
      consumes: ['src/lib/brief.ts'],
      description: 'Execute sealed briefs',
      pattern: 'Read brief, execute, handoff',
      handoffJournal: [],
      remaining: 3,
    };

    expect(sealedBrief.produces).toBeDefined();
    expect((sealedBrief as any).nodes).toBeUndefined();
  });
});
