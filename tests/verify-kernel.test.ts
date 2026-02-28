/**
 * verify-kernel tests: all violation codes, exit codes, clean state,
 * orphan receipt detection, env-bypass scan, CompletionStore consistency,
 * artifact-only completion detection, spec-origin integrity.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runVerify } from '../src/lib/verify.ts';
import type { VerifyResult } from '../src/lib/verify.ts';

function makeTmp(): string {
  const dir = join(tmpdir(), `vk-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeDAG(root: string, dag: object) {
  mkdirSync(join(root, '.roadmap'), { recursive: true });
  writeFileSync(join(root, '.roadmap', 'head.json'), JSON.stringify(dag, null, 2));
}

const minDAG = {
  id: 'test', desc: 'test', init: 'init', term: 'term',
  nodes: {
    init: { id: 'init', desc: 's', produces: [], consumes: [], deps: [], validate: [] },
    term: { id: 'term', desc: 'e', produces: [], consumes: [], deps: ['init'], validate: [] },
  },
};

describe('verify-kernel: violation codes', () => {
  let root: string;
  beforeEach(() => { root = makeTmp(); });

  it('NO_DAG when head.json absent', () => {
    const r = runVerify(root);
    expect(r.violations[0].code).toBe('NO_DAG');
  });

  it('DAG_PARSE_ERROR for corrupt JSON', () => {
    mkdirSync(join(root, '.roadmap'), { recursive: true });
    writeFileSync(join(root, '.roadmap', 'head.json'), '{{bad}}');
    const r = runVerify(root);
    expect(r.violations[0].code).toBe('DAG_PARSE_ERROR');
  });

  it('STRUCTURAL_INVALID when init missing from nodes', () => {
    writeDAG(root, { ...minDAG, init: 'ghost' });
    const r = runVerify(root);
    expect(r.violations.some(v => v.code === 'STRUCTURAL_INVALID')).toBe(true);
  });

  it('ORPHAN_NODES when node unreachable', () => {
    const dag = {
      ...minDAG,
      nodes: {
        ...minDAG.nodes,
        orphan: { id: 'orphan', desc: 'x', produces: [], consumes: [], deps: [], validate: [] },
      },
    };
    writeDAG(root, dag);
    const r = runVerify(root);
    expect(r.violations.some(v => v.code === 'ORPHAN_NODES')).toBe(true);
    expect(r.violations.find(v => v.code === 'ORPHAN_NODES')!.nodeIds!.some(s => s.startsWith('orphan'))).toBe(true);
  });

  it('UNSATISFIED_CONTRACTS when consume not produced', () => {
    const dag = {
      ...minDAG,
      nodes: {
        ...minDAG.nodes,
        mid: { id: 'mid', desc: 'x', produces: [], consumes: ['missing.ts'], deps: ['init'], validate: [] },
        term: { ...minDAG.nodes.term, deps: ['mid'] },
      },
    };
    writeDAG(root, dag);
    const r = runVerify(root);
    expect(r.violations.some(v => v.code === 'UNSATISFIED_CONTRACTS')).toBe(true);
  });

  it('SPEC_ORIGIN_MALFORMED for bad spec-origin', () => {
    writeDAG(root, minDAG);
    writeFileSync(join(root, '.roadmap', 'spec-origin.json'), '{"nope": true}');
    const r = runVerify(root);
    expect(r.violations.some(v => v.code === 'SPEC_ORIGIN_MALFORMED')).toBe(true);
  });

  it('SPEC_ORIGIN_PARSE_ERROR for unparseable spec-origin', () => {
    writeDAG(root, minDAG);
    writeFileSync(join(root, '.roadmap', 'spec-origin.json'), '{bad');
    const r = runVerify(root);
    expect(r.violations.some(v => v.code === 'SPEC_ORIGIN_PARSE_ERROR')).toBe(true);
  });
});

describe('verify-kernel: warnings', () => {
  let root: string;
  beforeEach(() => { root = makeTmp(); });

  it('ORPHAN_COMPLETIONS for stale completion records', () => {
    writeDAG(root, minDAG);
    writeFileSync(join(root, '.roadmap', 'completed.json'),
      JSON.stringify([{ nodeId: 'vanished', completedAt: new Date().toISOString() }]));
    const r = runVerify(root);
    expect(r.warnings.some(w => w.code === 'ORPHAN_COMPLETIONS')).toBe(true);
  });

  it('PLAN_SELECTION_INVALID when no plan selected', () => {
    writeDAG(root, minDAG);
    const r = runVerify(root);
    expect(r.warnings.some(w => w.code === 'PLAN_SELECTION_INVALID')).toBe(true);
  });

  it('ARTIFACT_ONLY_COMPLETION for validated node without checkpoint', () => {
    const dag = {
      ...minDAG,
      nodes: {
        ...minDAG.nodes,
        w: { id: 'w', desc: 'x', produces: ['f.ts'], consumes: [], deps: ['init'],
          validate: [{ type: 'shell', command: 'echo ok' }] },
        term: { ...minDAG.nodes.term, deps: ['w'] },
      },
    };
    writeDAG(root, dag);
    writeFileSync(join(root, '.roadmap', 'completed.json'),
      JSON.stringify([{ nodeId: 'w', completedAt: new Date().toISOString() }]));
    const r = runVerify(root);
    expect(r.warnings.some(w => w.code === 'ARTIFACT_ONLY_COMPLETION')).toBe(true);
  });

  it('no ARTIFACT_ONLY_COMPLETION when checkpoint present', () => {
    const dag = {
      ...minDAG,
      nodes: {
        ...minDAG.nodes,
        w: { id: 'w', desc: 'x', produces: ['f.ts'], consumes: [], deps: ['init'],
          validate: [{ type: 'shell', command: 'echo ok' }] },
        term: { ...minDAG.nodes.term, deps: ['w'] },
      },
    };
    writeDAG(root, dag);
    writeFileSync(join(root, '.roadmap', 'completed.json'),
      JSON.stringify([{ nodeId: 'w', completedAt: new Date().toISOString(), checkpointId: 'cp-1' }]));
    const r = runVerify(root);
    expect(r.warnings.some(w => w.code === 'ARTIFACT_ONLY_COMPLETION')).toBe(false);
  });
});

describe('verify-kernel: clean state', () => {
  let root: string;
  beforeEach(() => { root = makeTmp(); });

  it('clean DAG returns zero violations', () => {
    writeDAG(root, minDAG);
    const r = runVerify(root);
    expect(r.violations).toHaveLength(0);
    expect(r.fix).toHaveLength(0);
  });

  it('valid spec-origin does not produce violations', () => {
    writeDAG(root, minDAG);
    writeFileSync(join(root, '.roadmap', 'spec-origin.json'), JSON.stringify({
      schemaVersion: 1, engine: 'spec-kit', version: '1.0',
      compile_hash: 'a', spec_sha: 'b', importedAt: new Date().toISOString(), dagId: 'test',
    }));
    const r = runVerify(root);
    expect(r.violations.filter(v => v.code.startsWith('SPEC_ORIGIN'))).toHaveLength(0);
  });

  it('every violation carries a non-empty fix array', () => {
    writeDAG(root, { ...minDAG, init: 'ghost' });
    const r = runVerify(root);
    for (const v of r.violations) {
      expect(v.fix.length).toBeGreaterThan(0);
    }
  });
});
