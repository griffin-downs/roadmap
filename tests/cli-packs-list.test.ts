import { describe, it, expect } from 'vitest';
import { cmdPacksList, formatPacksText, formatPacksJson, PackMetadata } from '../src/cli/commands/packs-list';

describe('cmdPacksList', () => {
  it('returns text format output by default', async () => {
    const result = await cmdPacksList('.', 'text');

    expect(typeof result).toBe('string');
    // Should be either empty state or contain pack names
    expect(result).toMatch(/^\(no packs discovered\)|[a-zA-Z0-9]/);
  });

  it('returns json format when requested', async () => {
    const result = await cmdPacksList('.', 'json');

    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('packs');
    expect(Array.isArray(parsed.packs)).toBe(true);
  });

  it('formats text output correctly', () => {
    const packs: PackMetadata[] = [
      { name: 'core', modules: 3, size: 46080 }, // 45KB exactly
      { name: 'utils', modules: 2, size: 12288 }, // 12KB exactly
    ];

    const result = formatPacksText(packs);

    expect(result).toContain('core');
    expect(result).toContain('3 modules');
    expect(result).toContain('45KB');
    expect(result).toContain('utils');
    expect(result).toContain('2 modules');
    expect(result).toContain('12KB');
  });

  it('formats empty pack list in text', () => {
    const result = formatPacksText([]);

    expect(result).toBe('(no packs discovered)');
  });

  it('formats json output correctly', () => {
    const packs: PackMetadata[] = [
      { name: 'core', modules: 3, size: 45000 },
    ];

    const result = formatPacksJson(packs);
    const parsed = JSON.parse(result);

    expect(parsed.packs).toHaveLength(1);
    expect(parsed.packs[0]).toEqual({ name: 'core', modules: 3, size: 45000 });
  });

  it('handles zero-size packs', () => {
    const packs: PackMetadata[] = [
      { name: 'empty', modules: 1, size: 0 },
    ];

    const result = formatPacksText(packs);

    expect(result).toContain('empty');
    expect(result).toContain('0KB');
  });
});
