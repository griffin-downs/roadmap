import { describe, it, expect } from 'vitest';
import { chateletStatus } from '../src/cli/commands/chatelet-status';

describe('chateletStatus', () => {
  it('returns keep audit results', async () => {
    const result = await chateletStatus('.');

    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('status');
    expect(['ready', 'degraded', 'error']).toContain(result.status);
    expect(result).toHaveProperty('components');
    expect(result.components).toHaveProperty('gitsafe');
    expect(result.components).toHaveProperty('keepbudget');
    expect(result.components).toHaveProperty('packs');
  });

  it('tracks budget metrics', async () => {
    const result = await chateletStatus('.');

    expect(result).toHaveProperty('fileCount');
    expect(result).toHaveProperty('maxFiles');
    expect(result).toHaveProperty('locCount');
    expect(result).toHaveProperty('maxLOC');
    expect(result).toHaveProperty('depCount');
    expect(result).toHaveProperty('maxDeps');
    expect(typeof result.fileCount).toBe('number');
    expect(typeof result.locCount).toBe('number');
    expect(typeof result.depCount).toBe('number');
  });

  it('reports violations when budgets exceeded', async () => {
    const result = await chateletStatus('.');

    expect(result).toHaveProperty('violations');
    expect(Array.isArray(result.violations)).toBe(true);
    expect(result).toHaveProperty('message');
  });
});
