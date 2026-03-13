import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { brief } from '../src/runtime/brief.ts';
import { loadContext } from '../src/runtime/context.ts';
import type { Graph } from '../src/protocol.ts';

const TMP = join(import.meta.dirname ?? '.', '.tmp-pattern-test');

function makeDAG(overrides?: Partial<Graph<string>['nodes'][string]>): Graph<string> {
  return {
    id: 'pattern-test',
    desc: 'Test renderPattern interpolation',
    init: 'work',
    term: 'work',
    nodes: {
      work: {
        id: 'work',
        desc: 'Build the widget parser',
        produces: ['src/parser.ts', 'src/types.ts'],
        consumes: [],
        deps: [],
        mode: 'execute',
        validate: [],
        ...overrides,
      } as any,
    },
  };
}

function setupRepo() {
  mkdirSync(join(TMP, '.roadmap'), { recursive: true });
  writeFileSync(join(TMP, '.roadmap', 'completed.json'), '[]');
  writeFileSync(join(TMP, '.roadmap', 'trail.jsonl'), '');
}

describe('renderPattern via brief()', () => {
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true });
    setupRepo();
  });

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('execute mode: interpolates TASK/PRODUCE/CONSUME/SCOPE/VERIFY/BLOCKED/MODE', () => {
    const dag = makeDAG();
    const ctx = loadContext(TMP);
    const b = brief(dag, 'work', ctx);

    expect(b.pattern).toContain('TASK: Build the widget parser');
    expect(b.pattern).toContain('PRODUCE: src/parser.ts, src/types.ts');
    expect(b.pattern).toContain('CONSUME: (none)');
    expect(b.pattern).toContain('SCOPE: work in "Test renderPattern interpolation"');
    expect(b.pattern).toContain('VERIFY:');
    expect(b.pattern).toContain('BLOCKED:');
    expect(b.pattern).toContain('MODE: execute');
  });

  it('execute mode: interpolates consumes when present', () => {
    const dag = makeDAG({ consumes: ['config.json', 'schema.ts'] });
    const ctx = loadContext(TMP);
    const b = brief(dag, 'work', ctx);

    expect(b.pattern).toContain('CONSUME: config.json, schema.ts');
  });

  it('plan mode: contains TASK/DECOMPOSE/POSITION/OUTPUT/VERIFY', () => {
    const dag = makeDAG({ mode: 'plan' as any, produces: [], consumes: [] });
    const ctx = loadContext(TMP);
    const b = brief(dag, 'work', ctx);

    expect(b.pattern).toContain('TASK: Build the widget parser');
    expect(b.pattern).toContain('DECOMPOSE:');
    expect(b.pattern).toContain('POSITION: work in "Test renderPattern interpolation"');
    expect(b.pattern).toContain('OUTPUT:');
    expect(b.pattern).toContain('VERIFY:');
    expect(b.pattern).not.toContain('PRODUCE:');
  });

  it('pattern changes when description changes', () => {
    const dag1 = makeDAG({ desc: 'Alpha task' });
    const dag2 = makeDAG({ desc: 'Beta task' });
    const ctx = loadContext(TMP);

    const p1 = brief(dag1, 'work', ctx).pattern;
    const p2 = brief(dag2, 'work', ctx).pattern;

    expect(p1).toContain('TASK: Alpha task');
    expect(p2).toContain('TASK: Beta task');
    expect(p1).not.toEqual(p2);
  });

  it('pattern changes when produces change', () => {
    const dag1 = makeDAG({ produces: ['a.ts'] });
    const dag2 = makeDAG({ produces: ['b.ts', 'c.ts'] });
    const ctx = loadContext(TMP);

    const p1 = brief(dag1, 'work', ctx).pattern;
    const p2 = brief(dag2, 'work', ctx).pattern;

    expect(p1).toContain('PRODUCE: a.ts');
    expect(p2).toContain('PRODUCE: b.ts, c.ts');
  });

  it('pattern is multiline with 7 lines for execute mode', () => {
    const dag = makeDAG();
    const ctx = loadContext(TMP);
    const b = brief(dag, 'work', ctx);

    const lines = b.pattern.split('\n');
    expect(lines).toHaveLength(7);
  });

  it('pattern is multiline with 5 lines for plan mode', () => {
    const dag = makeDAG({ mode: 'plan' as any, produces: [], consumes: [] });
    const ctx = loadContext(TMP);
    const b = brief(dag, 'work', ctx);

    const lines = b.pattern.split('\n');
    expect(lines).toHaveLength(5);
  });
});
