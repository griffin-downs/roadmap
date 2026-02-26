import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const bin = join(__dirname, '..', 'bin', 'roadmap.ts');

describe('roadmap commit --node', () => {
  const tmp = join(tmpdir(), `.roadmap-commit-test-${Date.now()}`);
  const run = (args: string) =>
    execSync(`npx tsx ${bin} ${args}`, { cwd: tmp, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

  const dag = {
    id: 'test', desc: 'test', init: 'init', term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
      a: { id: 'a', desc: 'node a', produces: ['a.txt'], consumes: [], deps: ['init'], validate: [], idempotent: true },
      term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a'], validate: [], idempotent: true },
    },
  };

  beforeAll(() => {
    // Set up git repo with roadmap
    mkdirSync(join(tmp, '.roadmap'), { recursive: true });
    execSync('git init', { cwd: tmp, stdio: 'pipe' });
    execSync('git config user.email "test@test.com" && git config user.name "Test"', { cwd: tmp, stdio: 'pipe' });
    writeFileSync(join(tmp, '.roadmap', 'head.json'), JSON.stringify(dag));
    execSync('git add -A && git commit -m "init"', { cwd: tmp, stdio: 'pipe' });
  });

  afterAll(() => {
    if (existsSync(tmp)) try { rmSync(tmp, { recursive: true }); } catch {}
  });

  it('errors without --node', () => {
    try {
      run('commit --message "test" --note "test"');
      expect.unreachable();
    } catch (e: any) {
      expect(e.status).toBe(1);
    }
  });

  it('errors without --message', () => {
    try {
      run('commit --node a --note "test"');
      expect.unreachable();
    } catch (e: any) {
      expect(e.status).toBe(1);
    }
  });

  it('errors when artifact missing', () => {
    try {
      run('commit --node a --message "test" --note "test"');
      expect.unreachable();
    } catch (e: any) {
      expect(e.status).toBe(1);
    }
  });

  it('commits node with trailer when artifact exists', () => {
    // Create the artifact
    writeFileSync(join(tmp, 'a.txt'), 'content');

    const output = JSON.parse(run('commit --node a --message "add a" --note "test commit"'));
    expect(output.committed).toBe(true);
    expect(output.node).toBe('a');
    expect(output.produces).toEqual(['a.txt']);

    // Verify commit message has trailer
    const log = execSync('git log -1 --format=%B', { cwd: tmp, encoding: 'utf-8' });
    expect(log).toContain('[node: a]');
  });
});
