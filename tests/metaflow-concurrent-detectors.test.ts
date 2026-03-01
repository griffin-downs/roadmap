import { describe, it, expect } from 'vitest';
import { detectConcurrentFlowRaces, detectStateMutationOrder, detectDeadlocks } from '../src/lib/metaflow/audit/detectors/concurrent.ts';

describe('metaflow concurrent detectors', () => {
  it('detects race conditions', () => {
    const result = detectConcurrentFlowRaces();
    expect(result.code).toBe('MF-006');
    expect(result.passed).toBe(true);
  });

  it('validates state mutation order', () => {
    const result = detectStateMutationOrder();
    expect(result.code).toBe('ST-004');
    expect(result.passed).toBe(true);
  });

  it('detects deadlocks', () => {
    const result = detectDeadlocks();
    expect(result.code).toBe('ST-005');
    expect(result.passed).toBe(true);
  });
});
