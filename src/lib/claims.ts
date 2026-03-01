// @module claims
// Per-node ownership for parallel batch execution.
// Store: .roadmap/tokens/claim/ (BoundToken format).
// Migration shim reads legacy .roadmap/claims.json on first load.

import { existsSync, readFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import {
  type BoundToken, type TokenType,
  writeToken, listTokens, isTokenExpired, tokenId, TOKEN_DIR,
} from './token-store.ts';

export interface NodeClaim {
  owner: string;
  claimedAt: string;   // ISO 8601
  claimExpiry: string; // ISO 8601
}

export type ClaimStore = Record<string, NodeClaim>;

// --- headSha helper ---

function currentHeadSha(repoRoot: string): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

// --- migration shim ---

function migrateLegacyClaims(repoRoot: string): void {
  const legacyPath = join(repoRoot, '.roadmap', 'claims.json');
  if (!existsSync(legacyPath)) return;

  let legacy: Record<string, NodeClaim>;
  try {
    legacy = JSON.parse(readFileSync(legacyPath, 'utf-8'));
  } catch {
    // Malformed — rename and bail
    renameSync(legacyPath, legacyPath + '.migrated');
    return;
  }

  const headSha = currentHeadSha(repoRoot);

  for (const [nodeId, claim] of Object.entries(legacy)) {
    const token: BoundToken = {
      schema_version: 1,
      tokenId: tokenId('claim' as TokenType, nodeId, claim.claimedAt),
      type: 'claim',
      subject: nodeId,
      owner: claim.owner,
      issuedAt: claim.claimedAt,
      expiresAt: claim.claimExpiry,
      boundTo: { headSha },
      payload: { nodeId, claimedAt: claim.claimedAt, claimExpiry: claim.claimExpiry },
      ok: true,
    };
    writeToken(repoRoot, token);
  }

  renameSync(legacyPath, legacyPath + '.migrated');
}

// --- token → NodeClaim conversion ---

function tokenToClaim(token: BoundToken): NodeClaim {
  return {
    owner: token.owner ?? 'unknown',
    claimedAt: token.issuedAt,
    claimExpiry: token.expiresAt ?? token.issuedAt,
  };
}

// --- public API (unchanged signatures) ---

export function loadClaims(repoRoot: string): ClaimStore {
  migrateLegacyClaims(repoRoot);

  const tokens = listTokens(repoRoot, 'claim');
  const store: ClaimStore = {};

  // Latest token per subject wins (tokens/claim/ may have multiple per node)
  for (const t of tokens) {
    if (!t.ok) continue;
    const existing = store[t.subject];
    if (!existing || t.issuedAt > existing.claimedAt) {
      store[t.subject] = tokenToClaim(t);
    }
  }

  return store;
}

export function saveClaims(repoRoot: string, store: ClaimStore): void {
  const headSha = currentHeadSha(repoRoot);
  const existing = loadClaimsRaw(repoRoot);

  for (const [nodeId, claim] of Object.entries(store)) {
    // Only write if new or changed
    const prev = existing[nodeId];
    if (prev && prev.claimedAt === claim.claimedAt && prev.owner === claim.owner) continue;

    const token: BoundToken = {
      schema_version: 1,
      tokenId: tokenId('claim' as TokenType, nodeId, claim.claimedAt),
      type: 'claim',
      subject: nodeId,
      owner: claim.owner,
      issuedAt: claim.claimedAt,
      expiresAt: claim.claimExpiry,
      boundTo: { headSha },
      payload: { nodeId, claimedAt: claim.claimedAt, claimExpiry: claim.claimExpiry },
      ok: true,
    };
    writeToken(repoRoot, token);
  }

  // Revoke removed claims
  const tokens = listTokens(repoRoot, 'claim');
  for (const t of tokens) {
    if (!t.ok) continue;
    if (!(t.subject in store)) {
      const revoked: BoundToken = { ...t, ok: false };
      writeToken(repoRoot, revoked);
    }
  }
}

/** Internal: load without migration (avoids recursion in saveClaims). */
function loadClaimsRaw(repoRoot: string): ClaimStore {
  const tokens = listTokens(repoRoot, 'claim');
  const store: ClaimStore = {};
  for (const t of tokens) {
    if (!t.ok) continue;
    const existing = store[t.subject];
    if (!existing || t.issuedAt > existing.claimedAt) {
      store[t.subject] = tokenToClaim(t);
    }
  }
  return store;
}

export function isExpired(claim: NodeClaim, now = new Date()): boolean {
  return new Date(claim.claimExpiry) < now;
}

/** Returns only non-expired entries. Does not mutate the store. */
export function activeClaims(store: ClaimStore, now = new Date()): ClaimStore {
  const out: ClaimStore = {};
  for (const [id, c] of Object.entries(store)) {
    if (!isExpired(c, now)) out[id] = c;
  }
  return out;
}

// --- assignBatch: round-robin assign batchRemaining to owners ---

export interface ConflictPair {
  file: string;
  writers: string[];
}

export interface AssignResult {
  assignments: Record<string, string>;  // nodeId → owner
  skipped: Record<string, string>;      // nodeId → reason
}

/**
 * Round-robin assign nodes to owners, respecting existing claims and conflicts.
 * - Skips nodes with active (non-expired) claims
 * - Avoids co-assigning conflicting nodes to the same owner
 * - All new claims returned as a merged store (caller writes atomically)
 */
export function assignBatch(
  batchRemaining: readonly string[],
  owners: readonly string[],
  existingStore: ClaimStore,
  conflicts: readonly ConflictPair[],
  ttlSeconds: number,
  now = new Date(),
): { store: ClaimStore; result: AssignResult } {
  if (owners.length === 0) throw new Error('--owners must be non-empty');

  const store: ClaimStore = { ...existingStore };
  const assignments: Record<string, string> = {};
  const skipped: Record<string, string> = {};

  // Build conflict index: nodeId → set of nodeIds it conflicts with
  const conflictIndex = new Map<string, Set<string>>();
  for (const c of conflicts) {
    for (const w of c.writers) {
      if (!conflictIndex.has(w)) conflictIndex.set(w, new Set());
      for (const other of c.writers) {
        if (other !== w) conflictIndex.get(w)!.add(other);
      }
    }
  }

  // Track which nodes are assigned to each owner (for conflict checks)
  const ownerNodes = new Map<string, Set<string>>();
  for (const o of owners) ownerNodes.set(o, new Set());

  let robin = 0;
  const claimedAt = now.toISOString();
  const claimExpiry = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

  for (const nodeId of batchRemaining) {
    // Skip nodes with active claims
    const existing = store[nodeId];
    if (existing && !isExpired(existing, now)) {
      skipped[nodeId] = `active claim by ${existing.owner}`;
      // Track existing claim owner for conflict awareness
      const existingOwnerSet = ownerNodes.get(existing.owner);
      if (existingOwnerSet) existingOwnerSet.add(nodeId);
      continue;
    }

    // Find a non-conflicting owner via round-robin
    const conflictsOf = conflictIndex.get(nodeId);
    let assigned = false;

    for (let attempt = 0; attempt < owners.length; attempt++) {
      const candidateOwner = owners[(robin + attempt) % owners.length];
      const candidateNodes = ownerNodes.get(candidateOwner)!;

      // Check if assigning nodeId to candidateOwner creates a conflict
      let hasConflict = false;
      if (conflictsOf) {
        for (const conflictNode of conflictsOf) {
          if (candidateNodes.has(conflictNode)) {
            hasConflict = true;
            break;
          }
        }
      }

      if (!hasConflict) {
        assignments[nodeId] = candidateOwner;
        store[nodeId] = { owner: candidateOwner, claimedAt, claimExpiry };
        candidateNodes.add(nodeId);
        robin = (robin + attempt + 1) % owners.length;
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      // All owners conflict — assign to round-robin default anyway, note the conflict
      const fallbackOwner = owners[robin % owners.length];
      assignments[nodeId] = fallbackOwner;
      store[nodeId] = { owner: fallbackOwner, claimedAt, claimExpiry };
      ownerNodes.get(fallbackOwner)!.add(nodeId);
      robin = (robin + 1) % owners.length;
    }
  }

  return { store, result: { assignments, skipped } };
}

export interface ClaimAnnotation extends NodeClaim {
  expired: boolean;
}

/** Annotate a set of node IDs with their claim status from the store. */
export function annotateWithClaims(
  nodeIds: readonly string[],
  store: ClaimStore,
  now = new Date(),
): Record<string, ClaimAnnotation> {
  const out: Record<string, ClaimAnnotation> = {};
  for (const id of nodeIds) {
    if (id in store) {
      out[id] = { ...store[id], expired: isExpired(store[id], now) };
    }
  }
  return out;
}
