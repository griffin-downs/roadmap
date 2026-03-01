// RKG-3 fixture suite: argv validator, git index isolation, hook scoping,
// strategy overlay, dispatch receipt, verify cache
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runArgvValidator, isArgvRule, isArgvCommand, toArgv, shellescape } from '../lib/validator-argv.ts';
import type { ArgvValidationRule } from '../lib/validator-argv.ts';
import { makeWorkerIndex } from '../lib/utils/git/git-index.ts';
import { getHookScope, assertStagedScope, StagedOnlyFlag } from '../lib/hook-scope.ts';
import { applyOverlay, writeOverlay, loadOverlay } from '../lib/strategies/strategy-overlay.ts';
import type { StrategyOverlay } from '../lib/strategies/strategy-overlay.ts';
import { writeDispatchReceipt, loadDispatchReceipt, validateDispatchFreshness } from '../lib/recipes/dispatch/dispatch-receipt.ts';
import type { DispatchReceipt } from '../lib/recipes/dispatch/dispatch-receipt.ts';
import { loadCache, saveCache, getCached, setCached } from '../lib/verify-cache.ts';
import type { VerifyCache, CacheEntry } from '../lib/verify-cache.ts';

// -- FR-IR-001: argv validator roundtrip (no shell injection) --

describe('RKG-3: argv validator roundtrip (FR-IR-001)', () => {
  it('runArgvValidator executes argv array without shell interpolation', () => {
    const rule: ArgvValidationRule = { type: 'shell', argv: ['echo', 'hello world'] };
    const result = runArgvValidator(rule);
    expect(result.pass).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.output.trim()).toBe('hello world');
  });

  it('argv with shell metacharacters does NOT trigger shell expansion', () => {
    // If shell expansion happened, $HOME would expand. With argv, it stays literal.
    const rule: ArgvValidationRule = { type: 'shell', argv: ['echo', '$HOME ; echo injected'] };
    const result = runArgvValidator(rule);
    expect(result.pass).toBe(true);
    expect(result.output.trim()).toBe('$HOME ; echo injected');
  });

  it('failing command returns pass=false with correct exit code', () => {
    const rule: ArgvValidationRule = { type: 'shell', argv: ['false'] };
    const result = runArgvValidator(rule);
    expect(result.pass).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it('expectExitCode overrides default success code', () => {
    const rule: ArgvValidationRule = { type: 'shell', argv: ['false'], expectExitCode: 1 };
    const result = runArgvValidator(rule);
    expect(result.pass).toBe(true);
    expect(result.exitCode).toBe(1);
  });

  it('isArgvRule distinguishes argv from command string rules', () => {
    expect(isArgvRule({ argv: ['echo', 'hi'] })).toBe(true);
    expect(isArgvRule({ command: 'echo hi' })).toBe(false);
    expect(isArgvRule({ argv: [] })).toBe(false);
  });

  it('shellescape handles special characters safely', () => {
    expect(shellescape('')).toBe("''");
    expect(shellescape('simple')).toBe('simple');
    expect(shellescape("it's")).toBe("'it'\\''s'");
    expect(shellescape('a b')).toBe("'a b'");
  });

  it('toArgv splits command string by whitespace', () => {
    expect(toArgv('echo hello world')).toEqual(['echo', 'hello', 'world']);
    expect(toArgv('  spaced  ')).toEqual(['spaced']);
  });
});

// -- FR-PAR-001: git index isolation (two workers no collision) --

describe('RKG-3: git index isolation (FR-PAR-001)', () => {
  it('makeWorkerIndex creates distinct index paths per worker', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'rkg3-idx-'));
    const w1 = makeWorkerIndex(tmp, 'worker-1');
    const w2 = makeWorkerIndex(tmp, 'worker-2');
    expect(w1.indexPath).not.toBe(w2.indexPath);
    expect(w1.workerId).toBe('worker-1');
    expect(w2.workerId).toBe('worker-2');
  });

  it('binding env sets GIT_INDEX_FILE to the worker index path', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'rkg3-idx-'));
    const binding = makeWorkerIndex(tmp, 'w1');
    expect(binding.env.GIT_INDEX_FILE).toBe(binding.indexPath);
    expect(binding.indexPath).toContain('w1.idx');
  });

  it('index directory is created automatically', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'rkg3-idx-'));
    makeWorkerIndex(tmp, 'w1');
    expect(existsSync(join(tmp, '.roadmap', 'idx'))).toBe(true);
  });
});

// -- FR-PAR-002: hook scoping (staged-only) --

describe('RKG-3: hook scoping staged-only (FR-PAR-002)', () => {
  it('getHookScope always returns staged', () => {
    expect(getHookScope()).toBe('staged');
  });

  it('StagedOnlyFlag is --staged', () => {
    expect(StagedOnlyFlag).toBe('--staged');
  });

  it('assertStagedScope passes for staged-scoped commands', () => {
    expect(() => assertStagedScope('git diff --cached --name-only')).not.toThrow();
    expect(() => assertStagedScope(['git', 'diff', '--cached'])).not.toThrow();
    expect(() => assertStagedScope('npx vitest run')).not.toThrow(); // no git diff at all
  });

  it('assertStagedScope rejects working-tree git diff', () => {
    expect(() => assertStagedScope('git diff --name-only')).toThrow('working-tree diff');
    expect(() => assertStagedScope(['git', 'diff', '--name-only'])).toThrow('working-tree diff');
  });
});

// -- FR-HAL-001: strategy overlay application --

