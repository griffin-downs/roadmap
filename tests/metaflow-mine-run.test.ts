import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mineRun, miningExists } from '../src/lib/metaflow/phases/mine-run.ts';
import { ensureRunDir, runDir, appendReceipt, writeSessions } from '../src/lib/metaflow/fs.ts';
import type { RunId, InteractionReceipt, StepId, SessionsStore } from '../src/lib/metaflow/types.ts';

const TMP = join(__dirname, '__tmp_mine_run');
const RUN_ID = 'mine-test-001' as RunId;

function makeReceipt(overrides: Partial<InteractionReceipt> = {}): InteractionReceipt {
  return {
    schema_version: 1,
    runId: RUN_ID,
    stepId: `step-${Date.now()}` as StepId,
    cmd: 'roadmap orient',
    intent: 'test',
    audience: 'agent',
    render: { plainPath: '/tmp/x.plain.txt', ansiPath: '/tmp/x.ansi.txt', width: 120, emoji: true, color: true },
    evidence: { headSha: 'abc', toolCalls: 3, latencyMs: 100 },
    ...overrides,
  };
}

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  ensureRunDir(RUN_ID, TMP);
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('mineRun', () => {
  it('produces a MiningResult and writes mining.json', () => {
    appendReceipt(RUN_ID, makeReceipt({ evidence: { headSha: 'a', toolCalls: 2, latencyMs: 50 } }), TMP);
    appendReceipt(RUN_ID, makeReceipt({ evidence: { headSha: 'a', toolCalls: 5, latencyMs: 200 } }), TMP);

    const result = mineRun(RUN_ID, TMP);

    expect(result.schema_version).toBe(1);
    expect(result.runId).toBe(RUN_ID);
    expect(result.toolCallTotal).toBe(7);
    expect(result.latencyP50Ms).toBeGreaterThanOrEqual(0);
    expect(result.latencyP95Ms).toBeGreaterThanOrEqual(result.latencyP50Ms);
    expect(typeof result.computedAt).toBe('string');
    expect(Array.isArray(result.hotspots)).toBe(true);
    expect(Array.isArray(result.friction)).toBe(true);

    // mining.json written
    const miningPath = join(runDir(RUN_ID, TMP), 'mining.json');
    expect(existsSync(miningPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(miningPath, 'utf8'));
    expect(parsed.runId).toBe(RUN_ID);
  });

  it('detects orient churn friction', () => {
    // 5 sequential orient receipts with no complete
    for (let i = 0; i < 5; i++) {
      appendReceipt(RUN_ID, makeReceipt({ cmd: 'roadmap orient --note "x"' }), TMP);
    }
    const result = mineRun(RUN_ID, TMP);
    const orientChurn = result.friction.filter(f => f.category === 'orient-churn');
    expect(orientChurn.length).toBeGreaterThan(0);
  });

  it('returns empty friction when receipts are clean', () => {
    appendReceipt(RUN_ID, makeReceipt({ cmd: 'roadmap orient' }), TMP);
    appendReceipt(RUN_ID, makeReceipt({ cmd: 'roadmap complete node-a' }), TMP);
    const result = mineRun(RUN_ID, TMP);
    expect(result.friction.length).toBe(0);
  });

  it('reads teamReuseMissed from sessions', () => {
    appendReceipt(RUN_ID, makeReceipt(), TMP);
    const sessions: SessionsStore = {
      schema_version: 1,
      teamId: RUN_ID,
      sessions: [],
      reuseField: { teamReuseMissed: true, missedAt: new Date().toISOString() },
    };
    writeSessions(RUN_ID, sessions, TMP);

    const result = mineRun(RUN_ID, TMP);
    expect(result.teamReuseMissed).toBe(true);
  });
});

describe('miningExists', () => {
  it('returns false when no mining.json', () => {
    expect(miningExists(RUN_ID, TMP)).toBe(false);
  });

  it('returns true after mineRun', () => {
    appendReceipt(RUN_ID, makeReceipt(), TMP);
    mineRun(RUN_ID, TMP);
    expect(miningExists(RUN_ID, TMP)).toBe(true);
  });
});
