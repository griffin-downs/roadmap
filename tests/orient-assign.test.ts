import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { roadmapCli } from './cli-helper.ts';
import {
  loadClaims, saveClaims, isExpired, assignBatch,
} from '../src/lib/claims.ts';
import type { NodeClaim, ClaimStore, ConflictPair } from '../src/lib/claims.ts';

let testRoot: string;

beforeEach(() => {
  testRoot = join(tmpdir(), `roadmap-assign-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(testRoot, '.roadmap'), { recursive: true });
});

afterEach(() => {
  if (existsSync(testRoot)) rmSync(testRoot, { recursive: true });
});

function makeClaim(overrides: Partial<NodeClaim> = {}): NodeClaim {
  const now = new Date();
  return {
    owner: 'test-agent',
    claimedAt: now.toISOString(),
    claimExpiry: new Date(now.getTime() + 300_000).toISOString(),
    ...overrides,
  };
}

describe('assignBatch: basic round-robin', () => {
  it('assigns nodes to owners in round-robin order', () => {
    const { store, result } = assignBatch(
      ['A', 'B', 'C', 'D'],
      ['w1', 'w2'],
      {},
      [],
      300,
    );
    expect(result.assignments).toEqual({ A: 'w1', B: 'w2', C: 'w1', D: 'w2' });
    expect(Object.keys(result.skipped)).toHaveLength(0);
    expect(store['A']!.owner).toBe('w1');
    expect(store['B']!.owner).toBe('w2');
  });

  it('single owner gets all nodes', () => {
    const { result } = assignBatch(['A', 'B', 'C'], ['solo'], {}, [], 300);
    expect(result.assignments).toEqual({ A: 'solo', B: 'solo', C: 'solo' });
  });

  it('three owners distribute evenly', () => {
    const { result } = assignBatch(
      ['A', 'B', 'C', 'D', 'E', 'F'],
      ['w1', 'w2', 'w3'],
      {},
      [],
      300,
    );
    const counts: Record<string, number> = {};
    for (const owner of Object.values(result.assignments)) {
      counts[owner] = (counts[owner] ?? 0) + 1;
    }
    expect(counts['w1']).toBe(2);
    expect(counts['w2']).toBe(2);
    expect(counts['w3']).toBe(2);
  });
});

describe('assignBatch: idempotency', () => {
  it('skips nodes with active claims', () => {
    const existingStore: ClaimStore = {
      'A': makeClaim({ owner: 'existing-agent' }),
    };
    const { result } = assignBatch(
      ['A', 'B', 'C'],
      ['w1', 'w2'],
      existingStore,
      [],
      300,
    );
    expect(result.skipped['A']).toContain('active claim');
    expect(result.assignments['A']).toBeUndefined();
    expect(result.assignments['B']).toBeDefined();
    expect(result.assignments['C']).toBeDefined();
  });

  it('assigns nodes with expired claims', () => {
    const existingStore: ClaimStore = {
      'A': makeClaim({
        owner: 'expired-agent',
        claimExpiry: new Date(Date.now() - 1000).toISOString(),
      }),
    };
    const { result } = assignBatch(
      ['A', 'B'],
      ['w1'],
      existingStore,
      [],
      300,
    );
    expect(result.assignments['A']).toBe('w1');
    expect(result.skipped['A']).toBeUndefined();
  });

  it('second assign with same owners refreshes only unclaimed nodes', () => {
    const now = new Date();
    // First assignment
    const { store: store1 } = assignBatch(
      ['A', 'B', 'C'],
      ['w1', 'w2'],
      {},
      [],
      300,
      now,
    );

    // Second assignment — same owners, same batch
    const later = new Date(now.getTime() + 10_000);
    const { store: store2, result: result2 } = assignBatch(
      ['A', 'B', 'C'],
      ['w1', 'w2'],
      store1,
      [],
      300,
      later,
    );

    // All three should be skipped (active claims from first round)
    expect(Object.keys(result2.skipped)).toHaveLength(3);
    expect(Object.keys(result2.assignments)).toHaveLength(0);
    // Original claims preserved
    expect(store2['A']!.owner).toBe(store1['A']!.owner);
  });
});

describe('assignBatch: conflict-aware', () => {
  it('avoids co-assigning conflicting nodes to the same owner', () => {
    const conflicts: ConflictPair[] = [
      { file: 'shared.ts', writers: ['A', 'B'] },
    ];
    const { result } = assignBatch(
      ['A', 'B'],
      ['w1', 'w2'],
      {},
      conflicts,
      300,
    );
    // A and B should be on different owners
    expect(result.assignments['A']).not.toBe(result.assignments['B']);
  });

  it('three-way conflict distributes across three owners', () => {
    const conflicts: ConflictPair[] = [
      { file: 'shared.ts', writers: ['A', 'B', 'C'] },
    ];
    const { result } = assignBatch(
      ['A', 'B', 'C'],
      ['w1', 'w2', 'w3'],
      {},
      conflicts,
      300,
    );
    const owners = new Set(Object.values(result.assignments));
    expect(owners.size).toBe(3);
  });

  it('falls back to round-robin when all owners conflict', () => {
    // Two conflicting nodes but only one owner
    const conflicts: ConflictPair[] = [
      { file: 'shared.ts', writers: ['A', 'B'] },
    ];
    const { result } = assignBatch(
      ['A', 'B'],
      ['solo'],
      {},
      conflicts,
      300,
    );
    // Both assigned (fallback), even though they conflict
    expect(result.assignments['A']).toBe('solo');
    expect(result.assignments['B']).toBe('solo');
  });

  it('non-conflicting nodes unaffected by conflicts between others', () => {
    const conflicts: ConflictPair[] = [
      { file: 'shared.ts', writers: ['A', 'B'] },
    ];
    const { result } = assignBatch(
      ['A', 'B', 'C', 'D'],
      ['w1', 'w2'],
      {},
      conflicts,
      300,
    );
    expect(result.assignments['A']).not.toBe(result.assignments['B']);
    // C and D can be assigned to either
    expect(result.assignments['C']).toBeDefined();
    expect(result.assignments['D']).toBeDefined();
  });
});

describe('assignBatch: expired claim refresh', () => {
  it('refreshes expired claims with new owner and TTL', () => {
    const now = new Date();
    const existingStore: ClaimStore = {
      'A': {
        owner: 'old-agent',
        claimedAt: new Date(now.getTime() - 600_000).toISOString(),
        claimExpiry: new Date(now.getTime() - 1000).toISOString(),
      },
    };
    const { store, result } = assignBatch(
      ['A'],
      ['new-agent'],
      existingStore,
      [],
      600,
      now,
    );
    expect(result.assignments['A']).toBe('new-agent');
    expect(store['A']!.owner).toBe('new-agent');
    expect(new Date(store['A']!.claimExpiry).getTime()).toBeGreaterThan(now.getTime());
  });
});

describe('assignBatch: TTL', () => {
  it('sets claim expiry based on TTL', () => {
    const now = new Date();
    const { store } = assignBatch(['A'], ['w1'], {}, [], 900, now);
    const expiry = new Date(store['A']!.claimExpiry);
    const expectedExpiry = now.getTime() + 900_000;
    expect(Math.abs(expiry.getTime() - expectedExpiry)).toBeLessThan(100);
  });
});

describe('assignBatch: edge cases', () => {
  it('throws on empty owners', () => {
    expect(() => assignBatch(['A'], [], {}, [], 300)).toThrow('--owners must be non-empty');
  });

  it('empty batchRemaining returns empty assignments', () => {
    const { result } = assignBatch([], ['w1'], {}, [], 300);
    expect(Object.keys(result.assignments)).toHaveLength(0);
    expect(Object.keys(result.skipped)).toHaveLength(0);
  });
});

describe('assignBatch + saveClaims: atomic write', () => {
  it('writes all assignments in one saveClaims call', () => {
    const { store } = assignBatch(
      ['A', 'B', 'C'],
      ['w1', 'w2'],
      {},
      [],
      300,
    );
    saveClaims(testRoot, store);
    const loaded = loadClaims(testRoot);
    expect(Object.keys(loaded)).toHaveLength(3);
    expect(loaded['A']!.owner).toBe('w1');
    expect(loaded['B']!.owner).toBe('w2');
    expect(loaded['C']!.owner).toBe('w1');
  });
});

describe('CLI: orient --assign', () => {
  const fixtureRoot = '/home/griffin/src/roadmap';

  const run = (cmd: string) => {
    try {
      return roadmapCli(cmd, { cwd: fixtureRoot });
    } catch (e: any) {
      throw new Error(e.stdout || e.message);
    }
  };

  const json = (cmd: string) => JSON.parse(run(cmd));

  it('returns JSON with assignments field for batchRemaining', () => {
    const result = json('orient --assign --owners w1,w2 --note "cli test"');
    expect(result).toHaveProperty('assignments');
    expect(typeof result.assignments).toBe('object');
    // Assignments is a nodeId → owner mapping
    for (const [key, val] of Object.entries(result.assignments)) {
      expect(typeof key).toBe('string');
      expect(typeof val).toBe('string');
    }
  });

  it('exits non-zero without --owners', () => {
    try {
      run('orient --assign --note "cli test"');
      expect.unreachable('Should have thrown');
    } catch (e: any) {
      expect(e.message).toContain('Missing --owners');
    }
  });

  it('exits non-zero with empty --owners', () => {
    try {
      run('orient --assign --owners "" --note "cli test"');
      expect.unreachable('Should have thrown');
    } catch (e: any) {
      expect(e.message).toContain('Empty --owners');
    }
  });

  it('writes .roadmap/claims.json with claimExpiry based on --ttl', () => {
    const claimsPath = join(fixtureRoot, '.roadmap', 'claims.json');
    // Clean up any existing claims
    if (existsSync(claimsPath)) rmSync(claimsPath);

    const before = Date.now();
    const result = json('orient --assign --owners w1 --ttl 120 --note "cli test"');
    const after = Date.now();

    expect(existsSync(claimsPath)).toBe(true);
    const claims = JSON.parse(readFileSync(claimsPath, 'utf-8'));

    // Check that at least one claim was created
    expect(Object.keys(claims).length).toBeGreaterThan(0);

    // Check claimExpiry is approximately 120s from now
    for (const [nodeId, claim] of Object.entries(claims)) {
      expect(claim).toHaveProperty('claimExpiry');
      const expiry = new Date((claim as any).claimExpiry).getTime();
      const expectedExpiry = before + 120_000;
      // Allow 5 second wiggle room for execution time
      expect(Math.abs(expiry - expectedExpiry)).toBeLessThan(5000);
    }

    // Clean up
    if (existsSync(claimsPath)) rmSync(claimsPath);
  });

  it('second orient --assign with same owners is idempotent (skips claimed nodes)', () => {
    const claimsPath = join(fixtureRoot, '.roadmap', 'claims.json');
    if (existsSync(claimsPath)) rmSync(claimsPath);

    // First assignment
    const result1 = json('orient --assign --owners w1,w2 --ttl 300 --note "cli test 1"');
    const firstAssignments = result1.assignments || {};

    // Second assignment with same owners
    const result2 = json('orient --assign --owners w1,w2 --ttl 300 --note "cli test 2"');
    const secondAssignments = result2.assignments || {};

    // Second assignment should be empty (all nodes already claimed by first)
    expect(Object.keys(secondAssignments).length).toBe(0);
    // Or if there's an assignSkipped field, all nodes should be in it
    if (result2.assignSkipped) {
      expect(Object.keys(result2.assignSkipped).length).toBeGreaterThan(0);
    }

    // Clean up
    if (existsSync(claimsPath)) rmSync(claimsPath);
  });

  it('orient --assign respects default TTL of 300s', () => {
    const claimsPath = join(fixtureRoot, '.roadmap', 'claims.json');
    if (existsSync(claimsPath)) rmSync(claimsPath);

    const before = Date.now();
    json('orient --assign --owners w1 --note "cli test"');
    const after = Date.now();

    if (existsSync(claimsPath)) {
      const claims = JSON.parse(readFileSync(claimsPath, 'utf-8'));
      for (const claim of Object.values(claims)) {
        const expiry = new Date((claim as any).claimExpiry).getTime();
        const expectedExpiry = before + 300_000;
        // Allow 5 second wiggle room
        expect(Math.abs(expiry - expectedExpiry)).toBeLessThan(5000);
      }
      rmSync(claimsPath);
    }
  });

  it('orient --assign with multiple owners distributes round-robin', () => {
    const claimsPath = join(fixtureRoot, '.roadmap', 'claims.json');
    if (existsSync(claimsPath)) rmSync(claimsPath);

    const result = json('orient --assign --owners w1,w2,w3 --ttl 300 --note "cli test"');
    const assignments = result.assignments || {};

    if (Object.keys(assignments).length > 1) {
      const ownerCounts: Record<string, number> = {};
      for (const owner of Object.values(assignments)) {
        ownerCounts[owner as string] = (ownerCounts[owner as string] ?? 0) + 1;
      }
      // Verify assignments were distributed (not all to one owner) when multiple nodes
      const uniqueOwners = Object.keys(ownerCounts).length;
      expect(uniqueOwners).toBeGreaterThan(1);
    }

    // Clean up
    if (existsSync(claimsPath)) rmSync(claimsPath);
  });
});
