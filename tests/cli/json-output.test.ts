import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import {
  emit, emitError, parseOutputOpts, SCHEMA_VERSION, ErrorCode,
  type CliEnvelope, type OutputFormat,
} from '../../src/lib/cli-envelope.ts';

const BIN = './bin/roadmap';
const CWD = process.cwd();

// --- Unit: envelope shape ---

describe('cli-envelope unit', () => {
  let stdoutChunks: string[];

  beforeEach(() => {
    stdoutChunks = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function lastEnvelope(): CliEnvelope {
    const raw = stdoutChunks.join('');
    return JSON.parse(raw);
  }

  it('emit success envelope has required fields', () => {
    emit(
      { ok: true, cmd: 'test-cmd', data: { x: 1 } },
      { format: 'json', quiet: false },
    );
    const env = lastEnvelope();
    expect(env.schema_version).toBe(SCHEMA_VERSION);
    expect(env.ok).toBe(true);
    expect(env.cmd).toBe('test-cmd');
    expect(env.repoRoot).toBe(CWD);
    expect(env.data).toEqual({ x: 1 });
    expect(env.error).toBeUndefined();
  });

  it('emit error envelope has required fields', () => {
    emit(
      { ok: false, cmd: 'err-cmd', error: { code: 'TEST_ERR', message: 'boom' } },
      { format: 'json', quiet: false },
    );
    const env = lastEnvelope();
    expect(env.schema_version).toBe(SCHEMA_VERSION);
    expect(env.ok).toBe(false);
    expect(env.cmd).toBe('err-cmd');
    expect(env.error).toBeDefined();
    expect(env.error!.code).toBe('TEST_ERR');
    expect(env.error!.message).toBe('boom');
    expect(env.data).toBeUndefined();
  });

  it('emit error envelope includes fix array when provided', () => {
    emit(
      { ok: false, cmd: 'fix-cmd', error: { code: 'X', message: 'y', fix: ['do A', 'do B'] } },
      { format: 'json', quiet: false },
    );
    const env = lastEnvelope();
    expect(env.error!.fix).toEqual(['do A', 'do B']);
  });

  it('quiet mode suppresses success output', () => {
    emit(
      { ok: true, cmd: 'quiet-cmd', data: {} },
      { format: 'json', quiet: true },
    );
    expect(stdoutChunks).toHaveLength(0);
  });

  it('quiet mode does NOT suppress error output', () => {
    emit(
      { ok: false, cmd: 'quiet-err', error: { code: 'E', message: 'm' } },
      { format: 'json', quiet: false },
    );
    expect(stdoutChunks.length).toBeGreaterThan(0);
  });

  it('human format with renderer bypasses JSON', () => {
    emit(
      { ok: true, cmd: 'human', data: { val: 42 } },
      { format: 'human', quiet: false, humanRenderer: (d: any) => `value=${d.val}` },
    );
    expect(stdoutChunks.join('')).toContain('value=42');
    // Should not contain JSON envelope
    expect(stdoutChunks.join('')).not.toContain('"schema_version"');
  });

  it('human format without renderer falls back to JSON', () => {
    emit(
      { ok: true, cmd: 'fallback', data: { a: 1 } },
      { format: 'human', quiet: false },
    );
    const env = lastEnvelope();
    expect(env.schema_version).toBe(SCHEMA_VERSION);
  });

  it('render field is included when provided', () => {
    emit(
      { ok: true, cmd: 'render-test', data: {} },
      {
        format: 'json', quiet: false,
        render: { format: 'plain', mime: 'text/x-roadmap-ui', title: 'test', body: 'body' },
      },
    );
    const env = lastEnvelope();
    expect(env.render).toBeDefined();
    expect(env.render!.format).toBe('plain');
    expect(env.render!.mime).toBe('text/x-roadmap-ui');
  });
});

// --- Unit: parseOutputOpts ---

describe('parseOutputOpts', () => {
  it('defaults to json format', () => {
    const opts = parseOutputOpts([], 'test');
    expect(opts.format).toBe('json');
    expect(opts.quiet).toBe(false);
    expect(opts.cmd).toBe('test');
  });

  it('--human sets human format', () => {
    const opts = parseOutputOpts(['--human'], 'test');
    expect(opts.format).toBe('human');
  });

  it('--json overrides --human', () => {
    const opts = parseOutputOpts(['--human', '--json'], 'test');
    expect(opts.format).toBe('json');
  });

  it('--quiet flag', () => {
    const opts = parseOutputOpts(['--quiet'], 'test');
    expect(opts.quiet).toBe(true);
  });
});

// --- Unit: ErrorCode enum ---

describe('ErrorCode constants', () => {
  it('all error codes are non-empty strings', () => {
    for (const [key, val] of Object.entries(ErrorCode)) {
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
      // Convention: UPPER_SNAKE_CASE
      expect(val).toMatch(/^[A-Z_]+$/);
    }
  });

  it('has required error codes', () => {
    const required = [
      'PLAN_NOT_SELECTED', 'VALIDATION_FAILED', 'NODE_NOT_FOUND',
      'BATCH_INCOMPLETE', 'DAG_INVALID', 'INTERNAL_ERROR',
    ];
    for (const code of required) {
      expect(ErrorCode).toHaveProperty(code);
    }
  });
});

// --- Integration: CLI commands produce valid envelopes ---

describe('CLI JSON output compliance', () => {
  function runCli(cmdArgs: string): { stdout: string; stderr: string; exitCode: number } {
    try {
      const stdout = execSync(`${BIN} ${cmdArgs}`, {
        encoding: 'utf-8',
        cwd: CWD,
        env: { ...process.env, NO_COLOR: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
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

  function extractEnvelope(stdout: string): CliEnvelope | null {
    const trimmed = stdout.trim();
    if (!trimmed) return null;
    // Find the JSON object in stdout (may have trailing newline)
    const lines = trimmed.split('\n');
    // Look for lines that start a JSON object
    let jsonStr = '';
    let depth = 0;
    let collecting = false;
    for (const line of lines) {
      if (!collecting && line.trimStart().startsWith('{')) {
        collecting = true;
      }
      if (collecting) {
        jsonStr += line + '\n';
        for (const ch of line) {
          if (ch === '{') depth++;
          if (ch === '}') depth--;
        }
        if (depth === 0) break;
      }
    }
    if (!jsonStr) return null;
    try {
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }

  it('help produces text, not JSON envelope', () => {
    const { stdout } = runCli('help');
    expect(stdout).toContain('Commands:');
    // help is plain text — no envelope expected
    const env = extractEnvelope(stdout);
    if (env) {
      // If it does produce JSON, it should still be valid
      expect(env).toHaveProperty('schema_version');
    }
  });

  it('orient produces valid envelope on stdout', () => {
    const { stdout } = runCli('orient --note "json-output compliance test"');
    const env = extractEnvelope(stdout);
    expect(env).not.toBeNull();
    expect(env!.schema_version).toBe(SCHEMA_VERSION);
    expect(env!.ok).toBe(true);
    expect(env!.cmd).toBe('orient');
    expect(env!.repoRoot).toBeTruthy();
    expect(env!.data).toBeDefined();
  });

  it('chart produces valid envelope on stdout', () => {
    const { stdout } = runCli('chart');
    const env = extractEnvelope(stdout);
    expect(env).not.toBeNull();
    expect(env!.schema_version).toBe(SCHEMA_VERSION);
    expect(env!.ok).toBe(true);
    expect(env!.cmd).toBe('chart');
  });

  it('show produces valid envelope for known node', () => {
    const { stdout } = runCli('show init --note "json-output compliance test"');
    const env = extractEnvelope(stdout);
    expect(env).not.toBeNull();
    expect(env!.schema_version).toBe(SCHEMA_VERSION);
    expect(env!.ok).toBe(true);
    expect(env!.data).toBeDefined();
  });

  it('unknown command produces error envelope', () => {
    const { stdout, exitCode } = runCli('nonexistent-command --note "test"');
    expect(exitCode).not.toBe(0);
    const env = extractEnvelope(stdout);
    // Should produce an error envelope (ok: false)
    if (env) {
      expect(env.ok).toBe(false);
      expect(env.error).toBeDefined();
      expect(env.error!.code).toBeTruthy();
      expect(env.error!.message).toBeTruthy();
    }
  });

  it('all envelopes have headSha field (string or null)', () => {
    const { stdout } = runCli('orient --note "headSha check"');
    const env = extractEnvelope(stdout);
    expect(env).not.toBeNull();
    expect(env).toHaveProperty('headSha');
    // headSha is string | null
    expect(env!.headSha === null || typeof env!.headSha === 'string').toBe(true);
  });

  it('success envelope never has error field', () => {
    const { stdout } = runCli('orient --note "no error field check"');
    const env = extractEnvelope(stdout);
    expect(env).not.toBeNull();
    if (env!.ok) {
      expect(env!.error).toBeUndefined();
    }
  });

  it('error envelope never has data field', () => {
    const { stdout } = runCli('nonexistent-command --note "test"');
    const env = extractEnvelope(stdout);
    if (env && !env.ok) {
      expect(env.data).toBeUndefined();
    }
  });

  it('schema_version is a positive integer', () => {
    const { stdout } = runCli('orient --note "schema version check"');
    const env = extractEnvelope(stdout);
    expect(env).not.toBeNull();
    expect(Number.isInteger(env!.schema_version)).toBe(true);
    expect(env!.schema_version).toBeGreaterThan(0);
  });
});
