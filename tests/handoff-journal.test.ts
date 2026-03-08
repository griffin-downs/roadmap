// Unit tests for handoff-journal.ts — filesystem IO, uses tmp dirs.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  HandoffJournal,
  writeInterimHandoff,
  writeFinalHandoff,
  loadJournal,
  loadFinal,
  saveInterim,
  saveFinal,
  journalDir,
  type HandoffChain,
} from '../src/lib/agent-dispatch/handoff-journal.ts';
import type { InterimHandoff, FinalHandoff } from '../src/lib/brief.ts';

// --- Factories ---

function validInterim(overrides: Partial<InterimHandoff> = {}): InterimHandoff {
  return {
    timestamp: '2026-03-08T12:00:00.000Z',
    progress: 0.5,
    discovered: ['found edge case'],
    blockers: [],
    currentFile: 'src/auth.ts',
    ...overrides,
  };
}

function validFinal(overrides: Partial<FinalHandoff> = {}): FinalHandoff {
  return {
    timestamp: '2026-03-08T14:00:00.000Z',
    progress: 1.0,
    discovered: ['edge case resolved'],
    blockers: [],
    currentFile: 'src/auth.ts',
    summary: 'Built auth module',
    keyDecisions: ['JWT over session'],
    gotchas: ['token refresh race'],
    nextNodeEntry: {
      consumes: ['src/auth.ts'],
      ready: true,
    },
    ...overrides,
  };
}

// --- Test suite ---

