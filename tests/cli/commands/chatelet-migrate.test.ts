import { describe, it, expect } from 'vitest';
import { chateletMigrate } from '../../../src/cli/commands/chatelet-migrate';

describe('chateletMigrate', () => {
  it('returns migration plan with steps', async () => {
    const result = await chateletMigrate({ planOnly: true });
    expect(result).toHaveProperty('steps');
    expect(Array.isArray(result.steps)).toBe(true);
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('includes required step actions', async () => {
    const result = await chateletMigrate({ planOnly: true });
    const actions = result.steps.map(s => s.action);
    expect(actions).toContain('backup');
    expect(actions).toContain('init-packs');
  });

  it('includes timestamp and version', async () => {
    const result = await chateletMigrate();
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('version');
    expect(result.version).toMatch(/\d+\.\d+\.\d+/);
  });

  it('estimates duration', async () => {
    const result = await chateletMigrate();
    expect(result).toHaveProperty('estimatedDuration');
    expect(result.estimatedDuration).toBeGreaterThan(0);
  });
});
