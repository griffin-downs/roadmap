import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const repoRoot = join(__dirname, '..');
const bin = join(repoRoot, 'bin', 'roadmap.ts');

function unwrap(stdout: string): any {
  const raw = JSON.parse(stdout);
  if (raw && typeof raw === 'object' && 'schema_version' in raw && 'data' in raw) return raw.data;
  if (raw && typeof raw === 'object' && 'schema_version' in raw && 'error' in raw) return { error: raw.error.message, ...raw.error };
  return raw;
}

const dag = {
  id: 'test-dag',
  desc: 'test',
  init: 'a',
  term: 'b',
  nodes: {
    a: {
      id: 'a', desc: 'init', produces: [], consumes: [], deps: [], validate: [], idempotent: true,
    },
    b: {
      id: 'b', desc: 'term', produces: [], consumes: [], deps: ['a'],
      validate: [{ type: 'artifact-exists', target: 'output.txt' }],
      idempotent: true,
    },
  },
};

function certify(nodeId: string, cwd: string, extra: string[] = []) {
  return spawnSync(
    'npx', ['tsx', bin, 'certify', nodeId, '--note', 'test', ...extra],
    { cwd, encoding: 'utf-8', env: { ...process.env, AGENT_ID: 'test-agent' } },
  );
}

function makeTmpDir(suffix: string) {
  const dir = join(tmpdir(), `roadmap-certify-test-${suffix}-${Date.now()}`);
  mkdirSync(join(dir, '.roadmap'), { recursive: true });
  writeFileSync(join(dir, '.roadmap', 'head.json'), JSON.stringify(dag));
  writeFileSync(join(dir, '.roadmap', 'completed.json'), JSON.stringify([]));
  return dir;
}

describe('roadmap certify', () => {
  // One tmp dir per test — set up/tear down independently
  let tmpPass: string;
  let tmpFail: string;
  let tmpNoValidator: string;

  beforeAll(() => {
    tmpPass = makeTmpDir('pass');
    tmpFail = makeTmpDir('fail');
    tmpNoValidator = makeTmpDir('no-validator');

    // Only the passing case gets output.txt
    writeFileSync(join(tmpPass, 'output.txt'), 'present');
  });

  afterAll(() => {
    for (const dir of [tmpPass, tmpFail, tmpNoValidator]) {
      if (existsSync(dir)) try { rmSync(dir, { recursive: true }); } catch {}
    }
  });

  it('node with passing validators exits 0 and certified: true', () => {
    const result = certify('b', tmpPass);
    expect(result.status).toBe(0);
    const output = unwrap(result.stdout);
    expect(output.certified).toBe(true);
    expect(output.node).toBe('b');
    expect(output.owner).toBe('test-agent');
    expect(Array.isArray(output.checks)).toBe(true);
  });

  it('passing certify writes receipt to completed.json with validationChecks', () => {
    // Ensure the receipt was written (test runs after previous)
    const completedPath = join(tmpPass, '.roadmap', 'completed.json');
    expect(existsSync(completedPath)).toBe(true);
    const records = JSON.parse(readFileSync(completedPath, 'utf-8'));
    const record = records.find((r: any) => r.nodeId === 'b');
    expect(record).toBeDefined();
    expect(Array.isArray(record.validationChecks)).toBe(true);
    expect(record.validationChecks.length).toBeGreaterThan(0);
    expect(record.validationChecks.every((c: any) => c.passed)).toBe(true);
  });

  it('node with failing validators exits 1 and certified: false', () => {
    // output.txt is absent in tmpFail
    const result = certify('b', tmpFail);
    expect(result.status).toBe(1);
    const output = unwrap(result.stdout);
    expect(output.certified).toBe(false);
    expect(output.node).toBe('b');
    expect(typeof output.failedCount).toBe('number');
    expect(output.failedCount).toBeGreaterThan(0);
  });

  it('node not in DAG exits 1 with error', () => {
    const result = certify('nonexistent', tmpFail);
    expect(result.status).toBe(1);
    const output = unwrap(result.stdout);
    expect(output.error).toBeTruthy();
    expect(output.error).toMatch(/not found/i);
  });

  it('node with no validators always passes', () => {
    // Node "a" has validate: [] — always passes
    const result = certify('a', tmpNoValidator);
    expect(result.status).toBe(0);
    const output = unwrap(result.stdout);
    expect(output.certified).toBe(true);
    expect(output.node).toBe('a');
  });
});
