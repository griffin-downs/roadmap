// @module token-index
// @exports IndexEntry, appendToIndex, readIndex, gcTokens, GcResult
// @types IndexEntry, GcResult
// @entry roadmap

import { existsSync, readFileSync, writeFileSync, appendFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { BoundToken, TokenType } from './token-store.ts';
import { readToken, TOKEN_DIR } from './token-store.ts';

export interface IndexEntry {
  tokenId: string;
  type: TokenType;
  subject: string;
  issuedAt: string;
  expiresAt?: string;
  ok: boolean;
}

export interface GcResult {
  deleted: number;
  kept: number;
  deletedIds: string[];
}

function indexPath(repoRoot: string): string {
  return join(repoRoot, TOKEN_DIR, 'index.ndjson');
}

/** Append a single token's index entry to index.ndjson. */
export function appendToIndex(repoRoot: string, token: BoundToken): void {
  const p = indexPath(repoRoot);
  const dir = dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const entry: IndexEntry = {
    tokenId: token.tokenId,
    type: token.type,
    subject: token.subject,
    issuedAt: token.issuedAt,
    expiresAt: token.expiresAt,
    ok: token.ok,
  };
  appendFileSync(p, JSON.stringify(entry) + '\n');
}

/** Read all index entries from index.ndjson. */
export function readIndex(repoRoot: string): IndexEntry[] {
  const p = indexPath(repoRoot);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf-8')
    .trim().split('\n').filter(Boolean)
    .map(line => JSON.parse(line) as IndexEntry);
}

/** Delete expired token files and rewrite index without them. */
export function gcTokens(repoRoot: string, now = new Date()): GcResult {
  const entries = readIndex(repoRoot);
  const kept: IndexEntry[] = [];
  const deletedIds: string[] = [];

  for (const entry of entries) {
    if (entry.expiresAt && new Date(entry.expiresAt) < now) {
      // Delete the token file
      const filePath = join(repoRoot, TOKEN_DIR, entry.type, entry.tokenId + '.json');
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
      deletedIds.push(entry.tokenId);
    } else {
      kept.push(entry);
    }
  }

  // Rewrite index with only kept entries
  const p = indexPath(repoRoot);
  writeFileSync(p, kept.map(e => JSON.stringify(e)).join('\n') + (kept.length > 0 ? '\n' : ''));

  return { deleted: deletedIds.length, kept: kept.length, deletedIds };
}
