import { describe, it, expect } from 'vitest';
import { chateletMigrate } from '../src/cli/commands/chatelet-migrate';

describe('chateletMigrate', () => {
  it('returns migration plan with steps', async () => {
    const result = await chateletMigrate({ planOnly: true });

    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('version');
    expect(result).toHaveProperty('steps');
    expect(Array.isArray(result.steps)).toBe(true);
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('includes required migration actions', async () => {
    const result = await chateletMigrate({ planOnly: true });

    const actions = result.steps.map(s => s.action);
    expect(actions).toContain('backup');
    expect(actions).toContain('init-packs');
    expect(actions).toContain('register-tools');
  });

  it('marks steps with optional flag', async () => {
    const result = await chateletMigrate({ planOnly: true });

    result.steps.forEach(step => {
      expect(step).toHaveProperty('optional');
      expect(typeof step.optional).toBe('boolean');
      expect(step).toHaveProperty('target');
    });
  });

  it('provides estimated duration', async () => {
    const result = await chateletMigrate({ planOnly: true });

    expect(result).toHaveProperty('estimatedDuration');
    expect(typeof result.estimatedDuration).toBe('number');
    expect(result.estimatedDuration).toBeGreaterThan(0);
  });
});
