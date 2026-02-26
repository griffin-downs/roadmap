import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { computeTrailMetrics, loadTrailEntries } from '../src/lib/trail-metrics.ts';

function makeRoot(): string {
  const dir = join(tmpdir(), `trail-metrics-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, '.roadmap'), { recursive: true });
  return dir;
}

function writeTrail(root: string, entries: object[]): void {
  writeFileSync(
    join(root, '.roadmap', 'trail.jsonl'),
    entries.map(e => JSON.stringify(e)).join('\n') + '\n',
  );
}

function writeClaims(root: string, claims: object): void {
  writeFileSync(join(root, '.roadmap', 'claims.json'), JSON.stringify(claims));
}

function writeIter(root: string, iteration: number): void {
  writeFileSync(join(root, '.roadmap', 'iter.json'), JSON.stringify({ iteration, startedAt: new Date().toISOString() }));
}

let root: string;
beforeEach(() => { root = makeRoot(); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('loadTrailEntries', () => {
  it('returns [] when trail absent', () => {
    expect(loadTrailEntries(root)).toEqual([]);
  });

  it('parses valid JSONL, skips malformed lines', () => {
    writeFileSync(join(root, '.roadmap', 'trail.jsonl'),
      '{"cmd":"orient","ts":"2024-01-01T00:00:00Z"}\nBAD JSON\n{"cmd":"complete","ts":"2024-01-01T01:00:00Z"}\n');
    const entries = loadTrailEntries(root);
    expect(entries).toHaveLength(2);
    expect(entries[0].cmd).toBe('orient');
    expect(entries[1].cmd).toBe('complete');
  });
});

describe('computeTrailMetrics — empty / missing', () => {
  it('returns zero-state when trail absent', () => {
    const m = computeTrailMetrics(root);
    expect(m.source).toBe('trail');
    expect(m.orientCallCount).toBe(0);
    expect(m.completeCallCount).toBe(0);
    expect(m.batches).toEqual([]);
    expect(m.iteration).toBe(0);
    expect(m.entryCount).toBe(0);
  });

  it('reads iteration from iter.json', () => {
    writeIter(root, 3);
    const m = computeTrailMetrics(root);
    expect(m.iteration).toBe(3);
  });
});

describe('computeTrailMetrics — orient counting', () => {
  it('counts orient and position commands', () => {
    writeTrail(root, [
      { cmd: 'orient', ts: '2024-01-01T00:00:00Z', level: 2 },
      { cmd: 'position', ts: '2024-01-01T00:01:00Z', level: 2 },
      { cmd: 'orient', ts: '2024-01-01T00:02:00Z', level: 2 },
      { cmd: 'complete', ts: '2024-01-01T01:00:00Z', level: 2, detail: { nodeId: 'n1', owner: 'w1' } },
    ]);
    const m = computeTrailMetrics(root);
    expect(m.orientCallCount).toBe(3);
    expect(m.completeCallCount).toBe(1);
    expect(m.batches[0].orientCallCount).toBe(3);
  });
});

describe('computeTrailMetrics — node durations', () => {
  it('computes durationMs from claimedAt + completedAt', () => {
    writeTrail(root, [
      { cmd: 'complete', ts: '2024-01-01T01:00:00Z', level: 5,
        detail: { nodeId: 'auth', owner: 'agent-1' } },
    ]);
    writeClaims(root, {
      auth: { owner: 'agent-1', claimedAt: '2024-01-01T00:00:00Z', claimExpiry: '2099-01-01T00:00:00Z' },
    });
    const m = computeTrailMetrics(root);
    expect(m.batches).toHaveLength(1);
    const node = m.batches[0].nodeMetrics[0];
    expect(node.nodeId).toBe('auth');
    expect(node.owner).toBe('agent-1');
    expect(node.durationMs).toBe(3600_000); // 1 hour
  });

  it('durationMs undefined when claim absent', () => {
    writeTrail(root, [
      { cmd: 'complete', ts: '2024-01-01T01:00:00Z', level: 3,
        detail: { nodeId: 'no-claim', owner: 'w1' } },
    ]);
    const m = computeTrailMetrics(root);
    expect(m.batches[0].nodeMetrics[0].durationMs).toBeUndefined();
  });
});

describe('computeTrailMetrics — batch wall-clock', () => {
  it('wallClockMs spans first claimedAt to last completedAt', () => {
    writeTrail(root, [
      { cmd: 'complete', ts: '2024-01-01T01:00:00Z', level: 7, detail: { nodeId: 'a', owner: 'w1' } },
      { cmd: 'complete', ts: '2024-01-01T01:30:00Z', level: 7, detail: { nodeId: 'b', owner: 'w2' } },
    ]);
    writeClaims(root, {
      a: { owner: 'w1', claimedAt: '2024-01-01T00:00:00Z', claimExpiry: '2099-01-01T00:00:00Z' },
      b: { owner: 'w2', claimedAt: '2024-01-01T00:05:00Z', claimExpiry: '2099-01-01T00:00:00Z' },
    });
    const m = computeTrailMetrics(root);
    const batch = m.batches[0];
    expect(batch.startedAt).toBe('2024-01-01T00:00:00Z'); // earliest claimedAt
    expect(batch.completedAt).toBe('2024-01-01T01:30:00Z'); // latest completedAt
    expect(batch.wallClockMs).toBe(90 * 60_000); // 90 minutes
  });

  it('wallClockMs undefined when no claims exist', () => {
    writeTrail(root, [
      { cmd: 'complete', ts: '2024-01-01T01:00:00Z', level: 2, detail: { nodeId: 'x', owner: 'w1' } },
    ]);
    const m = computeTrailMetrics(root);
    expect(m.batches[0].wallClockMs).toBeUndefined();
  });
});

describe('computeTrailMetrics — multi-batch', () => {
  it('groups by level and produces totalWallClockMs', () => {
    writeTrail(root, [
      { cmd: 'complete', ts: '2024-01-01T01:00:00Z', level: 1, detail: { nodeId: 'n1', owner: 'w1' } },
      { cmd: 'complete', ts: '2024-01-01T03:00:00Z', level: 2, detail: { nodeId: 'n2', owner: 'w1' } },
    ]);
    writeClaims(root, {
      n1: { owner: 'w1', claimedAt: '2024-01-01T00:00:00Z', claimExpiry: '2099-01-01T00:00:00Z' },
      n2: { owner: 'w1', claimedAt: '2024-01-01T01:30:00Z', claimExpiry: '2099-01-01T00:00:00Z' },
    });
    const m = computeTrailMetrics(root);
    expect(m.batches).toHaveLength(2);
    expect(m.batches[0].level).toBe(1);
    expect(m.batches[1].level).toBe(2);
    // total: first start (00:00) → last end (03:00) = 3h
    expect(m.totalWallClockMs).toBe(3 * 3600_000);
  });

  it('batches sorted ascending by level', () => {
    writeTrail(root, [
      { cmd: 'complete', ts: '2024-01-01T03:00:00Z', level: 5, detail: { nodeId: 'c', owner: 'w' } },
      { cmd: 'complete', ts: '2024-01-01T01:00:00Z', level: 3, detail: { nodeId: 'a', owner: 'w' } },
      { cmd: 'complete', ts: '2024-01-01T02:00:00Z', level: 4, detail: { nodeId: 'b', owner: 'w' } },
    ]);
    const m = computeTrailMetrics(root);
    expect(m.batches.map(b => b.level)).toEqual([3, 4, 5]);
  });
});

describe('computeTrailMetrics — regent-agnostic invariant', () => {
  it('source is always "trail" regardless of execution context', () => {
    const m = computeTrailMetrics(root);
    expect(m.source).toBe('trail');
  });

  it('produces valid metrics with no agent JSONL files present', () => {
    // Simulate a non-regent run: only trail + claims, no agent-*.jsonl
    writeTrail(root, [
      { cmd: 'orient', ts: '2024-01-01T00:00:00Z', level: 1 },
      { cmd: 'complete', ts: '2024-01-01T01:00:00Z', level: 1, detail: { nodeId: 'work', owner: 'human' } },
    ]);
    writeClaims(root, {
      work: { owner: 'human', claimedAt: '2024-01-01T00:10:00Z', claimExpiry: '2099-01-01T00:00:00Z' },
    });
    const m = computeTrailMetrics(root);
    expect(m.batches).toHaveLength(1);
    expect(m.batches[0].nodeMetrics[0].durationMs).toBe(50 * 60_000); // 50 min
    expect(m.orientCallCount).toBe(1);
    // No errors, no regent dependency
  });
});
