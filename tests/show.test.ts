import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const bin = join(__dirname, '..', 'bin', 'roadmap.ts');
const run = (args: string, cwd: string) => {
  const out = execSync(`npx tsx ${bin} ${args}`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  return JSON.parse(out);
};

describe('roadmap show', () => {
  const tmp = join(tmpdir(), `.roadmap-show-test-${Date.now()}`);

  const dag = {
    id: 'test', desc: 'test dag', init: 'init', term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
      a: { id: 'a', desc: 'node a', produces: ['a.txt'], consumes: [], deps: ['init'], validate: [{ type: 'artifact-exists', target: 'a.txt' }], idempotent: true },
      b: { id: 'b', desc: 'node b', produces: ['b.txt'], consumes: ['a.txt'], deps: ['a'], validate: [], idempotent: true, mode: 'plan' },
      term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['b'], validate: [], idempotent: true },
    },
  };

  beforeAll(() => {
    mkdirSync(join(tmp, '.roadmap'), { recursive: true });
    writeFileSync(join(tmp, '.roadmap', 'head.json'), JSON.stringify(dag));
  });

  afterAll(() => {
    if (existsSync(tmp)) try { rmSync(tmp, { recursive: true }); } catch {}
  });

  it('returns full node spec by ID', () => {
    const result = run('show a', tmp);
    expect(result.id).toBe('a');
    expect(result.desc).toBe('node a');
    expect(result.produces).toEqual(['a.txt']);
    expect(result.deps).toEqual(['init']);
    expect(result.validate).toHaveLength(1);
    expect(result.validate[0].type).toBe('artifact-exists');
    expect(result.mode).toBe('execute');
    expect(result.level).toBeTypeOf('number');
    expect(result.status).toBeTypeOf('string');
  });

  it('includes mode for plan nodes', () => {
    const result = run('show b', tmp);
    expect(result.mode).toBe('plan');
  });

  it('includes level and status', () => {
    const result = run('show init', tmp);
    expect(result.level).toBe(0);
    // init has no produces → done
    expect(result.status).toBe('done');
  });

  it('errors on unknown node', () => {
    try {
      run('show nonexistent', tmp);
      expect.unreachable();
    } catch (e: any) {
      expect(e.status).toBe(1);
    }
  });

  it('show --batch returns all nodes at a level', () => {
    const result = run('show --batch 0', tmp);
    expect(result.level).toBe(0);
    expect(result.nodes).toBeInstanceOf(Array);
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.nodes[0].id).toBe('init');
  });

  it('show --batch with no level defaults to current', () => {
    const result = run('show --batch', tmp);
    expect(result.level).toBeTypeOf('number');
    expect(result.nodes).toBeInstanceOf(Array);
  });

  it('show --batch L1 parses level prefix', () => {
    const result = run('show --batch L1', tmp);
    expect(result.level).toBe(1);
    expect(result.nodes.some((n: any) => n.id === 'a')).toBe(true);
  });
});
