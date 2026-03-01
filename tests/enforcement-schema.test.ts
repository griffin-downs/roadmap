import { describe, it, expect } from 'vitest';
import { isLegalTransition, createEnforcementContract } from '../src/lib/enforcement/schema.ts';

describe('enforcement schema', () => {
  it('validates legal state transitions', () => {
    expect(isLegalTransition('init', 'pending')).toBe(true);
    expect(isLegalTransition('pending', 'claimed')).toBe(true);
    expect(isLegalTransition('claimed', 'executing')).toBe(true);
    expect(isLegalTransition('executing', 'validated')).toBe(true);
    expect(isLegalTransition('validated', 'complete')).toBe(true);
  });

  it('rejects illegal state transitions', () => {
    expect(isLegalTransition('init', 'complete')).toBe(false);
    expect(isLegalTransition('complete', 'pending')).toBe(false);
    expect(isLegalTransition('pending', 'executing')).toBe(false);
  });

  it('allows retry from failed state', () => {
    expect(isLegalTransition('failed', 'pending')).toBe(true);
  });

  it('creates enforcement contract with defaults', () => {
    const contract = createEnforcementContract('test-node', {
      validate: [],
    });
    expect(contract.nodeId).toBe('test-node');
    expect(contract.precondition).toBe('pending');
    expect(contract.postcondition).toBe('complete');
    expect(contract.maxConcurrency).toBe(1);
    expect(contract.exclusivePerBatch).toBe(false);
  });
});
