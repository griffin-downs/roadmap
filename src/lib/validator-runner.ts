// @module validator-runner
// @exports runValidator, ValidatorResult, ENV_ALLOWLIST
// @types ValidatorResult
// @entry roadmap

// Normalized validator execution: env allowlist, stdout/stderr capture,
// sha256 computation, optional artifact persistence under .roadmap/artifacts/.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ValidatorResult {
  /** Validator identifier, e.g. "shell:npx tsc --noEmit" */
  id: string;
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  /** sha256 hex of stdout */
  stdoutSha?: string;
  /** sha256 hex of stderr */
  stderrSha?: string;
  /** Paths under .roadmap/artifacts/<nodeId>/<runId>/ produced by this run */
  artifactPaths: string[];
  durationMs: number;
}

/** Environment variables passed through to validator subprocesses. */
export const ENV_ALLOWLIST = ['PATH', 'HOME', 'NODE_ENV', 'TMPDIR', 'TERM'] as const;

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function normalizedEnv(): Record<string, string> {
  const env: Record<string, string> = { ROADMAP_VALIDATING: '1' };
  for (const key of ENV_ALLOWLIST) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key]!;
    }
  }
  return env;
}

function runId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/**
 * Run a validator command in a normalized environment, capture output,
 * and optionally persist artifacts.
 */
export async function runValidator(
  nodeId: string,
  validatorId: string,
  command: string,
  repoRoot: string,
  opts?: { captureArtifacts?: boolean },
): Promise<ValidatorResult> {
  const env = normalizedEnv();
  const start = performance.now();

  const proc = spawnSync('sh', ['-c', command], {
    cwd: repoRoot,
    env,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120_000,
  });

  const durationMs = Math.round(performance.now() - start);
  const stdout = proc.stdout ?? '';
  const stderr = proc.stderr ?? '';
  const exitCode = proc.status ?? 1;

  const result: ValidatorResult = {
    id: validatorId,
    passed: exitCode === 0,
    exitCode,
    stdout,
    stderr,
    stdoutSha: stdout.length > 0 ? sha256(stdout) : undefined,
    stderrSha: stderr.length > 0 ? sha256(stderr) : undefined,
    artifactPaths: [],
    durationMs,
  };

  if (opts?.captureArtifacts && (stdout.length > 0 || stderr.length > 0)) {
    const rid = runId();
    const artifactDir = join(repoRoot, '.roadmap', 'artifacts', nodeId, rid);
    mkdirSync(artifactDir, { recursive: true });

    if (stdout.length > 0) {
      const p = join(artifactDir, 'stdout.txt');
      writeFileSync(p, stdout);
      result.artifactPaths.push(p);
    }
    if (stderr.length > 0) {
      const p = join(artifactDir, 'stderr.txt');
      writeFileSync(p, stderr);
      result.artifactPaths.push(p);
    }
  }

  return result;
}
