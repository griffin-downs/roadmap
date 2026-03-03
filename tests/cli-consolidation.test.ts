// add-consolidation-tests: Minimal CLI surface validation
// Tests: 6 core + 4 groups = 10 commands, help < 40 lines

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const CLI = join(import.meta.dirname, '..', 'bin', 'roadmap.ts');
const cwd = join(import.meta.dirname, '..');

function run(args: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`node --experimental-strip-types ${CLI} ${args}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    return { stdout, exitCode: 0 };
  } catch (e: any) {
    return { stdout: e.stdout ?? '', exitCode: e.status ?? 1 };
  }
}

describe('CLI Consolidation Surface', () => {
  it('help output is under 40 lines', () => {
    const { stdout } = run('help');
    const lines = stdout.split('\n').length;
    expect(lines).toBeLessThan(40);
  });

  it('6 core commands listed', () => {
    const { stdout } = run('help');
    expect(stdout).toContain('orient');
    expect(stdout).toContain('advance');
    expect(stdout).toContain('show');
    expect(stdout).toContain('complete');
    expect(stdout).toContain('chart');
    expect(stdout).toContain('validate');
  });

  it('4 groups listed', () => {
    const { stdout } = run('help');
    expect(stdout).toContain('dag');
    expect(stdout).toContain('team');
    expect(stdout).toContain('spec');
    expect(stdout).toContain('util');
  });

  it('dag group help works', () => {
    const { stdout, exitCode } = run('dag help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('DAG structure and manipulation');
  });

  it('team group help works', () => {
    const { stdout, exitCode } = run('team help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Multi-agent coordination');
  });

  it('spec group help works', () => {
    const { stdout, exitCode } = run('spec help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Spec intake pipeline');
  });

  it('util group help works', () => {
    const { stdout, exitCode } = run('util help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Session utilities');
  });
});
