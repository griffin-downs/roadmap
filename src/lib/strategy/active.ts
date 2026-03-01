// @module strategy
// @exports getActiveStrategy, readActiveStrategy, writeActiveStrategy, isLatched, readActiveLatch, writeLatch, clearLatch, shouldLatch, detectHint, HINT_TOKENS
// @types -
// @entry roadmap

import { listTokens, writeToken, isTokenExpired, tokenId } from '../utils/tokens/token-store.ts';
import type { BoundToken } from '../utils/tokens/token-store.ts';
import type { ActiveStrategy } from './schema.ts';

const HINT_TOKENS = [
  'hallucinate',
  'swarm',
  'parallel',
  'lookahead',
  'fidelity',
  'mass parallel',
  'validate later',
] as const;

// -- strategy tokens (non-latch) --

function findActiveStrategyToken(repoRoot: string): BoundToken | null {
  const tokens = listTokens(repoRoot, 'strategy');
  const now = new Date();
  const strategyTokens = tokens
    .filter(t => t.payload.isLatch !== true)
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  const mostRecent = strategyTokens[0];
  if (!mostRecent || !mostRecent.ok || isTokenExpired(mostRecent, now)) return null;
  return mostRecent;
}

/** Find the most recent non-expired ok=true strategy token subject, or null. */
export function getActiveStrategy(repoRoot: string): string | null {
  const t = findActiveStrategyToken(repoRoot);
  return t ? t.subject : null;
}

/** Read the active strategy as ActiveStrategy shape (compat shim). */
export function readActiveStrategy(repoRoot: string): ActiveStrategy | undefined {
  const t = findActiveStrategyToken(repoRoot);
  if (!t) return undefined;
  return {
    schema_version: 1,
    strategyId: t.subject,
    runId: (t.boundTo.runId ?? '') as string,
    latchedAt: t.issuedAt,
    boundAt: t.issuedAt,
    receiptPath: (t.payload.receiptPath ?? '') as string,
  };
}

/** Write an ActiveStrategy as a BoundToken. */
export function writeActiveStrategy(repoRoot: string, strategy: ActiveStrategy): void {
  const issuedAt = strategy.boundAt || new Date().toISOString();
  const token: BoundToken = {
    schema_version: 1,
    tokenId: tokenId('strategy', strategy.strategyId, issuedAt),
    type: 'strategy',
    subject: strategy.strategyId,
    issuedAt,
    boundTo: { headSha: '', runId: strategy.runId },
    payload: { strategyId: strategy.strategyId, receiptPath: strategy.receiptPath },
    ok: true,
  };
  writeToken(repoRoot, token);
}

// -- hint detection (moved from hints.ts) --

export function detectHint(text: string): { latched: boolean; matchedTokens: string[] } {
  const lower = text.toLowerCase();
  const matchedTokens = HINT_TOKENS.filter(token => lower.includes(token));
  return { latched: matchedTokens.length > 0, matchedTokens };
}

export { HINT_TOKENS };

/** Check if note contains strategy hint tokens. */
export function shouldLatch(note: string): boolean {
  return detectHint(note).latched;
}

// -- latch tokens --

/** Read latch state from most recent latch token (ok or not). */
export function readActiveLatch(repoRoot: string): { latched: boolean; matchedTokens: string[]; latchedAt?: string } | undefined {
  const tokens = listTokens(repoRoot, 'strategy');
  const latchTokens = tokens
    .filter(t => t.payload.isLatch === true)
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  if (latchTokens.length === 0) return undefined;
  const t = latchTokens[0];
  if (!t.ok) return undefined;
  return {
    latched: true,
    matchedTokens: (t.payload.matchedTokens ?? []) as string[],
    latchedAt: t.issuedAt,
  };
}

/** Write a latch as a BoundToken with payload.isLatch=true. */
export function writeLatch(repoRoot: string, matchedTokens: string[]): void {
  const issuedAt = new Date().toISOString();
  const token: BoundToken = {
    schema_version: 1,
    tokenId: tokenId('strategy', 'latch', issuedAt),
    type: 'strategy',
    subject: 'latch',
    issuedAt,
    boundTo: { headSha: '' },
    payload: { isLatch: true, matchedTokens },
    ok: true,
  };
  writeToken(repoRoot, token);
}

/** Clear latch — write an ok=false latch token to supersede. */
export function clearLatch(repoRoot: string): void {
  const issuedAt = new Date().toISOString();
  const token: BoundToken = {
    schema_version: 1,
    tokenId: tokenId('strategy', 'latch-clear', issuedAt),
    type: 'strategy',
    subject: 'latch',
    issuedAt,
    boundTo: { headSha: '' },
    payload: { isLatch: true, matchedTokens: [] },
    ok: false,
  };
  writeToken(repoRoot, token);
}

/** Check if latched — true if most recent latch token is ok=true. */
export function isLatched(repoRoot: string): boolean {
  const latch = readActiveLatch(repoRoot);
  return latch?.latched === true;
}
