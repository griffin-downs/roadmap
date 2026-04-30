// @module cli-envelope
// @exports emit, emitError, parseOutputOpts, CliEnvelope, CliError, OutputOpts, ErrorCode, SCHEMA_VERSION, RenderV1, RenderSection, Hint
// @entry roadmap/cli-envelope

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// --- Types ---

export const SCHEMA_VERSION = 1;

export interface RenderSection {
  id: string;
  title: string;
  body: string;
}

export interface Hint {
  text: string;
  example: string;
}

export interface RenderV1 {
  format: 'ansi' | 'plain';
  mime: 'text/x-roadmap-ui';
  title: string;
  content: string;
  hints?: Hint[];
}

export interface CliEnvelope<T = unknown> {
  schema_version: number;
  ok: boolean;
  cmd: string;
  repoRoot: string;
  headSha: string | null;
  data?: T;
  render?: RenderV1;
  error?: CliError;
}

export interface CliError {
  code: string;
  message: string;
  fix?: string[];
  schema?: object;    // JSON Schema of expected input (when VALIDATION_FAILED)
  example?: object;   // One valid example input
  [key: string]: unknown;  // Additional context fields from RoadmapError
}

export interface OutputOpts {
  quiet: boolean;
  cmd: string;
}

// --- Error codes ---

export const ErrorCode = {
  PLAN_NOT_SELECTED: 'PLAN_NOT_SELECTED',
  HEAD_SHA_MISMATCH: 'HEAD_SHA_MISMATCH',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NODE_NOT_FOUND: 'NODE_NOT_FOUND',
  BATCH_INCOMPLETE: 'BATCH_INCOMPLETE',
  DAG_INVALID: 'DAG_INVALID',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CLAIM_CONFLICT: 'CLAIM_CONFLICT',
  COMPLETION_REJECTED: 'COMPLETION_REJECTED',
  RENDER_MISSING: 'RENDER_MISSING',
} as const;

export type ErrorCodeValue = typeof ErrorCode[keyof typeof ErrorCode];

// --- Helpers ---

/** Read .roadmap/git-state.json, return lastCommit sha or null. Never throws. */
export function getHeadSha(repoRoot?: string): string | null {
  try {
    const root = repoRoot ?? _repoRoot ?? process.cwd();
    const raw = readFileSync(join(root, '.roadmap', 'git-state.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed.lastCommit === 'string') return parsed.lastCommit;
    if (parsed.head && typeof parsed.head.hash === 'string') return parsed.head.hash;
    return null;
  } catch {
    return null;
  }
}

// Module-level repoRoot set by setRepoRoot() from CLI entry point.
let _repoRoot: string | null = null;

/** Set the resolved repo root for all envelope output. Call once from CLI entry. */
export function setRepoRoot(root: string): void {
  _repoRoot = root;
}

/** Repo root — returns resolved root if set, otherwise cwd. */
export function getRepoRoot(): string {
  return _repoRoot ?? process.cwd();
}

// --- Output opts parsing ---

/**
 * Parse --human, --json, --quiet from args array.
 * Precedence: default=json, --human=human, --json overrides --human.
 */
export function parseOutputOpts(args: string[], cmd: string): OutputOpts {
  return { quiet: args.includes('--quiet'), cmd };
}

// --- Emit ---

type EmitResult =
  | { ok: true; cmd: string; data: unknown }
  | { ok: false; cmd: string; error: CliError };

interface EmitOpts {
  quiet: boolean;
  render?: RenderV1;
}

/** Single output funnel. Wraps result in envelope, writes to stdout. */
export function emit(result: EmitResult, opts: EmitOpts): void {
  const envelope: CliEnvelope = {
    schema_version: SCHEMA_VERSION,
    ok: result.ok,
    cmd: result.cmd,
    repoRoot: getRepoRoot(),
    headSha: getHeadSha(),
  };

  if (result.ok) {
    envelope.data = result.data;
  } else {
    envelope.error = result.error;
  }

  if (opts.render) {
    envelope.render = opts.render;
  }

  if (opts.quiet && result.ok) return;
  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
}

/** Emit an error envelope and exit. */
export function emitError(
  cmd: string,
  code: string,
  message: string,
  fix?: string[],
  opts?: { quiet?: boolean },
): never {
  const error: CliError = { code, message };
  if (fix && fix.length > 0) error.fix = fix;

  emit({ ok: false, cmd, error }, { quiet: opts?.quiet ?? false });

  process.exit(1);
}
