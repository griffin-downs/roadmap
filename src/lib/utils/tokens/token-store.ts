// @module token-store
// @exports BoundToken, writeToken, readToken, listTokens, isTokenExpired, tokenId, TOKEN_DIR
// @types BoundToken
// @entry roadmap

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export type TokenType = 'claim' | 'strategy' | 'breakglass' | 'run';

export interface BoundToken {
  schema_version: 1;
  tokenId: string;
  type: TokenType;
  subject: string;
  owner?: string;
  issuedAt: string;
  expiresAt?: string;
  boundTo: { headSha: string; treeSha?: string; runId?: string };
  scope?: string[];
  bypass?: string[];
  reason?: string;
  payload: Record<string, unknown>;
  ok: boolean;
}

export const TOKEN_DIR = '.roadmap/tokens';

/** Derive tokenId: "tok-" + sha256(type+subject+issuedAt)[0:16] */
export function tokenId(type: TokenType, subject: string, issuedAt: string): string {
  const hash = createHash('sha256').update(type + subject + issuedAt).digest('hex');
  return 'tok-' + hash.slice(0, 16);
}

function tokenPath(repoRoot: string, token: BoundToken): string {
  return join(repoRoot, TOKEN_DIR, token.type, token.tokenId + '.json');
}

function indexPath(repoRoot: string): string {
  return join(repoRoot, TOKEN_DIR, 'index.ndjson');
}

/** Write a token to .roadmap/tokens/<type>/<tokenId>.json and append to index.ndjson. */
export function writeToken(repoRoot: string, token: BoundToken): string {
  const dir = join(repoRoot, TOKEN_DIR, token.type);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const path = tokenPath(repoRoot, token);
  writeFileSync(path, JSON.stringify(token, null, 2) + '\n');

  // Append index entry
  const idx = indexPath(repoRoot);
  const entry = { tokenId: token.tokenId, type: token.type, subject: token.subject, issuedAt: token.issuedAt, ok: token.ok };
  appendFileSync(idx, JSON.stringify(entry) + '\n');

  return path;
}

/** Read a token by ID from a specific type directory. Returns null if not found. */
export function readToken(repoRoot: string, type: TokenType, id: string): BoundToken | null {
  const path = join(repoRoot, TOKEN_DIR, type, id + '.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as BoundToken;
  } catch {
    return null;
  }
}

/** List tokens, optionally filtered by type. Returns parsed tokens. */
export function listTokens(repoRoot: string, type?: TokenType): BoundToken[] {
  const base = join(repoRoot, TOKEN_DIR);
  if (!existsSync(base)) return [];

  const types: TokenType[] = type ? [type] : ['claim', 'strategy', 'breakglass', 'run'];
  const tokens: BoundToken[] = [];

  for (const t of types) {
    const dir = join(base, t);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        tokens.push(JSON.parse(readFileSync(join(dir, f), 'utf-8')) as BoundToken);
      } catch { /* skip malformed */ }
    }
  }

  return tokens;
}

/** True if token has an expiresAt and it is in the past. */
export function isTokenExpired(token: BoundToken, now = new Date()): boolean {
  if (!token.expiresAt) return false;
  return new Date(token.expiresAt) < now;
}
