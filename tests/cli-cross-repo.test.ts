import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';

const root = process.cwd();
const cli = join(root, 'bin/roadmap.ts');
const tmpBase = join(root, '.test-cli-cross');
const localRepo = join(tmpBase, 'local');
const siblingRepo = join(tmpBase, 'sibling');

function run(cmd: string, cwd: string): any {
  const out = execSync(`node --experimental-strip-types ${cli} ${cmd}`, {
    cwd, encoding: 'utf-8', env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  // Extract JSON from output (chart outputs non-JSON, orient outputs JSON)
  try {
    const raw = JSON.parse(out);
    if (raw && typeof raw === 'object' && 'schema_version' in raw && 'data' in raw) return raw.data;
    return raw;
  } catch { return out; }
}

function makeDAG(id: string, nodes: Record<string, any>) {
  const nodeIds = Object.keys(nodes);
  return { id, desc: `test ${id}`, init: nodeIds[0], term: nodeIds[nodeIds.length - 1], nodes };
}

beforeAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });

  // Initialize local as git repo (orient needs git for some predicates)
  mkdirSync(join(localRepo, '.roadmap'), { recursive: true });
  execSync('git init', { cwd: localRepo, stdio: 'pipe' });

  writeFileSync(join(localRepo, '.roadmap/head.json'), JSON.stringify(makeDAG('cli-local', {
    start: { id: 'start', desc: 'begin', produces: ['app.ts'], consumes: [], deps: [], validate: [], idempotent: true },
    end: { id: 'end', desc: 'done', produces: [], consumes: ['app.ts'], deps: ['start'], validate: [], idempotent: false },
  })));
  writeFileSync(join(localRepo, 'app.ts'), 'export {}');
  writeFileSync(join(localRepo, '.roadmap.json'), JSON.stringify({
    projectType: 'test', init: ['app.ts'], term: [],
    dependencies: [{ repo: '../sibling', consumes: ['lib.h'], phase: 'build', mustComplete: true }],
  }));

  // Sibling
  mkdirSync(join(siblingRepo, '.roadmap'), { recursive: true });
  writeFileSync(join(siblingRepo, '.roadmap/head.json'), JSON.stringify(makeDAG('cli-sibling', {
    init: { id: 'init', desc: 'start', produces: ['lib.h'], consumes: [], deps: [], validate: [], idempotent: true },
    done: { id: 'done', desc: 'end', produces: [], consumes: ['lib.h'], deps: ['init'], validate: [], idempotent: false },
  })));

  execSync('git add -A && git commit -m "init"', { cwd: localRepo, stdio: 'pipe' });
});

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

describe('CLI cross-repo', () => {
  it('orient returns blockedBy when sibling missing artifact', () => {
    const result = run('orient --note "test blocked"', localRepo);
    expect(result.blockedBy).toBeDefined();
    expect(result.blockedBy.length).toBeGreaterThanOrEqual(1);
    expect(result.blockedBy[0].waiting).toContain('lib.h');
  });

  it('orient clears blockedBy when sibling has artifact', () => {
    writeFileSync(join(siblingRepo, 'lib.h'), '#pragma once');
    const result = run('orient --note "test unblocked"', localRepo);
    expect(result.blockedBy).toBeUndefined(); // no blockedBy field when empty
    rmSync(join(siblingRepo, 'lib.h'));
  });

  it('chart --deps includes sibling repo info', () => {
    const output = run('chart --deps', localRepo);
    expect(typeof output).toBe('string');
    expect(output).toContain('cli-sibling');
  });

  it('chart without --deps hints about deps flag', () => {
    const output = run('chart', localRepo);
    expect(typeof output).toBe('string');
    expect(output).toContain('--deps');
  });

  it('merge --from shows artifact connections', () => {
    // Create a local node that consumes what sibling produces
    writeFileSync(join(localRepo, '.roadmap/head.json'), JSON.stringify(makeDAG('cli-local', {
      start: { id: 'start', desc: 'begin', produces: ['app.ts'], consumes: ['lib.h'], deps: [], validate: [], idempotent: true },
      end: { id: 'end', desc: 'done', produces: [], consumes: ['app.ts'], deps: ['start'], validate: [], idempotent: false },
    })));

    const result = run('merge --from ../sibling --note "check"', localRepo);
    expect(result.connections).toBeDefined();
    expect(result.connections.siblingToLocal.length).toBeGreaterThanOrEqual(1);
    expect(result.connections.siblingToLocal[0].artifact).toBe('lib.h');
  });
});
