import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import {
  acquireClaim,
  releaseClaim,
  renewClaim,
  tryAcquire,
  AtomicClaimError,
} from '../../src/lib/claims/claims-atomic.ts';
import { loadClaims, isExpired } from '../../src/lib/claims/claims.ts';

function initGitRepo(dir: string): void {
  execSync('git init && git commit --allow-empty -m "init"', {
    cwd: dir,
    stdio: 'ignore',
    env: { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@test', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@test' },
  });
}

describe('Concurrent claim handling', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'claims-test-'));
    mkdirSync(join(tmp, '.roadmap', 'tokens', 'claim'), { recursive: true });
    initGitRepo(tmp);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  // --- acquire ---

  it('acquires a claim on an unclaimed node', () => {
    const result = acquireClaim(tmp, 'node-a', 'agent-1', 300);
    expect(result.nodeId).toBe('node-a');
    expect(result.owner).toBe('agent-1');
    expect(result.claimedAt).toBeTruthy();
    expect(result.claimExpiry).toBeTruthy();

    const store = loadClaims(tmp);
    expect(store['node-a']).toBeDefined();
    expect(store['node-a'].owner).toBe('agent-1');
  });

  it('rejects acquire when node is claimed by another owner', () => {
    acquireClaim(tmp, 'node-a', 'agent-1', 300);
    expect(() => acquireClaim(tmp, 'node-a', 'agent-2', 300)).toThrow(AtomicClaimError);

    try {
      acquireClaim(tmp, 'node-a', 'agent-2', 300);
    } catch (e) {
      expect(e).toBeInstanceOf(AtomicClaimError);
      expect((e as AtomicClaimError).code).toBe('ALREADY_CLAIMED');
      expect((e as AtomicClaimError).nodeId).toBe('node-a');
    }
  });

  it('allows same owner to re-acquire (extends TTL)', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    acquireClaim(tmp, 'node-a', 'agent-1', 300, now);

    const later = new Date('2026-01-01T00:01:00Z');
    const result = acquireClaim(tmp, 'node-a', 'agent-1', 600, later);
    expect(result.owner).toBe('agent-1');

    const store = loadClaims(tmp);
    const expiry = new Date(store['node-a'].claimExpiry);
    expect(expiry.getTime()).toBe(later.getTime() + 600_000);
  });

  // --- expiry and re-claim ---

  it('allows acquire after claim expires', () => {
    const past = new Date('2025-01-01T00:00:00Z');
    acquireClaim(tmp, 'node-a', 'agent-1', 1, past);

    // Now is well past expiry
    const now = new Date('2026-01-01T00:00:00Z');
    const result = acquireClaim(tmp, 'node-a', 'agent-2', 300, now);
    expect(result.owner).toBe('agent-2');
  });

  it('isExpired detects expired claims correctly', () => {
    const past = new Date('2025-01-01T00:00:00Z');
    acquireClaim(tmp, 'node-a', 'agent-1', 60, past);

    const store = loadClaims(tmp);
    expect(isExpired(store['node-a'], new Date('2025-01-01T00:02:00Z'))).toBe(true);
    expect(isExpired(store['node-a'], new Date('2025-01-01T00:00:30Z'))).toBe(false);
  });

  // --- release ---

  it('releases a claim held by the owner', () => {
    acquireClaim(tmp, 'node-a', 'agent-1', 300);
    const result = releaseClaim(tmp, 'node-a', 'agent-1');
    expect(result.released).toBe(true);
    expect(result.previousOwner).toBe('agent-1');

    const store = loadClaims(tmp);
    expect(store['node-a']).toBeUndefined();
  });

  it('rejects release by non-owner', () => {
    acquireClaim(tmp, 'node-a', 'agent-1', 300);
    expect(() => releaseClaim(tmp, 'node-a', 'agent-2')).toThrow(AtomicClaimError);

    try {
      releaseClaim(tmp, 'node-a', 'agent-2');
    } catch (e) {
      expect((e as AtomicClaimError).code).toBe('NOT_OWNER');
    }
  });

  it('release on unclaimed node is a no-op', () => {
    const result = releaseClaim(tmp, 'node-z', 'anyone');
    expect(result.released).toBe(true);
    expect(result.previousOwner).toBe('');
  });

  it('allows release of expired claim by non-owner', () => {
    const past = new Date('2025-01-01T00:00:00Z');
    acquireClaim(tmp, 'node-a', 'agent-1', 1, past);

    const now = new Date('2026-01-01T00:00:00Z');
    const result = releaseClaim(tmp, 'node-a', 'agent-2', now);
    expect(result.released).toBe(true);
  });

  // --- renew ---

  it('renews an active claim by the owner', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    acquireClaim(tmp, 'node-a', 'agent-1', 300, now);

    const later = new Date('2026-01-01T00:02:00Z');
    const result = renewClaim(tmp, 'node-a', 'agent-1', 600, later);
    expect(result.renewed).toBe(true);
    expect(result.owner).toBe('agent-1');

    const expiry = new Date(result.claimExpiry);
    expect(expiry.getTime()).toBe(later.getTime() + 600_000);
  });

  it('rejects renew by non-owner', () => {
    acquireClaim(tmp, 'node-a', 'agent-1', 300);
    expect(() => renewClaim(tmp, 'node-a', 'agent-2', 300)).toThrow(AtomicClaimError);

    try {
      renewClaim(tmp, 'node-a', 'agent-2', 300);
    } catch (e) {
      expect((e as AtomicClaimError).code).toBe('NOT_OWNER');
    }
  });

  it('rejects renew on expired claim', () => {
    const past = new Date('2025-01-01T00:00:00Z');
    acquireClaim(tmp, 'node-a', 'agent-1', 1, past);

    const now = new Date('2026-01-01T00:00:00Z');
    expect(() => renewClaim(tmp, 'node-a', 'agent-1', 300, now)).toThrow(AtomicClaimError);

    try {
      renewClaim(tmp, 'node-a', 'agent-1', 300, now);
    } catch (e) {
      expect((e as AtomicClaimError).code).toBe('EXPIRED');
    }
  });

  it('rejects renew on nonexistent claim', () => {
    expect(() => renewClaim(tmp, 'node-z', 'agent-1', 300)).toThrow(AtomicClaimError);
  });

  // --- tryAcquire ---

  it('tryAcquire returns result on success', () => {
    const result = tryAcquire(tmp, 'node-a', 'agent-1', 300);
    expect(result).not.toBeNull();
    expect(result!.owner).toBe('agent-1');
  });

  it('tryAcquire returns null on conflict', () => {
    acquireClaim(tmp, 'node-a', 'agent-1', 300);
    const result = tryAcquire(tmp, 'node-a', 'agent-2', 300);
    expect(result).toBeNull();
  });

  // --- concurrent multi-node scenarios ---

  it('multiple nodes can be claimed by different owners', () => {
    acquireClaim(tmp, 'node-a', 'agent-1', 300);
    acquireClaim(tmp, 'node-b', 'agent-2', 300);
    acquireClaim(tmp, 'node-c', 'agent-3', 300);

    const store = loadClaims(tmp);
    expect(store['node-a'].owner).toBe('agent-1');
    expect(store['node-b'].owner).toBe('agent-2');
    expect(store['node-c'].owner).toBe('agent-3');
  });

  it('claim-release-reclaim cycle works correctly', () => {
    acquireClaim(tmp, 'node-a', 'agent-1', 300);
    releaseClaim(tmp, 'node-a', 'agent-1');

    const result = acquireClaim(tmp, 'node-a', 'agent-2', 300);
    expect(result.owner).toBe('agent-2');

    const store = loadClaims(tmp);
    expect(store['node-a'].owner).toBe('agent-2');
  });

  it('expired claim followed by new claim does not leak old data', () => {
    const t0 = new Date('2025-01-01T00:00:00Z');
    acquireClaim(tmp, 'node-a', 'agent-1', 60, t0);

    const t1 = new Date('2026-01-01T00:00:00Z');
    acquireClaim(tmp, 'node-a', 'agent-2', 300, t1);

    const store = loadClaims(tmp);
    expect(store['node-a'].owner).toBe('agent-2');
    // Expiry should reflect the new claim, not the old one
    const expiry = new Date(store['node-a'].claimExpiry);
    expect(expiry.getTime()).toBe(t1.getTime() + 300_000);
  });

  // --- error shape ---

  it('AtomicClaimError has correct structure', () => {
    const err = new AtomicClaimError('ALREADY_CLAIMED', 'node-x', 'test detail');
    expect(err.name).toBe('AtomicClaimError');
    expect(err.code).toBe('ALREADY_CLAIMED');
    expect(err.nodeId).toBe('node-x');
    expect(err.detail).toBe('test detail');
    expect(err.message).toBe('ALREADY_CLAIMED: test detail');
    expect(err).toBeInstanceOf(Error);
  });

  // --- lock cleanup ---

  it('lock file is cleaned up after operations', () => {
    acquireClaim(tmp, 'node-a', 'agent-1', 300);
    const lockFile = join(tmp, '.roadmap', 'claims.lock');
    expect(existsSync(lockFile)).toBe(false);
  });

  it('lock file is cleaned up even on error', () => {
    acquireClaim(tmp, 'node-a', 'agent-1', 300);
    try {
      acquireClaim(tmp, 'node-a', 'agent-2', 300);
    } catch { /* expected */ }
    const lockFile = join(tmp, '.roadmap', 'claims.lock');
    expect(existsSync(lockFile)).toBe(false);
  });
});
