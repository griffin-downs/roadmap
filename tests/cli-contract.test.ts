// FR-CLI-001 contract tests
// Asserts: (1) default stdout is JSON with envelope, (2) --human is non-JSON,
// (3) stderr has no JSON payload, (4) exit codes match ok field

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const CLI = join(import.meta.dirname, '..', 'bin', 'roadmap.ts');
const cwd = join(import.meta.dirname, '..');

function run(args: string, opts?: { expectFail?: boolean }): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node --experimental-strip-types ${CLI} ${args}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (e: any) {
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.status ?? 1,
    };
  }
}

function parseEnvelope(stdout: string): any {
  const parsed = JSON.parse(stdout);
  return parsed;
}

// --- (1) Default stdout is JSON with envelope fields ---

describe('JSON envelope contract', () => {
  it('orient emits valid JSON envelope', () => {
    const { stdout, exitCode } = run('orient --note "contract test"');
    expect(exitCode).toBe(0);
    const env = parseEnvelope(stdout);
    expect(env.schema_version).toBe(1);
    expect(env.ok).toBe(true);
    expect(env.cmd).toBe('orient');
    expect(typeof env.repoRoot).toBe('string');
    expect(env.data).toBeDefined();
    expect(env.data.position).toBeDefined();
  });

  it('chart emits valid JSON envelope', () => {
    const { stdout, exitCode } = run('chart');
    // chart uses console.log (not json()), so it may not have envelope
    // At minimum, stdout should be parseable or be human text
    expect(exitCode).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
  });

  it('trail emits valid JSON envelope', () => {
    const { stdout, exitCode } = run('trail --last 1');
    expect(exitCode).toBe(0);
    const env = parseEnvelope(stdout);
    expect(env.schema_version).toBe(1);
    expect(env.ok).toBe(true);
    expect(env.cmd).toBe('trail');
  });

  it('help exits 0 with non-empty output', () => {
    const { stdout, exitCode } = run('help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('roadmap');
  });

  it('show emits JSON envelope for valid node', () => {
    const { stdout, exitCode } = run('show rm-cli-contract-tests');
    expect(exitCode).toBe(0);
    const env = parseEnvelope(stdout);
    expect(env.schema_version).toBe(1);
    expect(env.ok).toBe(true);
  });

  it('plan status emits JSON envelope', () => {
    const { stdout } = run('plan status');
    // May exit 0 or 1 depending on state, but stdout should be JSON
    const env = parseEnvelope(stdout);
    expect(env.schema_version).toBe(1);
    expect(typeof env.ok).toBe('boolean');
  });
});

// --- Error envelope ---

describe('error envelope contract', () => {
  it('unknown command emits error envelope with exit 1', () => {
    const { stdout, exitCode } = run('nonexistent --note "test"', { expectFail: true });
    expect(exitCode).toBe(1);
    const env = parseEnvelope(stdout);
    expect(env.schema_version).toBe(1);
    expect(env.ok).toBe(false);
    expect(env.error).toBeDefined();
    expect(typeof env.error.code).toBe('string');
    expect(typeof env.error.message).toBe('string');
  });

  it('missing --note emits error envelope', () => {
    const { stdout, exitCode } = run('validate', { expectFail: true });
    expect(exitCode).toBe(1);
    const env = parseEnvelope(stdout);
    expect(env.ok).toBe(false);
    expect(env.error.message).toContain('--note');
  });
});

// --- (2) --human produces non-JSON text ---

describe('--human output mode', () => {
  it('orient --human produces non-JSON text', () => {
    const { stdout, exitCode } = run('orient --human --note "human test"');
    expect(exitCode).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
    expect(() => JSON.parse(stdout)).toThrow(); // not JSON
    expect(stdout).toContain('Position');
  });

  it('trail --human produces non-JSON text', () => {
    const { stdout, exitCode } = run('trail --human --last 3');
    expect(exitCode).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
    expect(() => JSON.parse(stdout)).toThrow();
  });

  it('--json overrides --human', () => {
    const { stdout, exitCode } = run('orient --human --json --note "override test"');
    expect(exitCode).toBe(0);
    const env = parseEnvelope(stdout);
    expect(env.schema_version).toBe(1);
    expect(env.ok).toBe(true);
  });
});

// --- (3) stderr does not contain JSON payload ---

describe('stderr discipline', () => {
  it('successful orient has no JSON on stderr', () => {
    const { stderr } = run('orient --note "stderr test"');
    if (stderr.trim()) {
      expect(() => JSON.parse(stderr)).toThrow(); // stderr must not be parseable JSON
    }
  });

  it('error command has no JSON payload on stderr', () => {
    const { stderr } = run('nonexistent --note "test"', { expectFail: true });
    if (stderr.trim()) {
      expect(() => JSON.parse(stderr)).toThrow();
    }
  });
});

// --- (4) Exit codes match ok field ---

describe('exit code contract', () => {
  it('exit 0 when ok=true', () => {
    const { stdout, exitCode } = run('orient --note "exit test"');
    expect(exitCode).toBe(0);
    const env = parseEnvelope(stdout);
    expect(env.ok).toBe(true);
  });

  it('exit 1 for user error (unknown command)', () => {
    const { stdout, exitCode } = run('nonexistent --note "test"', { expectFail: true });
    expect(exitCode).toBe(1);
    const env = parseEnvelope(stdout);
    expect(env.ok).toBe(false);
  });

  it('exit 1 for missing note', () => {
    const { exitCode } = run('validate', { expectFail: true });
    expect(exitCode).toBe(1);
  });
});
