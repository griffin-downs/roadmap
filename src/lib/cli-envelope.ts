// @module cli-envelope
// @exports emit, emitError, parseOutputOpts, CliEnvelope, CliError, OutputOpts, OutputFormat, ErrorCode, SCHEMA_VERSION, RenderV1, RenderSection
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
}

export type OutputFormat = 'json' | 'human';

export interface OutputOpts {
  format: OutputFormat;
  quiet: boolean;
  cmd: string;
  humanRenderer?: (data: unknown) => string;
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
export function getHeadSha(): string | null {
  try {
    const raw = readFileSync(join(process.cwd(), '.roadmap', 'git-state.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    // git-state.json stores sha as `lastCommit`
    if (typeof parsed.lastCommit === 'string') return parsed.lastCommit;
    // fallback: head.hash from full GitState schema
    if (parsed.head && typeof parsed.head.hash === 'string') return parsed.head.hash;
    return null;
  } catch {
    return null;
  }
}

/** Repo root — cwd as-is. */
export function getRepoRoot(): string {
  return process.cwd();
}

// --- Output opts parsing ---

/**
 * Parse --human, --json, --quiet from args array.
 * Precedence: default=json, --human=human, --json overrides --human.
 */
export function parseOutputOpts(args: string[], cmd: string): OutputOpts {
  const hasHuman = args.includes('--human');
  const hasJson = args.includes('--json');
  const hasQuiet = args.includes('--quiet');

  let format: OutputFormat = 'json';
  if (hasHuman && !hasJson) format = 'human';

  return { format, quiet: hasQuiet, cmd };
}

// --- Emit ---

type EmitResult =
  | { ok: true; cmd: string; data: unknown }
  | { ok: false; cmd: string; error: CliError };

interface EmitOpts {
  format: OutputFormat;
  quiet: boolean;
  humanRenderer?: (data: unknown) => string;
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

  if (opts.format === 'human' && opts.humanRenderer && result.ok) {
    process.stdout.write(opts.humanRenderer(result.data) + '\n');
    return;
  }

  // json format, or human without renderer — fall back to JSON
  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
}

/** Emit an error envelope and exit. */
export function emitError(
  cmd: string,
  code: string,
  message: string,
  fix?: string[],
  opts?: { format?: OutputFormat; quiet?: boolean },
): never {
  const error: CliError = { code, message };
  if (fix && fix.length > 0) error.fix = fix;

  emit(
    { ok: false, cmd, error },
    { format: opts?.format ?? 'json', quiet: opts?.quiet ?? false },
  );

  process.exit(1);
}
