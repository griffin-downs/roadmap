import { describe, it, expect } from 'vitest';
import { cmdPacksShow } from '../src/cli/commands/packs-show';

describe('cmdPacksShow', () => {
  it('returns pack metadata response', () => {
    const result = cmdPacksShow('core', 'test show');

    expect(result).toHaveProperty('cmd', 'packs.show');
    expect(result).toHaveProperty('name', 'core');
    expect(result).toHaveProperty('manifest');
    expect(result.manifest).toHaveProperty('exports');
  });

  it('provides manifest with expected exports', () => {
    const result = cmdPacksShow('core', 'test');

    expect(result.manifest.exports).toContain('define');
    expect(result.manifest.exports).toContain('verify');
    expect(result.manifest.exports).toContain('orient');
  });

  it('marks discovery as ready', () => {
    const result = cmdPacksShow('core', 'test');

    expect(result).toHaveProperty('discoveryReady', true);
  });
});
