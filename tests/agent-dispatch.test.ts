import { describe, it, expect } from 'vitest';
import { validateBrief } from '../src/lib/agent-dispatch/brief-gate.ts';
import { writeInterimHandoff, writeFinalHandoff, loadHandoffChain, loadFinal } from '../src/lib/agent-dispatch/handoff-journal.ts';
import type { Brief, InterimHandoff, FinalHandoff } from '../src/lib/brief.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

  describe('handoff-journal', () => {
    let tmpRoot: string;

    it('should write and load interim handoffs in sequence', async () => {
      tmpRoot = await mkdtemp(join(tmpdir(), 'hj-'));
      const entry: InterimHandoff = {
        timestamp: new Date().toISOString(),
        progress: 0.5,
        discovered: ['found thing'],
        blockers: [],
        currentFile: 'a.ts',
      };

      const seq0 = await writeInterimHandoff(tmpRoot, 'node-a', entry);
      expect(seq0).toBe(0);

      const seq1 = await writeInterimHandoff(tmpRoot, 'node-a', { ...entry, progress: 0.8 });
      expect(seq1).toBe(1);

      const chain = await loadHandoffChain(tmpRoot, 'node-a');
      expect(chain).toHaveLength(2);
      expect(chain[0].progress).toBe(0.5);
      expect(chain[1].progress).toBe(0.8);

      await rm(tmpRoot, { recursive: true });
    });

    it('should write and load final handoff', async () => {
      tmpRoot = await mkdtemp(join(tmpdir(), 'hj-'));
      const final: FinalHandoff = {
        timestamp: new Date().toISOString(),
        progress: 1.0,
        discovered: ['done'],
        blockers: [],
        currentFile: '',
        summary: 'built it',
        keyDecisions: ['chose X'],
        gotchas: [],
        nextNodeEntry: { consumes: ['a.ts'], ready: true },
      };

      await writeFinalHandoff(tmpRoot, 'node-b', final);
      const loaded = await loadFinal(tmpRoot, 'node-b');
      expect(loaded).toBeDefined();
      expect(loaded!.summary).toBe('built it');

      const chain = await loadHandoffChain(tmpRoot, 'node-b');
      expect(chain).toHaveLength(1);
      expect((chain[0] as FinalHandoff).summary).toBe('built it');

      await rm(tmpRoot, { recursive: true });
    });

    it('should return empty chain for nonexistent node', async () => {
      tmpRoot = await mkdtemp(join(tmpdir(), 'hj-'));
      const chain = await loadHandoffChain(tmpRoot, 'nope');
      expect(chain).toHaveLength(0);
      await rm(tmpRoot, { recursive: true });
    });
  });

  describe('orchestrator', () => {
    it('should export runOrchestrator', async () => {
      const mod = await import('../src/lib/agent-dispatch/orchestrator.ts');
      expect(typeof mod.runOrchestrator).toBe('function');
    });
  });
});
