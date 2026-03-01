// @module validator-runner
// @exports runValidator, ValidatorResult, ENV_ALLOWLIST, resolveEnvPolicy, StrippedEnvReport
// @types ValidatorResult, StrippedEnvReport
// @entry roadmap

// FR-STACK-001: Normalized validator execution with env clamping.
// Env allowlist controlled by kernel.json envPolicy.allowedVars.
// Unknown env vars stripped before child process spawn.
// ROADMAP_VALIDATING always injected. Bypass vars (SKIP_BATCH_COMMIT etc.)
// require explicit kernel allowlist entry.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadKernel } from './kernel-config.ts';

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
  /** FR-STACK-001: env clamping report — which vars were allowed/stripped */
  envReport?: StrippedEnvReport;
}

/** Environment variables passed through to validator subprocesses. */
export const ENV_ALLOWLIST = ['PATH', 'HOME', 'NODE_ENV', 'TMPDIR', 'TERM'] as const;

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export interface StrippedEnvReport {
  allowed: string[];
  stripped: string[];
}

function normalizedEnv(extraVars: string[] = []): { env: Record<string, string>; report: StrippedEnvReport } {
  const env: Record<string, string> = { ROADMAP_VALIDATING: '1' };
  const allAllowed = new Set([...ENV_ALLOWLIST, ...extraVars]);
  const allowed: string[] = ['ROADMAP_VALIDATING'];
  const stripped: string[] = [];

  for (const key of Object.keys(process.env)) {
    if (key === 'ROADMAP_VALIDATING') continue;
    if (allAllowed.has(key)) {
      env[key] = process.env[key]!;
      allowed.push(key);
    } else {
      stripped.push(key);
    }
  }
  return { env, report: { allowed, stripped } };
}

/**
 * Resolve env policy: merge kernel.json envPolicy.allowedVars with builtin allowlist.
 * Returns the full set of allowed var names.
 */
export function resolveEnvPolicy(repoRoot: string): string[] {
  const kernel = loadKernel(repoRoot);
  return [...ENV_ALLOWLIST, ...kernel.envPolicy.allowedVars];
}

function runId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/**
 * Run a validator command in a normalized environment, capture output,
 * and optionally persist artifacts.
 *
 * FR-STACK-001: env clamping. All env vars not in the allowlist are stripped.
 * The allowlist = ENV_ALLOWLIST (builtin) + kernel.json envPolicy.allowedVars + opts.extraEnvVars.
 * ROADMAP_VALIDATING is always injected regardless of allowlist.
 * Bypass vars like SKIP_BATCH_COMMIT require explicit kernel allowlist entry.
 */
export async function runValidator(
  nodeId: string,
  validatorId: string,
  command: string | string[],
  repoRoot: string,
  opts?: { captureArtifacts?: boolean; extraEnvVars?: string[] },
): Promise<ValidatorResult> {
  const kernelVars = resolveEnvPolicy(repoRoot);
  const allExtra = [...new Set([...kernelVars, ...(opts?.extraEnvVars ?? [])])];
  const { env, report: envReport } = normalizedEnv(allExtra);
  const start = performance.now();

  const proc = Array.isArray(command)
    ? spawnSync(command[0], command.slice(1), {
        cwd: repoRoot,
        env,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120_000,
      })
    : spawnSync('sh', ['-c', command], {
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
    envReport: envReport,
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
