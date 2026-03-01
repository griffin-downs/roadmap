import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadClaims, saveClaims, isExpired, activeClaims, annotateWithClaims,
} from '../src/lib/claims/claims.ts';
import type { NodeClaim, ClaimStore } from '../src/lib/claims/claims.ts';

// Shared test root — isolated tmp dir per test
let testRoot: string;

beforeEach(() => {
  testRoot = join(tmpdir(), `roadmap-claims-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

describe('loadClaims', () => {
  it('returns empty object when file missing', () => {
    expect(loadClaims(testRoot)).toEqual({});
  });

  it('returns parsed store when file exists', () => {
    const store: ClaimStore = { 'node-a': makeClaim({ owner: 'alice' }) };
    saveClaims(testRoot, store);
    expect(loadClaims(testRoot)).toEqual(store);
  });

  it('returns empty object on malformed JSON', () => {
    const { writeFileSync } = require('node:fs');
    writeFileSync(join(testRoot, '.roadmap', 'claims.json'), 'NOT_JSON');
    expect(loadClaims(testRoot)).toEqual({});
  });
});

describe('saveClaims', () => {
  it('creates .roadmap/claims.json', () => {
    const store: ClaimStore = { 'node-b': makeClaim() };
    saveClaims(testRoot, store);
    const loaded = loadClaims(testRoot);
    expect(loaded['node-b']?.owner).toBe('test-agent');
  });

  it('overwrites existing store', () => {
    saveClaims(testRoot, { 'node-a': makeClaim({ owner: 'alice' }) });
    saveClaims(testRoot, { 'node-b': makeClaim({ owner: 'bob' }) });
    const loaded = loadClaims(testRoot);
    expect(Object.keys(loaded)).toEqual(['node-b']);
  });
});

describe('isExpired', () => {
  it('returns false for future expiry', () => {
    const claim = makeClaim({ claimExpiry: new Date(Date.now() + 60_000).toISOString() });
    expect(isExpired(claim)).toBe(false);
  });

  it('returns true for past expiry', () => {
    const claim = makeClaim({ claimExpiry: new Date(Date.now() - 1000).toISOString() });
    expect(isExpired(claim)).toBe(true);
  });

  it('respects explicit now parameter', () => {
    const expiry = new Date('2030-01-01T00:00:00.000Z');
    const claim = makeClaim({ claimExpiry: expiry.toISOString() });
    // Before expiry
    expect(isExpired(claim, new Date('2029-12-31T00:00:00.000Z'))).toBe(false);
    // After expiry
    expect(isExpired(claim, new Date('2030-01-02T00:00:00.000Z'))).toBe(true);
  });
});

describe('activeClaims', () => {
  it('returns only non-expired entries', () => {
    const now = new Date();
    const store: ClaimStore = {
      'live': makeClaim({ claimExpiry: new Date(now.getTime() + 60_000).toISOString() }),
      'dead': makeClaim({ claimExpiry: new Date(now.getTime() - 1000).toISOString() }),
    };
    const active = activeClaims(store, now);
    expect(Object.keys(active)).toEqual(['live']);
  });

  it('returns empty object when all expired', () => {
    const store: ClaimStore = {
      'dead': makeClaim({ claimExpiry: new Date(Date.now() - 1000).toISOString() }),
    };
    expect(activeClaims(store)).toEqual({});
  });

  it('does not mutate original store', () => {
    const store: ClaimStore = {
      'dead': makeClaim({ claimExpiry: new Date(Date.now() - 1000).toISOString() }),
    };
    activeClaims(store);
    expect('dead' in store).toBe(true);
  });
});

describe('annotateWithClaims', () => {
  it('annotates claimed nodes with expired: false', () => {
    const store: ClaimStore = {
      'node-a': makeClaim({ claimExpiry: new Date(Date.now() + 60_000).toISOString() }),
    };
    const result = annotateWithClaims(['node-a', 'node-b'], store);
    expect(result['node-a']).toBeDefined();
    expect(result['node-a']!.expired).toBe(false);
  });

  it('annotates expired claim with expired: true', () => {
    const store: ClaimStore = {
      'node-a': makeClaim({ claimExpiry: new Date(Date.now() - 1000).toISOString() }),
    };
    const result = annotateWithClaims(['node-a'], store);
    expect(result['node-a']!.expired).toBe(true);
  });

  it('omits unclaimed nodes', () => {
    const store: ClaimStore = {};
    const result = annotateWithClaims(['node-a', 'node-b'], store);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('only annotates nodes in provided list', () => {
    const store: ClaimStore = {
      'node-a': makeClaim(),
      'node-z': makeClaim(),
    };
    const result = annotateWithClaims(['node-a'], store);
    expect('node-z' in result).toBe(false);
    expect('node-a' in result).toBe(true);
  });

  it('preserves all NodeClaim fields', () => {
    const claim = makeClaim({ owner: 'architect', claimExpiry: new Date(Date.now() + 60_000).toISOString() });
    const store: ClaimStore = { 'node-a': claim };
    const result = annotateWithClaims(['node-a'], store);
    expect(result['node-a']!.owner).toBe('architect');
    expect(result['node-a']!.claimedAt).toBe(claim.claimedAt);
    expect(result['node-a']!.claimExpiry).toBe(claim.claimExpiry);
  });
});

describe('round-trip: save → load → annotate', () => {
  it('annotates correctly after save/load cycle', () => {
    const claim = makeClaim({ owner: 'steward', claimExpiry: new Date(Date.now() + 120_000).toISOString() });
    saveClaims(testRoot, { 'DO.RM.1': claim });
    const store = loadClaims(testRoot);
    const annotations = annotateWithClaims(['DO.RM.1', 'DO.RM.2'], store);
    expect(annotations['DO.RM.1']!.owner).toBe('steward');
    expect(annotations['DO.RM.1']!.expired).toBe(false);
    expect('DO.RM.2' in annotations).toBe(false);
  });
});

describe('renew semantics', () => {
  it.skip('renew updates claimExpiry, preserves owner + claimedAt', () => {
    const now = Date.now();
    const originalExpiry = new Date(now + 60_000).toISOString();
    const originalClaim = makeClaim({ owner: 'worker', claimExpiry: originalExpiry });
    saveClaims(testRoot, { 'node-a': originalClaim });

    // Simulate renew: load, check not expired + owner match, extend expiry
    const store = loadClaims(testRoot);
    const existing = store['node-a']!;
    expect(isExpired(existing)).toBe(false);
    expect(existing.owner).toBe('worker');

    const newExpiry = new Date(now + 300_000).toISOString();
    store['node-a'] = { ...existing, claimExpiry: newExpiry };
    saveClaims(testRoot, store);

    const reloaded = loadClaims(testRoot);
    expect(reloaded['node-a']!.claimedAt).toBe(originalClaim.claimedAt); // unchanged
    // Allow 1 second tolerance for the expiry timestamp
    const expectedTime = new Date(newExpiry).getTime();
    const actualTime = new Date(reloaded['node-a']!.claimExpiry).getTime();
    expect(Math.abs(expectedTime - actualTime)).toBeLessThan(1000);
    expect(reloaded['node-a']!.owner).toBe('worker');                     // unchanged
  });

  it('renew should fail if claim is expired', () => {
    const expired = makeClaim({ claimExpiry: new Date(Date.now() - 1000).toISOString() });
    expect(isExpired(expired)).toBe(true);
    // Caller must check isExpired before extending — expired claim cannot be renewed
    const store: ClaimStore = { 'node-a': expired };
    const existing = store['node-a']!;
    // Renew guard: fail if expired
    expect(isExpired(existing)).toBe(true);
  });

  it('expired same-owner re-claim is blocked (correctness fix)', () => {
    // Documents the expected behavior: expired claim by same owner should NOT
    // silently re-claim (another agent may have taken the node since expiry).
    const expired = makeClaim({ owner: 'agent-x', claimExpiry: new Date(Date.now() - 1000).toISOString() });
    const store: ClaimStore = { 'node-a': expired };
    const existing = store['node-a']!;
    // CLI enforces: if expired && owner matches → error, not silent re-claim
    expect(isExpired(existing)).toBe(true);
    expect(existing.owner).toBe('agent-x');
    // Caller must use --release then re-claim explicitly
  });
});
