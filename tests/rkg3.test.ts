import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';

import { isArgvCommand, toArgv } from '../src/lib/validator-argv.js';
import { runValidator } from '../src/lib/validator-runner.js';
import { makeWorkerIndex } from '../src/lib/utils/git/git-index.js';
import { assertStagedScope, getHookScope } from '../src/lib/hook-scope.js';
import { applyOverlay } from '../src/lib/strategy-overlay.js';
import type { StrategyOverlay } from '../src/lib/strategy-overlay.js';
import { getCached, setCached, loadCache } from '../src/lib/verify-cache.js';
import type { CacheEntry, VerifyCache } from '../src/lib/verify-cache.js';
import { validateDispatchFreshness } from '../src/lib/recipes/dispatch/dispatch-receipt.js';
import type { DispatchReceipt } from '../src/lib/recipes/dispatch/dispatch-receipt.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'rkg3-test-'));
}

describe('rkg3 — validator-argv', () => {
  it('isArgvCommand: returns false for string, true for string[]', () => {
    expect(isArgvCommand('npx tsc --noEmit')).toBe(false);
    expect(isArgvCommand(['npx', 'tsc', '--noEmit'])).toBe(true);
  });

  it('toArgv: splits on whitespace and filters empty strings', () => {
    expect(toArgv('npx tsc --noEmit')).toEqual(['npx', 'tsc', '--noEmit']);
    expect(toArgv('  echo  hi  ')).toEqual(['echo', 'hi']);
    expect(toArgv('')).toEqual([]);
  });

  it('toArgv roundtrip: split string matches expected argv', () => {
    const cmd = 'git diff --cached';
    const argv = toArgv(cmd);
    expect(argv).toEqual(['git', 'diff', '--cached']);
    expect(isArgvCommand(argv)).toBe(true);
  });

  describe('validator-runner: accepts both string and string[] command', () => {
    it('string command runs via sh -c', async () => {
      const tmp = makeTmpDir();
      try {
        const result = await runValidator('test-node', 'shell:echo', 'echo hello', tmp);
        expect(result.passed).toBe(true);
        expect(result.stdout.trim()).toBe('hello');
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('argv array command runs without shell — no injection risk', async () => {
      const tmp = makeTmpDir();
      try {
        // argv array: ['echo', 'hello world'] — no shell expansion
        const result = await runValidator('test-node', 'shell:echo-argv', ['echo', 'hello world'], tmp);
        expect(result.passed).toBe(true);
        expect(result.stdout.trim()).toBe('hello world');
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('argv array: shell metacharacters are not interpreted', async () => {
      const tmp = makeTmpDir();
      try {
        // if shell-escaped, "$HOME" would expand; as argv it is literal
        const result = await runValidator('test-node', 'shell:echo-literal', ['echo', '$HOME'], tmp);
        expect(result.passed).toBe(true);
        expect(result.stdout.trim()).toBe('$HOME');
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });
});

describe('rkg3 — git-index', () => {
  it('makeWorkerIndex creates unique paths per worker ID', () => {
    const tmp = makeTmpDir();
    try {
      const a = makeWorkerIndex(tmp, 'worker-a');
      const b = makeWorkerIndex(tmp, 'worker-b');
      expect(a.indexPath).not.toBe(b.indexPath);
      expect(a.env.GIT_INDEX_FILE).toBe(a.indexPath);
      expect(b.env.GIT_INDEX_FILE).toBe(b.indexPath);
      expect(a.workerId).toBe('worker-a');
      expect(b.workerId).toBe('worker-b');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('makeWorkerIndex creates the idx directory', () => {
    const tmp = makeTmpDir();
    try {
      makeWorkerIndex(tmp, 'w1');
      expect(existsSync(join(tmp, '.roadmap', 'idx'))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('rkg3 — hook-scope', () => {
  it('getHookScope returns staged', () => {
    expect(getHookScope()).toBe('staged');
  });

  it('assertStagedScope passes for git diff --cached', () => {
    expect(() => assertStagedScope('git diff --cached')).not.toThrow();
  });

  it('assertStagedScope passes for git diff --staged', () => {
    expect(() => assertStagedScope('git diff --staged')).not.toThrow();
  });

  it('assertStagedScope throws for bare git diff (working-tree)', () => {
    expect(() => assertStagedScope('git diff HEAD')).toThrow('hook-scope');
  });

  it('assertStagedScope passes for commands that do not include git diff', () => {
    expect(() => assertStagedScope('npx tsc --noEmit')).not.toThrow();
  });
});

describe('rkg3 — strategy-overlay', () => {
  const overlay: StrategyOverlay = {
    overlayId: 'test-overlay',
    baselineId: 'baseline-a',
    description: 'hypothesis B',
    params: { temperature: 0.7, maxTokens: 512 },
    timestamp: '2026-02-28T00:00:00Z',
  };

  it('applyOverlay merges params onto base — overlay wins on conflict', () => {
    const base = { temperature: 0.5, topP: 0.9, model: 'gpt-4' };
    const result = applyOverlay(base, overlay);
    expect(result.temperature).toBe(0.7);    // overlay wins
    expect(result.topP).toBe(0.9);           // base preserved
    expect(result.model).toBe('gpt-4');       // base preserved
    expect(result.maxTokens).toBe(512);       // overlay adds new key
  });

  it('applyOverlay does not mutate base', () => {
    const base = { temperature: 0.5 };
    applyOverlay(base, overlay);
    expect(base.temperature).toBe(0.5);
  });
});

describe('rkg3 — verify-cache', () => {
  function makeEntry(nodeId: string, treeSha: string, passed = true): CacheEntry {
    return { nodeId, treeSha, passed, exitCode: passed ? 0 : 1, stdout: '', cachedAt: new Date().toISOString() };
  }

  it('getCached miss: returns undefined for unknown nodeId + treeSha', () => {
    const cache: VerifyCache = { entries: [] };
    expect(getCached(cache, 'node-a', 'sha123')).toBeUndefined();
  });

  it('getCached hit: finds entry by nodeId + treeSha', () => {
    const entry = makeEntry('node-a', 'sha123');
    const cache: VerifyCache = { entries: [entry] };
    expect(getCached(cache, 'node-a', 'sha123')).toBe(entry);
  });

  it('getCached miss: same nodeId but different treeSha', () => {
    const entry = makeEntry('node-a', 'sha123');
    const cache: VerifyCache = { entries: [entry] };
    expect(getCached(cache, 'node-a', 'sha999')).toBeUndefined();
  });

  it('setCached inserts new entry', () => {
    const cache: VerifyCache = { entries: [] };
    const entry = makeEntry('node-b', 'sha456');
    setCached(cache, entry);
    expect(cache.entries).toHaveLength(1);
    expect(getCached(cache, 'node-b', 'sha456')).toBe(entry);
  });

  it('setCached updates existing entry by nodeId + treeSha', () => {
    const entry1 = makeEntry('node-c', 'sha789', false);
    const cache: VerifyCache = { entries: [entry1] };
    const entry2 = makeEntry('node-c', 'sha789', true);
    setCached(cache, entry2);
    expect(cache.entries).toHaveLength(1);
    expect(getCached(cache, 'node-c', 'sha789')!.passed).toBe(true);
  });

  it('loadCache returns empty entries for non-existent file', () => {
    const tmp = makeTmpDir();
    try {
      const cache = loadCache(tmp);
      expect(cache.entries).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('rkg3 — dispatch-receipt', () => {
  const receipt: DispatchReceipt = {
    batchId: 'batch-001',
    orientSha: 'abc123',
    timestamp: '2026-02-28T00:00:00Z',
    agentAssignments: [
      { agentId: 'worker-a', nodeId: 'rkg3-validator-argv', produces: ['src/lib/validator-argv.ts'] },
    ],
  };

  it('validateDispatchFreshness returns undefined when orientSha matches', () => {
    expect(validateDispatchFreshness(receipt, 'abc123')).toBeUndefined();
  });

  it('validateDispatchFreshness returns error string on stale orientSha', () => {
    const err = validateDispatchFreshness(receipt, 'def456');
    expect(err).toBeDefined();
    expect(err).toContain('stale');
    expect(err).toContain('abc123');
    expect(err).toContain('def456');
  });
});
