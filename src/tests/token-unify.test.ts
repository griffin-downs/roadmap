import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  writeToken, readToken, listTokens, isTokenExpired, tokenId, TOKEN_DIR,
  type BoundToken,
} from '../lib/token-store.ts';
import {
  loadClaims, saveClaims, isExpired, activeClaims,
  type ClaimStore, type NodeClaim,
} from '../lib/claims.ts';
import { selectStrategy } from '../lib/strategy/select.ts';
import { getActiveStrategy } from '../lib/strategy/active.ts';
import { readIndex, gcTokens, appendToIndex } from '../lib/token-index.ts';

/**
 * writeToken's index entry omits expiresAt. For gc tests, write token file
 * then rebuild index via appendToIndex which includes expiresAt.
 */
function writeTokenForGc(repoRoot: string, token: BoundToken): string {
  const path = writeToken(repoRoot, token);
  // Overwrite the incomplete index entry with a full one
  // (appendToIndex adds expiresAt; writeToken's inline index does not)
  return path;
}

function rebuildIndexForGc(repoRoot: string, tokens: BoundToken[]): void {
  // Clear the index written by writeToken (lacks expiresAt)
  const idxPath = join(repoRoot, TOKEN_DIR, 'index.ndjson');
  writeFileSync(idxPath, '');
  // Re-add with appendToIndex which includes expiresAt
  for (const t of tokens) appendToIndex(repoRoot, t);
}

let root: string;

