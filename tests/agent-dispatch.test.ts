import { describe, it, expect } from 'vitest';
import { validateBrief } from '../src/lib/agent-dispatch/brief-gate.ts';
import type { Brief } from '../src/lib/brief.ts';

describe('agent-dispatch', () => {
  describe('validateBrief', () => {
    it('should reject brief with empty produces', () => {
      const brief: Partial<Brief> = {
        position: 'test',
        produces: [],
        consumes: [],
        description: 'Test',
        pattern: 'test pattern',
        mode: 'execute',
      };
      const validation = validateBrief(brief as Brief, []);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('produces cannot be empty');
    });

    it('should accept valid brief', () => {
      const brief: Partial<Brief> = {
        position: 'test',
        produces: ['file.ts'],
        consumes: [],
        description: 'Test node',
        pattern: 'implement and validate',
        mode: 'execute',
      };
      const validation = validateBrief(brief as Brief, []);
      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });

    it('should warn on missing validators', () => {
      const brief: Partial<Brief> = {
        position: 'test',
        produces: ['file.ts'],
        consumes: [],
        description: 'Test node',
        pattern: 'test',
        mode: 'execute',
      };
      const validation = validateBrief(brief as Brief, []);
      expect(validation.warnings).toBeDefined();
    });
  });
});