describe('RKG-3: strategy overlay application (FR-HAL-001)', () => {
  const overlay: StrategyOverlay = {
    overlayId: 'overlay-a',
    baselineId: 'base-plan',
    description: 'test overlay',
    params: { temperature: 0.8, maxTokens: 2000 },
    timestamp: new Date().toISOString(),
  };

  it('applyOverlay merges overlay params onto base config', () => {
    const base = { temperature: 0.5, topK: 40 };
    const result = applyOverlay(base, overlay);
    expect(result.temperature).toBe(0.8); // overlay wins
    expect(result.topK).toBe(40); // base preserved
    expect(result.maxTokens).toBe(2000); // overlay-only key added
  });

  it('writeOverlay + loadOverlay roundtrip', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'rkg3-overlay-'));
    mkdirSync(join(tmp, '.roadmap'), { recursive: true });
    writeOverlay(overlay, tmp);
    const loaded = loadOverlay(tmp);
    expect(loaded).not.toBeNull();
    expect(loaded!.overlayId).toBe('overlay-a');
    expect(loaded!.params.temperature).toBe(0.8);
  });

  it('loadOverlay returns null when no overlay exists', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'rkg3-overlay-'));
    expect(loadOverlay(tmp)).toBeNull();
  });
});

// -- FR-DISP-002: dispatch receipt gating (stale orientSha reject) --

describe('RKG-3: dispatch receipt gating (FR-DISP-002)', () => {
  it('validateDispatchFreshness returns undefined when shas match', () => {
    const receipt: DispatchReceipt = {
      batchId: 'batch-1',
      orientSha: 'abc123',
      timestamp: new Date().toISOString(),
      agentAssignments: [{ agentId: 'w1', nodeId: 'node-a', produces: ['a.ts'] }],
    };
    expect(validateDispatchFreshness(receipt, 'abc123')).toBeUndefined();
  });

  it('validateDispatchFreshness returns error string when orientSha is stale', () => {
    const receipt: DispatchReceipt = {
      batchId: 'batch-1',
      orientSha: 'abc123',
      timestamp: new Date().toISOString(),
      agentAssignments: [],
    };
    const error = validateDispatchFreshness(receipt, 'def456');
    expect(error).toBeDefined();
    expect(error).toContain('stale');
    expect(error).toContain('abc123');
    expect(error).toContain('def456');
  });

  it('writeDispatchReceipt + loadDispatchReceipt roundtrip', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'rkg3-dispatch-'));
    const receipt: DispatchReceipt = {
      batchId: 'b42',
      orientSha: 'sha-abc',
      timestamp: new Date().toISOString(),
      agentAssignments: [
        { agentId: 'w1', nodeId: 'n1', produces: ['out.ts'] },
        { agentId: 'w2', nodeId: 'n2', produces: ['lib.ts'] },
      ],
    };
    writeDispatchReceipt(receipt, tmp);
    const loaded = loadDispatchReceipt('b42', tmp);
    expect(loaded).not.toBeNull();
    expect(loaded!.orientSha).toBe('sha-abc');
    expect(loaded!.agentAssignments.length).toBe(2);
  });

  it('loadDispatchReceipt returns null for unknown batchId', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'rkg3-dispatch-'));
    expect(loadDispatchReceipt('nonexistent', tmp)).toBeNull();
  });
});

// -- FR-PERF-001: verify cache hit/miss by treeSha --

describe('RKG-3: verify cache hit/miss by treeSha (FR-PERF-001)', () => {
  const mkEntry = (nodeId: string, treeSha: string, passed: boolean): CacheEntry => ({
    nodeId,
    treeSha,
    passed,
    exitCode: passed ? 0 : 1,
    stdout: passed ? 'ok' : 'fail',
    cachedAt: new Date().toISOString(),
  });

  it('getCached returns entry when nodeId + treeSha match', () => {
    const cache: VerifyCache = { entries: [mkEntry('n1', 'sha-a', true)] };
    const hit = getCached(cache, 'n1', 'sha-a');
    expect(hit).toBeDefined();
    expect(hit!.passed).toBe(true);
  });

  it('getCached returns undefined on treeSha mismatch (cache miss)', () => {
    const cache: VerifyCache = { entries: [mkEntry('n1', 'sha-a', true)] };
    expect(getCached(cache, 'n1', 'sha-b')).toBeUndefined();
  });

  it('getCached returns undefined on nodeId mismatch', () => {
    const cache: VerifyCache = { entries: [mkEntry('n1', 'sha-a', true)] };
    expect(getCached(cache, 'n2', 'sha-a')).toBeUndefined();
  });

  it('setCached upserts: same key updates, new key appends', () => {
    const cache: VerifyCache = { entries: [mkEntry('n1', 'sha-a', true)] };
    // Update existing
    setCached(cache, mkEntry('n1', 'sha-a', false));
    expect(cache.entries.length).toBe(1);
    expect(cache.entries[0].passed).toBe(false);
    // Append new
    setCached(cache, mkEntry('n1', 'sha-b', true));
    expect(cache.entries.length).toBe(2);
  });

  it('saveCache + loadCache roundtrip', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'rkg3-vcache-'));
    mkdirSync(join(tmp, '.roadmap'), { recursive: true });
    const cache: VerifyCache = { entries: [mkEntry('n1', 'sha-x', true), mkEntry('n2', 'sha-y', false)] };
    saveCache(cache, tmp);
    const loaded = loadCache(tmp);
    expect(loaded.entries.length).toBe(2);
    expect(getCached(loaded, 'n1', 'sha-x')!.passed).toBe(true);
    expect(getCached(loaded, 'n2', 'sha-y')!.passed).toBe(false);
  });

  it('loadCache returns empty cache when file missing', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'rkg3-vcache-'));
    const cache = loadCache(tmp);
    expect(cache.entries).toEqual([]);
  });
});