describe('HandoffJournal', () => {
  let tmpRoot: string;
  let journal: HandoffJournal;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'handoff-journal-test-'));
    journal = new HandoffJournal(tmpRoot);
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  // === journalDir ===

  describe('journalDir', () => {
    it('returns .roadmap/.handoff under repoRoot', () => {
      const dir = journalDir('/some/repo');
      expect(dir).toBe('/some/repo/.roadmap/.handoff');
    });
  });

  // === writeInterim + loadInterims roundtrip ===

  describe('writeInterim + loadInterims', () => {
    it('roundtrips a single interim checkpoint', async () => {
      const interim = validInterim();
      await journal.writeInterim('node-a', interim);

      const loaded = journal.loadInterims('node-a');
      expect(loaded).toHaveLength(1);
      expect(loaded[0].progress).toBe(0.5);
      expect(loaded[0].currentFile).toBe('src/auth.ts');
      expect(loaded[0].discovered).toEqual(['found edge case']);
    });

    it('writes multiple interims in chronological order', async () => {
      const t1 = validInterim({ timestamp: '2026-03-08T10:00:00.000Z', progress: 0.2 });
      const t2 = validInterim({ timestamp: '2026-03-08T11:00:00.000Z', progress: 0.5 });
      const t3 = validInterim({ timestamp: '2026-03-08T12:00:00.000Z', progress: 0.8 });

      await journal.writeInterim('node-a', t1);
      await journal.writeInterim('node-a', t2);
      await journal.writeInterim('node-a', t3);

      const loaded = journal.loadInterims('node-a');
      expect(loaded).toHaveLength(3);
      // Chronological by filename sort
      expect(loaded[0].progress).toBe(0.2);
      expect(loaded[1].progress).toBe(0.5);
      expect(loaded[2].progress).toBe(0.8);
    });

    it('auto-fills timestamp when missing', async () => {
      const interim = validInterim({ timestamp: '' });
      // Empty string is falsy, so writeInterim should fill it
      await journal.writeInterim('node-a', interim);

      const loaded = journal.loadInterims('node-a');
      expect(loaded).toHaveLength(1);
      expect(loaded[0].timestamp).toBeTruthy();
      expect(loaded[0].timestamp.length).toBeGreaterThan(0);
    });

    it('rejects progress below 0', async () => {
      const interim = validInterim({ progress: -0.1 });
      await expect(journal.writeInterim('node-a', interim)).rejects.toThrow('Invalid progress');
    });

    it('rejects progress above 1', async () => {
      const interim = validInterim({ progress: 1.5 });
      await expect(journal.writeInterim('node-a', interim)).rejects.toThrow('Invalid progress');
    });

    it('accepts progress at boundary values 0 and 1', async () => {
      await journal.writeInterim('node-a', validInterim({ timestamp: '2026-03-08T10:00:00.000Z', progress: 0 }));
      await journal.writeInterim('node-a', validInterim({ timestamp: '2026-03-08T11:00:00.000Z', progress: 1 }));

      const loaded = journal.loadInterims('node-a');
      expect(loaded).toHaveLength(2);
      expect(loaded[0].progress).toBe(0);
      expect(loaded[1].progress).toBe(1);
    });
  });

  // === writeFinal + loadFinal roundtrip ===

  describe('writeFinal + loadFinal', () => {
    it('roundtrips a final handoff', async () => {
      const final = validFinal();
      await journal.writeFinal('node-a', final);

      const loaded = journal.loadFinal('node-a');
      expect(loaded).not.toBeNull();
      expect(loaded!.summary).toBe('Built auth module');
      expect(loaded!.keyDecisions).toEqual(['JWT over session']);
      expect(loaded!.nextNodeEntry.ready).toBe(true);
    });

    it('auto-fills timestamp when missing', async () => {
      const final = validFinal({ timestamp: '' });
      await journal.writeFinal('node-a', final);

      const loaded = journal.loadFinal('node-a');
      expect(loaded).not.toBeNull();
      expect(loaded!.timestamp).toBeTruthy();
    });

    it('rejects summary exceeding 100 chars', async () => {
      const final = validFinal({ summary: 'x'.repeat(101) });
      await expect(journal.writeFinal('node-a', final)).rejects.toThrow('Summary too long');
    });

    it('accepts summary at exactly 100 chars', async () => {
      const final = validFinal({ summary: 'x'.repeat(100) });
      await journal.writeFinal('node-a', final);

      const loaded = journal.loadFinal('node-a');
      expect(loaded).not.toBeNull();
      expect(loaded!.summary).toHaveLength(100);
    });

    it('overwrites previous final for same nodeId', async () => {
      await journal.writeFinal('node-a', validFinal({ summary: 'First' }));
      await journal.writeFinal('node-a', validFinal({ summary: 'Second' }));

      const loaded = journal.loadFinal('node-a');
      expect(loaded!.summary).toBe('Second');
    });
  });

  // === loadInterims / loadFinal — missing data ===

  describe('missing data returns null/empty', () => {
    it('loadInterims returns empty array when no handoff dir exists', () => {
      const loaded = journal.loadInterims('nonexistent-node');
      expect(loaded).toEqual([]);
    });

    it('loadFinal returns null when no final file exists', () => {
      const loaded = journal.loadFinal('nonexistent-node');
      expect(loaded).toBeNull();
    });

    it('loadInterims returns empty for existing dir but no matching files', async () => {
      // Write for node-a, load for node-b
      await journal.writeInterim('node-a', validInterim());
      const loaded = journal.loadInterims('node-b');
      expect(loaded).toEqual([]);
    });
  });

  // === loadChain ===

  describe('loadChain', () => {
    it('assembles full chain with interims and final', async () => {
      await journal.writeInterim('node-a', validInterim({ timestamp: '2026-03-08T10:00:00.000Z', progress: 0.3 }));
      await journal.writeInterim('node-a', validInterim({ timestamp: '2026-03-08T11:00:00.000Z', progress: 0.7 }));
      await journal.writeFinal('node-a', validFinal({ timestamp: '2026-03-08T12:00:00.000Z' }));

      const chain: HandoffChain = await journal.loadChain('node-a');
      expect(chain.nodeId).toBe('node-a');
      expect(chain.interims).toHaveLength(2);
      expect(chain.final).not.toBeNull();
      expect(chain.totalCheckpoints).toBe(3); // 2 interims + 1 final
      expect(chain.lastCheckpointTime).toBe('2026-03-08T11:00:00.000Z'); // last interim timestamp
    });

    it('returns empty chain for node with no data', async () => {
      const chain = await journal.loadChain('ghost-node');
      expect(chain.nodeId).toBe('ghost-node');
      expect(chain.interims).toEqual([]);
      expect(chain.final).toBeNull();
      expect(chain.totalCheckpoints).toBe(0);
      expect(chain.lastCheckpointTime).toBeUndefined();
    });

    it('returns chain with only final (no interims)', async () => {
      await journal.writeFinal('node-a', validFinal());

      const chain = await journal.loadChain('node-a');
      expect(chain.interims).toEqual([]);
      expect(chain.final).not.toBeNull();
      expect(chain.totalCheckpoints).toBe(1);
      expect(chain.lastCheckpointTime).toBe(validFinal().timestamp);
    });
  });

  // === clearNode ===

  describe('clearNode', () => {
    it('removes all interims and final for a node', async () => {
      await journal.writeInterim('node-a', validInterim({ timestamp: '2026-03-08T10:00:00.000Z' }));
      await journal.writeInterim('node-a', validInterim({ timestamp: '2026-03-08T11:00:00.000Z' }));
      await journal.writeFinal('node-a', validFinal());

      journal.clearNode('node-a');

      expect(journal.loadInterims('node-a')).toEqual([]);
      expect(journal.loadFinal('node-a')).toBeNull();
    });

    it('is idempotent — clearing non-existent node is a no-op', () => {
      // No dir exists yet — should not throw
      expect(() => journal.clearNode('nonexistent')).not.toThrow();
      // Call again after dir might or might not exist
      expect(() => journal.clearNode('nonexistent')).not.toThrow();
    });

    it('does not affect other nodes', async () => {
      await journal.writeInterim('node-a', validInterim());
      await journal.writeInterim('node-b', validInterim());
      await journal.writeFinal('node-b', validFinal());

      journal.clearNode('node-a');

      // node-b untouched
      expect(journal.loadInterims('node-b')).toHaveLength(1);
      expect(journal.loadFinal('node-b')).not.toBeNull();
    });
  });

  // === Invalid JSON handling ===

  describe('invalid JSON handling', () => {
    it('loadFinal returns null for corrupted JSON', async () => {
      // Manually write garbage to the final file
      const handoffDir = join(tmpRoot, '.roadmap', '.handoff');
      mkdirSync(handoffDir, { recursive: true });
      writeFileSync(join(handoffDir, 'node-a.json'), '{not valid json!!!');

      const loaded = journal.loadFinal('node-a');
      expect(loaded).toBeNull();
    });

    it('loadInterims returns empty array when interim files contain invalid JSON', async () => {
      const handoffDir = join(tmpRoot, '.roadmap', '.handoff');
      mkdirSync(handoffDir, { recursive: true });
      writeFileSync(join(handoffDir, 'node-a-interim-2026-03-08T10-00-00.json'), 'GARBAGE');

      const loaded = journal.loadInterims('node-a');
      // The source catches parse errors per-file and returns [] for the whole batch
      expect(loaded).toEqual([]);
    });
  });

  // === Standalone functions ===

  describe('standalone functions', () => {
    it('writeInterimHandoff + loadJournal roundtrip', async () => {
      await writeInterimHandoff(tmpRoot, 'standalone-a', validInterim());

      const loaded = loadJournal(tmpRoot, 'standalone-a');
      expect(loaded).toHaveLength(1);
      expect(loaded[0].progress).toBe(0.5);
    });

    it('writeFinalHandoff + loadFinal roundtrip', async () => {
      await writeFinalHandoff(tmpRoot, 'standalone-b', validFinal());

      const loaded = loadFinal(tmpRoot, 'standalone-b');
      expect(loaded).not.toBeNull();
      expect(loaded!.summary).toBe('Built auth module');
    });

    it('saveInterim is alias for writeInterimHandoff', async () => {
      await saveInterim(tmpRoot, 'alias-a', validInterim());

      const loaded = loadJournal(tmpRoot, 'alias-a');
      expect(loaded).toHaveLength(1);
    });

    it('saveFinal is alias for writeFinalHandoff', async () => {
      await saveFinal(tmpRoot, 'alias-b', validFinal());

      const loaded = loadFinal(tmpRoot, 'alias-b');
      expect(loaded).not.toBeNull();
      expect(loaded!.summary).toBe('Built auth module');
    });

    it('loadJournal returns empty array for missing node', () => {
      const loaded = loadJournal(tmpRoot, 'missing-node');
      expect(loaded).toEqual([]);
    });

    it('loadFinal returns null for missing node', () => {
      const loaded = loadFinal(tmpRoot, 'missing-node');
      expect(loaded).toBeNull();
    });
  });

  // === Directory creation ===

  describe('directory creation', () => {
    it('creates .roadmap/.handoff on first write', async () => {
      const handoffDir = join(tmpRoot, '.roadmap', '.handoff');
      expect(existsSync(handoffDir)).toBe(false);

      await journal.writeInterim('node-a', validInterim());

      expect(existsSync(handoffDir)).toBe(true);
    });

    it('does not fail when directory already exists', async () => {
      await journal.writeInterim('node-a', validInterim({ timestamp: '2026-03-08T10:00:00.000Z' }));
      // Second write to same dir
      await journal.writeInterim('node-a', validInterim({ timestamp: '2026-03-08T11:00:00.000Z' }));

      const loaded = journal.loadInterims('node-a');
      expect(loaded).toHaveLength(2);
    });
  });

  // === Node isolation ===

  describe('node isolation', () => {
    it('interims from different nodes do not leak', async () => {
      await journal.writeInterim('node-a', validInterim({ timestamp: '2026-03-08T10:00:00.000Z', progress: 0.3 }));
      await journal.writeInterim('node-b', validInterim({ timestamp: '2026-03-08T10:00:00.000Z', progress: 0.7 }));

      const loadedA = journal.loadInterims('node-a');
      const loadedB = journal.loadInterims('node-b');

      expect(loadedA).toHaveLength(1);
      expect(loadedA[0].progress).toBe(0.3);
      expect(loadedB).toHaveLength(1);
      expect(loadedB[0].progress).toBe(0.7);
    });
  });
});
