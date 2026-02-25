import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import roadmap from '../roadmap.ts';
import { orientCached } from '../src/orient-cached.ts';

describe('bootstrap-gen: agent bootstrap template', () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = join(tmpdir(), `roadmap-bootstrap-${Date.now()}`);
    mkdirSync(tmpRepo, { recursive: true });
    mkdirSync(join(tmpRepo, '.regent'), { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tmpRepo, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('bootstrap can read roadmap structure', () => {
    expect(roadmap.nodes).toBeDefined();
    expect(roadmap.init).toBe('init');
    expect(roadmap.term).toBe('term');
  });

  it('bootstrap displays node context', () => {
    const nodeId = 'init';
    const node = roadmap.nodes[nodeId as keyof typeof roadmap.nodes];
    expect(node).toBeDefined();
    expect(node.id).toBe('init');
    expect(node.desc).toBeTruthy();
  });

  it('bootstrap identifies remaining work', () => {
    const doneNodes = ['init'];
    const allNodes = Object.keys(roadmap.nodes);
    const remaining = allNodes.filter(n => !doneNodes.includes(n) && n !== roadmap.term);
    expect(remaining.length).toBeGreaterThan(0);
  });

  it('bootstrap recognizes terminal condition', () => {
    expect(roadmap.term).toBe('term');
  });
});
