import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadFleetContext } from '../src/runtime/fleet.ts';

let compilerDir: string;
let repoADir: string;
let repoBDir: string;

beforeEach(() => {
  compilerDir = mkdtempSync(join(tmpdir(), 'fleet-compiler-'));
  repoADir = mkdtempSync(join(tmpdir(), 'fleet-repo-a-'));
  repoBDir = mkdtempSync(join(tmpdir(), 'fleet-repo-b-'));

  // Set up compiler .roadmap
  mkdirSync(join(compilerDir, '.roadmap'), { recursive: true });
  writeFileSync(join(compilerDir, '.roadmap', 'completed.json'), '{}');

  // Set up repo A with a head.json
  mkdirSync(join(repoADir, '.roadmap'), { recursive: true });
  writeFileSync(join(repoADir, '.roadmap', 'head.json'), JSON.stringify({
    id: 'test-dag', desc: 'test', init: 'init', term: 'term',
    nodes: { init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [] }, term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['init'] } },
  }));
  writeFileSync(join(repoADir, '.roadmap', 'completed.json'), '{}');

  // Repo B has no .roadmap
});

afterEach(() => {
  rmSync(compilerDir, { recursive: true, force: true });
  rmSync(repoADir, { recursive: true, force: true });
  rmSync(repoBDir, { recursive: true, force: true });
});

describe('loadFleetContext', () => {
  it('throws when no fleet.json', () => {
    expect(() => loadFleetContext(compilerDir)).toThrow('No fleet.json');
  });

  it('loads fleet with valid repos', () => {
    writeFileSync(join(compilerDir, '.roadmap', 'fleet.json'), JSON.stringify({
      compiler: '.',
      repos: [{ name: 'repo-a', path: repoADir }],
    }));

    const fleet = loadFleetContext(compilerDir);
    expect(fleet.manifest.repos).toHaveLength(1);
    expect(fleet.repos[0].context).not.toBeNull();
    expect(fleet.repos[0].warning).toBeNull();
  });

  it('warns on missing repo directory', () => {
    writeFileSync(join(compilerDir, '.roadmap', 'fleet.json'), JSON.stringify({
      compiler: '.',
      repos: [{ name: 'ghost', path: '/nonexistent/path/ghost' }],
    }));

    const fleet = loadFleetContext(compilerDir);
    expect(fleet.repos[0].context).toBeNull();
    expect(fleet.repos[0].warning).toContain('repo not found');
  });

  it('warns on repo without head.json', () => {
    writeFileSync(join(compilerDir, '.roadmap', 'fleet.json'), JSON.stringify({
      compiler: '.',
      repos: [{ name: 'repo-b', path: repoBDir }],
    }));

    const fleet = loadFleetContext(compilerDir);
    expect(fleet.repos[0].context).toBeNull();
    expect(fleet.repos[0].warning).toContain('no .roadmap/head.json');
  });

  it('loads multiple repos with mixed state', () => {
    writeFileSync(join(compilerDir, '.roadmap', 'fleet.json'), JSON.stringify({
      compiler: '.',
      repos: [
        { name: 'repo-a', path: repoADir },
        { name: 'repo-b', path: repoBDir },
      ],
    }));

    const fleet = loadFleetContext(compilerDir);
    expect(fleet.repos).toHaveLength(2);
    expect(fleet.repos[0].context).not.toBeNull();
    expect(fleet.repos[1].context).toBeNull();
  });
});
