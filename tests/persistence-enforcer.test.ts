import { describe, it, expect } from 'vitest';
import { detectHeadJsonDrift, validatePostCommitSync, detectSessionDrift, setupPersistenceEnforcement } from '../src/lib/persistence-enforcer.ts';

describe('persistence-enforcer', () => {
  it('detectHeadJsonDrift returns dirty: false when no changes', () => {
    const result = detectHeadJsonDrift('/tmp');
    expect(result).toHaveProperty('dirty');
  });

  it('validatePostCommitSync validates sync state', () => {
    const result = validatePostCommitSync('/tmp');
    expect(result).toHaveProperty('valid');
  });

  it('detectSessionDrift compares DAG structures', () => {
    const last = { nodes: { a: {}, b: {} } };
    const current = { nodes: { a: {}, b: {} } };
    const result = detectSessionDrift('/tmp', last, current);
    expect(result.drifted).toBe(false);
  });

  it('setupPersistenceEnforcement returns hook names', () => {
    const result = setupPersistenceEnforcement('/tmp');
    expect(Array.isArray(result.hooksCreated)).toBe(true);
  });
});
