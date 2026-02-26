import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const bin = join(__dirname, '..', 'bin', 'roadmap.ts');
const run = (args: string, cwd: string) =>
  execSync(`npx tsx ${bin} ${args}`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

describe('roadmap diff', () => {
  const tmp = join(tmpdir(), `.roadmap-diff-test-${Date.now()}`);

  const oldDag = {
    id: 'test', desc: 'test', init: 'init', term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
      a: { id: 'a', desc: 'node a', produces: ['a.txt'], consumes: [], deps: ['init'], validate: [], idempotent: true },
      term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a'], validate: [], idempotent: true },
    },
  };

  const newDag = {
    id: 'test', desc: 'test', init: 'init', term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
      a: { id: 'a', desc: 'node a updated', produces: ['a.txt', 'a2.txt'], consumes: [], deps: ['init'], validate: [], idempotent: true },
      b: { id: 'b', desc: 'new node', produces: ['b.txt'], consumes: ['a.txt'], deps: ['a'], validate: [], idempotent: true },
      term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['b'], validate: [], idempotent: true },
    },
  };

  it('detects added and modified nodes from file path', () => {
    mkdirSync(join(tmp, '.roadmap'), { recursive: true });
    writeFileSync(join(tmp, '.roadmap', 'head.json'), JSON.stringify(newDag));
    const oldPath = join(tmp, 'old.json');
    writeFileSync(oldPath, JSON.stringify(oldDag));

    const output = run(`diff ${oldPath}`, tmp);
    expect(output).toContain('+ added:');
    expect(output).toContain('b');
    expect(output).toContain('- removed:');
    expect(output).toContain('~ modified: a');
    expect(output).toContain('a2.txt');
  });

  it('detects removed nodes', () => {
    // Swap: old has b, new doesn't
    const dagWithB = { ...oldDag, nodes: { ...oldDag.nodes, b: { id: 'b', desc: 'b', produces: ['b.txt'], consumes: [], deps: ['a'], validate: [], idempotent: true } } };
    mkdirSync(join(tmp, '.roadmap'), { recursive: true });
    writeFileSync(join(tmp, '.roadmap', 'head.json'), JSON.stringify(oldDag)); // no b
    const oldPath = join(tmp, 'old-with-b.json');
    writeFileSync(oldPath, JSON.stringify(dagWithB)); // has b

    const output = run(`diff ${oldPath}`, tmp);
    expect(output).toContain('- removed:');
    expect(output).toContain('b');
  });

  it('shows no changes when DAGs are identical', () => {
    mkdirSync(join(tmp, '.roadmap'), { recursive: true });
    writeFileSync(join(tmp, '.roadmap', 'head.json'), JSON.stringify(oldDag));
    const samePath = join(tmp, 'same.json');
    writeFileSync(samePath, JSON.stringify(oldDag));

    const output = run(`diff ${samePath}`, tmp);
    expect(output).toContain('No changes.');
  });

  it('detects deps changes', () => {
    const dagOld = {
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
        a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: ['init'], validate: [], idempotent: true },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a'], validate: [], idempotent: true },
      },
    };
    const dagNew = {
      ...dagOld,
      nodes: {
        ...dagOld.nodes,
        a: { ...dagOld.nodes.a, deps: ['init'], consumes: ['new-input.txt'] },
        b: { id: 'b', desc: 'b', produces: ['b.txt'], consumes: [], deps: ['a'], validate: [], idempotent: true },
        term: { ...dagOld.nodes.term, deps: ['a', 'b'] },
      },
    };

    mkdirSync(join(tmp, '.roadmap'), { recursive: true });
    writeFileSync(join(tmp, '.roadmap', 'head.json'), JSON.stringify(dagNew));
    const oldPath = join(tmp, 'deps-old.json');
    writeFileSync(oldPath, JSON.stringify(dagOld));

    const output = run(`diff ${oldPath}`, tmp);
    expect(output).toContain('~ modified: a');
    expect(output).toContain('consumes');
    expect(output).toContain('new-input.txt');
    expect(output).toContain('~ modified: term');
    expect(output).toContain('deps');
  });

  // Cleanup
  if (existsSync(tmp)) {
    try { rmSync(tmp, { recursive: true }); } catch {}
  }
});
