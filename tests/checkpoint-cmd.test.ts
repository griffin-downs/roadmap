import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const bin = join(__dirname, '..', 'bin', 'roadmap.ts');

describe('roadmap checkpoint', () => {
  const tmp = join(tmpdir(), `.roadmap-checkpoint-test-${Date.now()}`);
  const run = (args: string) =>
    execSync(`npx tsx ${bin} ${args}`, { cwd: tmp, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

  const dag = {
    id: 'test', desc: 'test', init: 'init', term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
      a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: ['init'], validate: [], idempotent: true },
      term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a'], validate: [], idempotent: true },
    },
  };

  beforeAll(() => {
    mkdirSync(join(tmp, '.roadmap'), { recursive: true });
    execSync('git init', { cwd: tmp, stdio: 'pipe' });
    execSync('git config user.email "test@test.com" && git config user.name "Test"', { cwd: tmp, stdio: 'pipe' });
    writeFileSync(join(tmp, '.roadmap', 'head.json'), JSON.stringify(dag));
    execSync('git add -A && git commit -m "init"', { cwd: tmp, stdio: 'pipe' });
  });

  afterAll(() => {
    if (existsSync(tmp)) try { rmSync(tmp, { recursive: true }); } catch {}
  });

  it('errors without --label', () => {
    try {
      run('checkpoint --note "test"');
      expect.unreachable();
    } catch (e: any) {
      expect(e.status).toBe(1);
    }
  });

  it('creates checkpoint with --label', () => {
    const output = JSON.parse(run('checkpoint --label iter-1 --note "first checkpoint"'));
    expect(output.created).toBe(true);
    expect(output.label).toBe('iter-1');
    expect(output.checkpointId).toMatch(/^cp-/);

    // Verify checkpoint file was written
    const cpDir = join(tmp, '.roadmap', 'checkpoints');
    expect(existsSync(cpDir)).toBe(true);
    const files = readdirSync(cpDir);
    expect(files.length).toBe(1);
  });

  it('--list shows existing checkpoints', () => {
    const output = JSON.parse(run('checkpoint --list'));
    expect(output.checkpoints).toBeInstanceOf(Array);
    expect(output.checkpoints.length).toBe(1);
    expect(output.checkpoints[0].phase).toBe('iter-1');
  });
});