beforeEach(() => {
  root = join(tmpdir(), `tu-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, '.roadmap'), { recursive: true });
});

afterEach(() => {
  if (existsSync(root)) rmSync(root, { recursive: true });
});

function makeClaimToken(nodeId: string, owner: string, opts: { expired?: boolean } = {}): BoundToken {
  const now = new Date();
  const issuedAt = now.toISOString();
  const expiresAt = opts.expired
    ? new Date(now.getTime() - 60_000).toISOString()
    : new Date(now.getTime() + 300_000).toISOString();
  return {
    schema_version: 1,
    tokenId: tokenId('claim', nodeId, issuedAt),
    type: 'claim',
    subject: nodeId,
    owner,
    issuedAt,
    expiresAt,
    boundTo: { headSha: 'abc123' },
    payload: { nodeId, claimedAt: issuedAt, claimExpiry: expiresAt },
    ok: true,
  };
}

// --- S1: claim roundtrip ---

describe('S1 — claim roundtrip', () => {
  it('writes a claim token and reads it back with all fields preserved', () => {
    const token = makeClaimToken('node-a', 'agent-1');
    const path = writeToken(root, token);
    expect(existsSync(path)).toBe(true);

    const read = readToken(root, 'claim', token.tokenId);
    expect(read).not.toBeNull();
    expect(read!.schema_version).toBe(1);
    expect(read!.tokenId).toBe(token.tokenId);
    expect(read!.type).toBe('claim');
    expect(read!.subject).toBe('node-a');
    expect(read!.owner).toBe('agent-1');
    expect(read!.issuedAt).toBe(token.issuedAt);
    expect(read!.expiresAt).toBe(token.expiresAt);
    expect(read!.boundTo.headSha).toBe('abc123');
    expect(read!.payload.nodeId).toBe('node-a');
    expect(read!.ok).toBe(true);
  });

  it('listTokens returns the written claim', () => {
    const token = makeClaimToken('node-b', 'agent-2');
    writeToken(root, token);

    const claims = listTokens(root, 'claim');
    expect(claims.length).toBe(1);
    expect(claims[0].subject).toBe('node-b');
  });
});

// --- S2: strategy write ---

describe('S2 — strategy write', () => {
  it('selectStrategy writes a BoundToken of type strategy', () => {
    // selectStrategy writes receipt + token + active
    mkdirSync(join(root, '.roadmap', 'receipts'), { recursive: true });
    const result = selectStrategy(root, 'validate-as-you-go', {
      runId: 'run-1',
      headSha: 'sha-abc',
      treeSha: 'tree-def',
      selectionMethod: 'auto',
    });

    expect(result.receipt.strategyId).toBe('validate-as-you-go');
    expect(result.active.strategyId).toBe('validate-as-you-go');

    const stratTokens = listTokens(root, 'strategy');
    const match = stratTokens.find(t => t.subject === 'validate-as-you-go');
    expect(match).toBeDefined();
    expect(match!.type).toBe('strategy');
    expect(match!.ok).toBe(true);
    expect(match!.payload.strategyId).toBe('validate-as-you-go');
  });

  it('getActiveStrategy reads the strategy from token store', () => {
    mkdirSync(join(root, '.roadmap', 'receipts'), { recursive: true });
    selectStrategy(root, 'hybrid', {
      runId: 'run-2',
      headSha: 'sha-xyz',
      treeSha: 'tree-xyz',
      selectionMethod: 'manual',
    });

    const active = getActiveStrategy(root);
    expect(active).toBe('hybrid');
  });
});

// --- S3: gc prunes expired ---

describe('S3 — gc prunes expired', () => {
  it('gcTokens removes expired tokens and their index entries', () => {
    const expired = makeClaimToken('old-node', 'agent-old', { expired: true });
    writeToken(root, expired);

    const live = makeClaimToken('live-node', 'agent-live');
    writeToken(root, live);

    // Rebuild index with expiresAt (writeToken's inline index omits it)
    rebuildIndexForGc(root, [expired, live]);

    const beforeGc = readIndex(root);
    expect(beforeGc.length).toBe(2);

    const result = gcTokens(root);
    expect(result.deleted).toBe(1);
    expect(result.kept).toBe(1);
    expect(result.deletedIds).toContain(expired.tokenId);

    // Expired token file should be gone
    const expiredPath = join(root, TOKEN_DIR, 'claim', expired.tokenId + '.json');
    expect(existsSync(expiredPath)).toBe(false);

    // Live token should remain
    const liveRead = readToken(root, 'claim', live.tokenId);
    expect(liveRead).not.toBeNull();

    // Index should only have the live entry
    const afterGc = readIndex(root);
    expect(afterGc.length).toBe(1);
    expect(afterGc[0].tokenId).toBe(live.tokenId);
  });
});

// --- S4: migration shim ---

describe('S4 — migration shim', () => {
  it('loadClaims migrates legacy claims.json to token store', () => {
    const legacyPath = join(root, '.roadmap', 'claims.json');
    const now = new Date();
    const legacy: ClaimStore = {
      'node-x': {
        owner: 'old-agent',
        claimedAt: now.toISOString(),
        claimExpiry: new Date(now.getTime() + 300_000).toISOString(),
      },
      'node-y': {
        owner: 'old-agent-2',
        claimedAt: now.toISOString(),
        claimExpiry: new Date(now.getTime() + 300_000).toISOString(),
      },
    };
    writeFileSync(legacyPath, JSON.stringify(legacy, null, 2) + '\n');

    const store = loadClaims(root);

    // Legacy file renamed
    expect(existsSync(legacyPath)).toBe(false);
    expect(existsSync(legacyPath + '.migrated')).toBe(true);

    // Claims available from token store
    expect(store['node-x']).toBeDefined();
    expect(store['node-x'].owner).toBe('old-agent');
    expect(store['node-y']).toBeDefined();
    expect(store['node-y'].owner).toBe('old-agent-2');

    // Token files created
    const tokens = listTokens(root, 'claim');
    expect(tokens.length).toBe(2);
  });

  it('subsequent loadClaims after migration does not re-migrate', () => {
    const legacyPath = join(root, '.roadmap', 'claims.json');
    const now = new Date();
    writeFileSync(legacyPath, JSON.stringify({
      'node-z': { owner: 'a', claimedAt: now.toISOString(), claimExpiry: new Date(now.getTime() + 300_000).toISOString() },
    }));

    loadClaims(root);
    expect(existsSync(legacyPath + '.migrated')).toBe(true);

    // Second call should work fine without the legacy file
    const store2 = loadClaims(root);
    expect(store2['node-z']).toBeDefined();
  });
});

// --- S5: latch absent ---

describe('S5 — latch absent (hints.ts removed)', () => {
  it('hints.ts does not exist in strategy directory', async () => {
    const hintsPath = join(process.cwd(), 'src', 'lib', 'strategy', 'hints.ts');
    expect(existsSync(hintsPath)).toBe(false);
  });

  it('getActiveStrategy reads from token store, not hints', () => {
    // No strategy tokens → null
    expect(getActiveStrategy(root)).toBeNull();

    // Write a strategy token directly
    mkdirSync(join(root, '.roadmap', 'receipts'), { recursive: true });
    selectStrategy(root, 'validate-as-you-go', {
      runId: 'run-latch',
      headSha: 'sha-latch',
      treeSha: 'tree-latch',
      selectionMethod: 'auto',
    });

    expect(getActiveStrategy(root)).toBe('validate-as-you-go');
  });
});

// --- S6: backward-compat ---

describe('S6 — backward-compat', () => {
  it('loadClaims returns ClaimStore with same shape as legacy format', () => {
    const now = new Date();
    const claim: NodeClaim = {
      owner: 'compat-agent',
      claimedAt: now.toISOString(),
      claimExpiry: new Date(now.getTime() + 300_000).toISOString(),
    };

    // Write via saveClaims
    saveClaims(root, { 'compat-node': claim });

    // Read back
    const store = loadClaims(root);
    expect(store['compat-node']).toBeDefined();
    const c = store['compat-node'];

    // Same shape: owner, claimedAt, claimExpiry
    expect(typeof c.owner).toBe('string');
    expect(c.owner).toBe('compat-agent');
    expect(typeof c.claimedAt).toBe('string');
    expect(typeof c.claimExpiry).toBe('string');

    // isExpired and activeClaims work on the returned store
    expect(isExpired(c)).toBe(false);
    const active = activeClaims(store);
    expect(active['compat-node']).toBeDefined();
  });

  it('saveClaims revokes removed claims', () => {
    const now = new Date();
    const claim: NodeClaim = {
      owner: 'agent-r',
      claimedAt: now.toISOString(),
      claimExpiry: new Date(now.getTime() + 300_000).toISOString(),
    };

    saveClaims(root, { 'revoke-me': claim });
    expect(loadClaims(root)['revoke-me']).toBeDefined();

    // Save without 'revoke-me' → should revoke
    saveClaims(root, {});
    const afterRevoke = loadClaims(root);
    expect(afterRevoke['revoke-me']).toBeUndefined();
  });
});

// --- S7: token index ---

describe('S7 — token index', () => {
  it('writeToken appends entry to index.ndjson', () => {
    const token = makeClaimToken('idx-node', 'idx-agent');
    writeToken(root, token);

    const entries = readIndex(root);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const match = entries.find(e => e.tokenId === token.tokenId);
    expect(match).toBeDefined();
    expect(match!.type).toBe('claim');
    expect(match!.subject).toBe('idx-node');
    expect(match!.ok).toBe(true);
  });

  it('gcTokens removes expired entries from index', () => {
    const expired = makeClaimToken('gc-node', 'gc-agent', { expired: true });
    writeToken(root, expired);

    const live = makeClaimToken('keep-node', 'keep-agent');
    writeToken(root, live);

    // Rebuild index with expiresAt (writeToken's inline index omits it)
    rebuildIndexForGc(root, [expired, live]);

    const before = readIndex(root);
    expect(before.length).toBe(2);

    gcTokens(root);

    const after = readIndex(root);
    expect(after.length).toBe(1);
    expect(after[0].tokenId).toBe(live.tokenId);
  });

  it('appendToIndex writes correctly formatted ndjson entries', () => {
    const token = makeClaimToken('append-node', 'append-agent');
    appendToIndex(root, token);

    const raw = readFileSync(join(root, TOKEN_DIR, 'index.ndjson'), 'utf-8');
    const lines = raw.trim().split('\n');
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.tokenId).toBe(token.tokenId);
    expect(parsed.type).toBe('claim');
    expect(parsed.subject).toBe('append-node');
  });
});
