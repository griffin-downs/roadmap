// @module claims
// @exports acquireClaim, releaseClaim, renewClaim, tryAcquire, AtomicClaimError
// @entry roadmap/claims

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { loadClaims, saveClaims, isExpired, type NodeClaim, type ClaimStore } from './claims.ts';

export class AtomicClaimError extends Error {
  constructor(
    public readonly code: 'ALREADY_CLAIMED' | 'NOT_OWNER' | 'EXPIRED' | 'LOCK_CONTENTION',
    public readonly nodeId: string,
    public readonly detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'AtomicClaimError';
  }
}

export interface AcquireResult {
  nodeId: string;
  owner: string;
  claimedAt: string;
  claimExpiry: string;
  lockId: string;
}

export interface ReleaseResult {
  released: true;
  nodeId: string;
  previousOwner: string;
}

export interface RenewResult {
  nodeId: string;
  owner: string;
  claimExpiry: string;
  renewed: true;
}

// --- filesystem lock for atomic claim mutations ---

const LOCK_TIMEOUT_MS = 5000;
const LOCK_RETRY_MS = 50;

function lockPath(repoRoot: string): string {
  return join(repoRoot, '.roadmap', 'claims.lock');
}

/** Acquire an advisory lock via atomic rename. Returns a lockId for release. */
function acquireLock(repoRoot: string): string {
  const lock = lockPath(repoRoot);
  const lockId = randomBytes(8).toString('hex');
  const tmpLock = lock + '.' + lockId;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  mkdirSync(dirname(lock), { recursive: true });

  while (Date.now() < deadline) {
    try {
      // Write a temp file, then rename atomically — rename fails if target exists on most fs
      writeFileSync(tmpLock, JSON.stringify({ lockId, pid: process.pid, ts: Date.now() }), { flag: 'wx' });
      try {
        // Use rename as atomic create-if-not-exists
        if (existsSync(lock)) {
          // Check if stale (older than 2x timeout)
          try {
            const existing = JSON.parse(readFileSync(lock, 'utf-8'));
            if (Date.now() - existing.ts > LOCK_TIMEOUT_MS * 2) {
              // Stale lock — force acquire
              renameSync(tmpLock, lock);
              return lockId;
            }
          } catch {
            // Malformed lock file — take over
            renameSync(tmpLock, lock);
            return lockId;
          }
          // Lock held by someone else — retry
          try { require('node:fs').unlinkSync(tmpLock); } catch { /* ignore */ }
          busyWait(LOCK_RETRY_MS);
          continue;
        }
        renameSync(tmpLock, lock);
        return lockId;
      } catch {
        try { require('node:fs').unlinkSync(tmpLock); } catch { /* ignore */ }
        busyWait(LOCK_RETRY_MS);
      }
    } catch {
      // wx flag failed — tmpLock already exists (unlikely but handle)
      busyWait(LOCK_RETRY_MS);
    }
  }

  throw new AtomicClaimError('LOCK_CONTENTION', '', `Could not acquire claims lock within ${LOCK_TIMEOUT_MS}ms`);
}

function releaseLock(repoRoot: string, lockId: string): void {
  const lock = lockPath(repoRoot);
  try {
    const content = readFileSync(lock, 'utf-8');
    const parsed = JSON.parse(content);
    if (parsed.lockId === lockId) {
      require('node:fs').unlinkSync(lock);
    }
  } catch { /* already released or different owner */ }
}

function busyWait(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* spin */ }
}

// --- atomic claim operations ---

/**
 * Acquire a claim on a node. Fails if the node is already claimed by another
 * non-expired owner. Uses filesystem locking for atomicity.
 */
export function acquireClaim(
  repoRoot: string,
  nodeId: string,
  owner: string,
  ttlSeconds: number,
  now = new Date(),
): AcquireResult {
  const lockId = acquireLock(repoRoot);
  try {
    const store = loadClaims(repoRoot);
    const existing = store[nodeId];

    if (existing && !isExpired(existing, now)) {
      if (existing.owner === owner) {
        // Re-claim by same owner — new claimedAt so token store picks up the update
        const claimedAt = now.toISOString();
        const claimExpiry = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
        store[nodeId] = { owner, claimedAt, claimExpiry };
        saveClaims(repoRoot, store);
        return { nodeId, owner, claimedAt, claimExpiry, lockId: '' };
      }
      throw new AtomicClaimError(
        'ALREADY_CLAIMED',
        nodeId,
        `Node claimed by "${existing.owner}" until ${existing.claimExpiry}`,
      );
    }

    const claimedAt = now.toISOString();
    const claimExpiry = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    store[nodeId] = { owner, claimedAt, claimExpiry };
    saveClaims(repoRoot, store);

    return { nodeId, owner, claimedAt, claimExpiry, lockId: '' };
  } finally {
    releaseLock(repoRoot, lockId);
  }
}

/**
 * Release a claim. Only the current owner can release. Fails if the claim
 * is held by a different owner.
 */
export function releaseClaim(
  repoRoot: string,
  nodeId: string,
  owner: string,
  now = new Date(),
): ReleaseResult {
  const lockId = acquireLock(repoRoot);
  try {
    const store = loadClaims(repoRoot);
    const existing = store[nodeId];

    if (!existing) {
      return { released: true, nodeId, previousOwner: '' };
    }

    if (!isExpired(existing, now) && existing.owner !== owner) {
      throw new AtomicClaimError(
        'NOT_OWNER',
        nodeId,
        `Claim held by "${existing.owner}", cannot release as "${owner}"`,
      );
    }

    const previousOwner = existing.owner;
    delete store[nodeId];
    saveClaims(repoRoot, store);

    return { released: true, nodeId, previousOwner };
  } finally {
    releaseLock(repoRoot, lockId);
  }
}

/**
 * Renew (extend) an existing claim's TTL. Only the current owner can renew.
 * Expired claims cannot be renewed — must re-acquire.
 */
export function renewClaim(
  repoRoot: string,
  nodeId: string,
  owner: string,
  ttlSeconds: number,
  now = new Date(),
): RenewResult {
  const lockId = acquireLock(repoRoot);
  try {
    const store = loadClaims(repoRoot);
    const existing = store[nodeId];

    if (!existing) {
      throw new AtomicClaimError('EXPIRED', nodeId, 'No claim exists to renew');
    }

    if (isExpired(existing, now)) {
      throw new AtomicClaimError('EXPIRED', nodeId, `Claim expired at ${existing.claimExpiry}`);
    }

    if (existing.owner !== owner) {
      throw new AtomicClaimError(
        'NOT_OWNER',
        nodeId,
        `Claim held by "${existing.owner}", cannot renew as "${owner}"`,
      );
    }

    const claimExpiry = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    store[nodeId] = { ...existing, claimExpiry };
    saveClaims(repoRoot, store);

    return { nodeId, owner, claimExpiry, renewed: true };
  } finally {
    releaseLock(repoRoot, lockId);
  }
}

/**
 * Non-throwing acquire. Returns the result or null if the claim is already held.
 */
export function tryAcquire(
  repoRoot: string,
  nodeId: string,
  owner: string,
  ttlSeconds: number,
  now = new Date(),
): AcquireResult | null {
  try {
    return acquireClaim(repoRoot, nodeId, owner, ttlSeconds, now);
  } catch (e) {
    if (e instanceof AtomicClaimError && e.code === 'ALREADY_CLAIMED') return null;
    throw e;
  }
}
