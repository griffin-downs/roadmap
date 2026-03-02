import { readIndex, gcTokens } from '../src/lib/token-index.ts';
import { writeToken } from '../src/lib/token-store.ts';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const testDir = '.test-tokens-' + Date.now();

describe('token-index', () => {
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('readIndex returns empty array when index does not exist', () => {
    const entries = readIndex(testDir);
    expect(entries).toEqual([]);
  });

  it('readIndex parses NDJSON index entries', () => {
    const token = {
      schema_version: 1 as const,
      tokenId: 'tok-test123',
      type: 'claim' as const,
      subject: 'test-user',
      issuedAt: new Date().toISOString(),
      boundTo: { headSha: 'abc123' },
      ok: true,
      payload: {},
    };
    writeToken(testDir, token);

    const entries = readIndex(testDir);
    expect(entries.length).toBe(1);
    expect(entries[0].tokenId).toBe('tok-test123');
    expect(entries[0].type).toBe('claim');
  });

  it('gcTokens handles missing token directory', () => {
    const result = gcTokens(testDir);
    expect(result.deleted).toBe(0);
    expect(result.kept).toBe(0);
    expect(result.deletedIds).toEqual([]);
  });

  it('gcTokens skips non-expired tokens', () => {
    const future = new Date();
    future.setHours(future.getHours() + 1);

    const token = {
      schema_version: 1 as const,
      tokenId: 'tok-future',
      type: 'claim' as const,
      subject: 'test-user',
      issuedAt: new Date().toISOString(),
      expiresAt: future.toISOString(),
      boundTo: { headSha: 'abc123' },
      ok: true,
      payload: {},
    };
    writeToken(testDir, token);

    const result = gcTokens(testDir);
    expect(result.deleted).toBe(0);
    expect(result.kept).toBe(1);
  });
});
