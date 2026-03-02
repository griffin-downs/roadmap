import { describe, it, expect } from 'vitest';
import { chateletStatus } from '../../../src/cli/commands/chatelet-status';

describe('chateletStatus', () => {
  it('returns audit result with status field', async () => {
    const result = await chateletStatus();
    expect(result).toHaveProperty('status');
    expect(['ready', 'degraded', 'error']).toContain(result.status);
  });

  it('includes component status', async () => {
    const result = await chateletStatus();
    expect(result).toHaveProperty('components');
    expect(result.components).toHaveProperty('gitsafe');
    expect(result.components).toHaveProperty('keepbudget');
    expect(result.components).toHaveProperty('packs');
  });

  it('includes audit metrics', async () => {
    const result = await chateletStatus();
    expect(result).toHaveProperty('fileCount');
    expect(result).toHaveProperty('locCount');
    expect(result).toHaveProperty('depCount');
  });
});
