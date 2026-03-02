// @module token-index
// @exports readIndex, gcTokens
// @entry roadmap

import { existsSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { listTokens, isTokenExpired } from './utils/tokens/token-store.ts';
import type { TokenType } from './utils/tokens/token-store.ts';

export interface IndexEntry {
  tokenId: string;
  type: TokenType;
  subject: string;
  issuedAt: string;
  ok: boolean;
}

/** Read index.ndjson and return parsed entries. Returns [] if index doesn't exist. */
export function readIndex(repoRoot: string): IndexEntry[] {
  const indexPath = join(repoRoot, '.roadmap', 'tokens', 'index.ndjson');
  if (!existsSync(indexPath)) return [];

  const entries: IndexEntry[] = [];
  try {
    const content = readFileSync(indexPath, 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line) as IndexEntry);
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // Return empty on read failure
  }

  return entries;
}

/** Garbage collect expired tokens. Removes expired token files and returns stats. */
export function gcTokens(repoRoot: string): {
  deleted: number;
  kept: number;
  deletedIds: string[];
} {
  const tokens = listTokens(repoRoot);
  const now = new Date();
  const deletedIds: string[] = [];
  let kept = 0;

  for (const token of tokens) {
    if (isTokenExpired(token, now)) {
      // Remove the token file
      const path = join(repoRoot, '.roadmap', 'tokens', token.type, token.tokenId + '.json');
      try {
        if (existsSync(path)) rmSync(path);
        deletedIds.push(token.tokenId);
      } catch {
        // Continue on deletion error
      }
    } else {
      kept++;
    }
  }

  return {
    deleted: deletedIds.length,
    kept,
    deletedIds,
  };
}
