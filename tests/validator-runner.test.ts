import { describe, it, expect } from 'vitest';
import { runValidator, ENV_ALLOWLIST } from '../src/lib/validator-runner.js';
import type { ValidatorResult } from '../src/lib/validator-runner.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'vr-test-'));
}

describe('validator-runner', () => {
  describe('ENV_ALLOWLIST', () => {
    it('contains expected baseline vars', () => {
      expect(ENV_ALLOWLIST).toContain('PATH');
      expect(ENV_ALLOWLIST).toContain('HOME');
      // ROADMAP_VALIDATING is injected internally, not in the allowlist
      expect((ENV_ALLOWLIST as readonly string[]).includes('ROADMAP_VALIDATING')).toBe(false);
    });
  });

  describe('runValidator', () => {
    it('captures passing command', async () => {
      const tmp = makeTmpDir();
      try {
        const result = await runValidator('test-node', 'shell:echo hi', 'echo hi', tmp);
        expect(result.passed).toBe(true);
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe('hi');
        expect(result.stderr).toBe('');
        expect(result.stdoutSha).toBeDefined();
        expect(result.stderrSha).toBeUndefined();
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        expect(result.id).toBe('shell:echo hi');
        expect(result.artifactPaths).toEqual([]);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('captures failing command', async () => {
      const tmp = makeTmpDir();
      try {
        const result = await runValidator('test-node', 'shell:false', 'false', tmp);
        expect(result.passed).toBe(false);
        expect(result.exitCode).not.toBe(0);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('captures stderr', async () => {
      const tmp = makeTmpDir();
      try {
        const result = await runValidator('n', 'shell:err', 'echo err >&2', tmp);
        expect(result.stderr.trim()).toBe('err');
        expect(result.stderrSha).toBeDefined();
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('computes consistent sha256 for same output', async () => {
      const tmp = makeTmpDir();
      try {
        const r1 = await runValidator('n', 's', 'echo deterministic', tmp);
        const r2 = await runValidator('n', 's', 'echo deterministic', tmp);
        expect(r1.stdoutSha).toBe(r2.stdoutSha);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('writes artifacts when captureArtifacts is true', async () => {
      const tmp = makeTmpDir();
      try {
        const result = await runValidator('mynode', 'shell:echo artifact', 'echo artifact', tmp, {
          captureArtifacts: true,
        });
        expect(result.artifactPaths.length).toBeGreaterThan(0);
        for (const p of result.artifactPaths) {
          expect(existsSync(p)).toBe(true);
        }
        const stdoutFile = result.artifactPaths.find(p => p.endsWith('stdout.txt'));
        expect(stdoutFile).toBeDefined();
        expect(readFileSync(stdoutFile!, 'utf-8').trim()).toBe('artifact');
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('does not write artifacts by default', async () => {
      const tmp = makeTmpDir();
      try {
        const result = await runValidator('mynode', 'shell:echo no-art', 'echo no-art', tmp);
        expect(result.artifactPaths).toEqual([]);
        expect(existsSync(join(tmp, '.roadmap', 'artifacts'))).toBe(false);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('normalizes env — blocks non-allowlisted vars', async () => {
      const tmp = makeTmpDir();
      process.env['VALIDATOR_TEST_SECRET'] = 'leaked';
      try {
        const result = await runValidator('n', 's', 'echo $VALIDATOR_TEST_SECRET', tmp);
        // env is normalized, so VALIDATOR_TEST_SECRET should not be present
        expect(result.stdout.trim()).toBe('');
      } finally {
        delete process.env['VALIDATOR_TEST_SECRET'];
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('sets ROADMAP_VALIDATING in subprocess env', async () => {
      const tmp = makeTmpDir();
      try {
        const result = await runValidator('n', 's', 'echo $ROADMAP_VALIDATING', tmp);
        expect(result.stdout.trim()).toBe('1');
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  describe('ValidatorResult type', () => {
    it('satisfies the interface shape', () => {
      const r: ValidatorResult = {
        id: 'shell:test',
        passed: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
        artifactPaths: [],
        durationMs: 42,
      };
      expect(r.passed).toBe(true);
      expect(r.stdoutSha).toBeUndefined();
    });
  });
});
