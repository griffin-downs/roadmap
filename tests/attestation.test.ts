import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runVerify } from '../src/lib/verify.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'attest-test-'));
}

function makeDag(root: string, nodes: Record<string, unknown>): void {
  mkdirSync(join(root, '.roadmap'), { recursive: true });
  writeFileSync(join(root, '.roadmap', 'head.json'), JSON.stringify({
    id: 'attest-test',
    desc: 'test',
    init: 'init',
    term: 'term',
    nodes,
  }));
}

describe('attestation-emit (check --id)', () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('runVerify returns VerifyResult with violations and warnings', () => {
    makeDag(tmp, {
      init: { id: 'init', desc: 'Init', produces: [], consumes: [], deps: [] },
      term: { id: 'term', desc: 'Term', produces: [], consumes: [], deps: ['init'] },
    });
    const result = runVerify(tmp);
    expect(result).toHaveProperty('violations');
    expect(result).toHaveProperty('warnings');
    expect(result).toHaveProperty('fix');
    expect(Array.isArray(result.violations)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('runVerify passes on valid DAG', () => {
    makeDag(tmp, {
      init: { id: 'init', desc: 'Init', produces: ['a.ts'], consumes: [], deps: [] },
      term: { id: 'term', desc: 'Term', produces: [], consumes: ['a.ts'], deps: ['init'] },
    });
    const result = runVerify(tmp);
    expect(result.violations).toHaveLength(0);
  });

  it('runVerify catches structural errors', () => {
    // Cyclic deps
    mkdirSync(join(tmp, '.roadmap'), { recursive: true });
    writeFileSync(join(tmp, '.roadmap', 'head.json'), JSON.stringify({
      id: 'bad',
      desc: 'test',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'Init', produces: [], consumes: [], deps: ['term'] },
        term: { id: 'term', desc: 'Term', produces: [], consumes: [], deps: ['init'] },
      },
    }));
    const result = runVerify(tmp);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('returns NO_DAG when head.json missing', () => {
    const result = runVerify(tmp);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].code).toBe('NO_DAG');
  });

  it('detects spec-origin malformed', () => {
    makeDag(tmp, {
      init: { id: 'init', desc: 'Init', produces: [], consumes: [], deps: [] },
      term: { id: 'term', desc: 'Term', produces: [], consumes: [], deps: ['init'] },
    });
    writeFileSync(join(tmp, '.roadmap', 'spec-origin.json'), JSON.stringify({ bad: true }));
    const result = runVerify(tmp);
    const specViolation = result.violations.find(v => v.code === 'SPEC_ORIGIN_MALFORMED');
    expect(specViolation).toBeDefined();
  });
});
