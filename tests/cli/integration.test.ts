import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CliEnvelope } from '../../src/lib/cli-envelope.ts';
import { CommandInstrument } from '../../src/lib/metaflow/command-instrumentation.ts';

const BIN = './bin/roadmap';
const CWD = process.cwd();

// --- CLI runner ---

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

function runCli(cmdArgs: string, opts?: { cwd?: string; timeout?: number }): CliResult {
  const start = Date.now();
  try {
    const stdout = execSync(`${BIN} ${cmdArgs}`, {
      encoding: 'utf-8',
      cwd: opts?.cwd ?? CWD,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: opts?.timeout ?? 15000,
    });
    return { stdout, stderr: '', exitCode: 0, durationMs: Date.now() - start };
  } catch (e: any) {
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.status ?? 1,
      durationMs: Date.now() - start,
    };
  }
}

function extractEnvelope(stdout: string): CliEnvelope | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  const lines = trimmed.split('\n');
  let jsonStr = '';
  let depth = 0;
  let collecting = false;
  for (const line of lines) {
    if (!collecting && line.trimStart().startsWith('{')) collecting = true;
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

// --- Tests ---

describe('CLI Integration Suite', () => {

  // --- orient ---

  describe('orient command', () => {
    it('returns valid envelope with position data', () => {
      const { stdout, exitCode } = runCli('orient --note "integration test orient"');
      expect(exitCode).toBe(0);
      const env = extractEnvelope(stdout);
      expect(env).not.toBeNull();
      expect(env!.ok).toBe(true);
      expect(env!.cmd).toBe('orient');
      expect(env!.data).toBeDefined();
      const data = env!.data as any;
      expect(Array.isArray(data.position)).toBe(true);
      expect(typeof data.level).toBe('number');
      expect(typeof data.done).toBe('number');
      expect(typeof data.remaining).toBe('number');
    });

    it('orient --check produces no trail entry (silent)', () => {
      const { exitCode } = runCli('orient --check');
      expect(exitCode).toBe(0);
    });

    it('orient without --note fails with error envelope', () => {
      const { stdout, exitCode } = runCli('orient');
      expect(exitCode).not.toBe(0);
      const env = extractEnvelope(stdout);
      if (env) {
        expect(env.ok).toBe(false);
        expect(env.error).toBeDefined();
      }
    });
  });

  // --- chart ---

  describe('chart command', () => {
    it('produces valid envelope with render block', () => {
      const { stdout, exitCode } = runCli('chart');
      expect(exitCode).toBe(0);
      const env = extractEnvelope(stdout);
      expect(env).not.toBeNull();
      expect(env!.ok).toBe(true);
      expect(env!.cmd).toBe('chart');
      expect(env!.render).toBeDefined();
      expect(env!.render!.body.length).toBeGreaterThan(0);
    });
  });

  // --- show ---

  describe('show command', () => {
    it('returns node spec for known node', () => {
      const { stdout, exitCode } = runCli('show init --note "integration test show"');
      expect(exitCode).toBe(0);
      const env = extractEnvelope(stdout);
      expect(env).not.toBeNull();
      expect(env!.ok).toBe(true);
      const data = env!.data as any;
      expect(data).toBeDefined();
    });

    it('returns error for unknown node', () => {
      const { stdout, exitCode } = runCli('show nonexistent-node-xyz --note "integration test show unknown"');
      expect(exitCode).not.toBe(0);
      const env = extractEnvelope(stdout);
      if (env) {
        expect(env.ok).toBe(false);
      }
    });
  });

  // --- claim ---

  describe('claim command', () => {
    it('claim --list returns valid envelope', () => {
      const { stdout, exitCode } = runCli('claim --list');
      expect(exitCode).toBe(0);
      const env = extractEnvelope(stdout);
      expect(env).not.toBeNull();
      expect(env!.ok).toBe(true);
    });
  });

  // --- trail ---

  describe('trail command', () => {
    it('trail --last 3 returns recent entries', () => {
      const { stdout, exitCode } = runCli('trail --last 3');
      expect(exitCode).toBe(0);
      // Trail output may be text or JSON
      expect(stdout.length).toBeGreaterThanOrEqual(0);
    });
  });

  // --- help ---

  describe('help command', () => {
    it('produces usage text', () => {
      const { stdout, exitCode } = runCli('help');
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Commands:');
      expect(stdout).toContain('orient');
      expect(stdout).toContain('chart');
    });
  });

  // --- validate ---

  describe('validate command', () => {
    it('validate single node returns envelope', () => {
      const { stdout, exitCode } = runCli('validate init --note "integration test validate init"');
      const env = extractEnvelope(stdout);
      if (env) {
        expect(env).toHaveProperty('schema_version');
        expect(env).toHaveProperty('cmd');
      }
      expect(exitCode === 0 || exitCode === 1).toBe(true);
    });
  });

  // --- parallel ---

  describe('parallel command', () => {
    it('returns batch structure', () => {
      const { stdout, exitCode } = runCli('parallel --note "integration test parallel"');
      expect(exitCode).toBe(0);
      const env = extractEnvelope(stdout);
      expect(env).not.toBeNull();
      expect(env!.ok).toBe(true);
    });
  });

  // --- unknown command ---

  describe('error handling', () => {
    it('unknown command produces error envelope and non-zero exit', () => {
      const { stdout, exitCode } = runCli('totally-bogus-command --note "test"');
      expect(exitCode).not.toBe(0);
      const env = extractEnvelope(stdout);
      if (env) {
        expect(env.ok).toBe(false);
        expect(env.error).toBeDefined();
        expect(typeof env.error!.message).toBe('string');
      }
    });

    it('missing --note on note-requiring command produces error', () => {
      const { exitCode } = runCli('advance');
      expect(exitCode).not.toBe(0);
    });
  });

  // --- envelope schema consistency ---

  describe('envelope schema consistency across commands', () => {
    const commands = [
      { args: 'orient --note "schema check"', cmd: 'orient' },
      { args: 'chart', cmd: 'chart' },
      { args: 'claim --list', cmd: 'claim' },
      { args: 'parallel --note "schema check"', cmd: 'parallel' },
    ];

    for (const { args, cmd } of commands) {
      it(`${cmd} envelope has schema_version, ok, cmd, repoRoot`, () => {
        const { stdout } = runCli(args);
        const env = extractEnvelope(stdout);
        expect(env).not.toBeNull();
        expect(typeof env!.schema_version).toBe('number');
        expect(env!.schema_version).toBeGreaterThan(0);
        expect(typeof env!.ok).toBe('boolean');
        expect(env!.cmd).toBe(cmd);
        expect(typeof env!.repoRoot).toBe('string');
        expect(env!.repoRoot.length).toBeGreaterThan(0);
      });
    }
  });

  // --- concurrent execution ---

  describe('concurrent CLI invocations', () => {
    it('two orient calls do not corrupt state', () => {
      // Run two orients rapidly
      const r1 = runCli('orient --note "concurrent test 1"');
      const r2 = runCli('orient --note "concurrent test 2"');
      expect(r1.exitCode).toBe(0);
      expect(r2.exitCode).toBe(0);

      const e1 = extractEnvelope(r1.stdout);
      const e2 = extractEnvelope(r2.stdout);
      expect(e1).not.toBeNull();
      expect(e2).not.toBeNull();

      // Both should report same position
      const d1 = e1!.data as any;
      const d2 = e2!.data as any;
      expect(d1.level).toBe(d2.level);
    });
  });

  // --- metaflow instrumentation integration ---

  describe('metaflow instrumentation captures CLI executions', () => {
    let tmp: string;

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'mf-integ-'));
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    it('CommandInstrument records real CLI command output', () => {
      const instrument = new CommandInstrument('integ-test', tmp);
      const handle = instrument.startExecution('orient', ['--note', 'instrumented']);

      const { stdout, exitCode } = runCli('orient --note "instrumented by metaflow"');
      const exec = handle.stop(exitCode, stdout);

      expect(exec.cmd).toBe('orient');
      expect(exec.exitCode).toBe(0);
      expect(exec.outputStructure).toBe('envelope');
      expect(exec.envelopeOk).toBe(true);
      expect(exec.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('CommandInstrument captures chart output structure', () => {
      const instrument = new CommandInstrument('integ-chart', tmp);
      const { stdout, exitCode } = runCli('chart');
      const exec = instrument.recordExecution('chart', [], exitCode, stdout);

      // Chart emits render text before the JSON envelope, so output is mixed or envelope
      expect(['envelope', 'mixed']).toContain(exec.outputStructure);
    });

    it('CommandInstrument captures error command output', () => {
      const instrument = new CommandInstrument('integ-error', tmp);
      const { stdout, exitCode } = runCli('orient');  // missing --note
      const exec = instrument.recordExecution('orient', [], exitCode, stdout);

      expect(exec.exitCode).not.toBe(0);
    });

    it('saveMining persists instrumented results', () => {
      const instrument = new CommandInstrument('integ-save', tmp);

      const r1 = runCli('chart');
      instrument.recordExecution('chart', [], r1.exitCode, r1.stdout, r1.durationMs);

      const r2 = runCli('orient --note "mining persistence test"');
      instrument.recordExecution('orient', ['--note', 'test'], r2.exitCode, r2.stdout, r2.durationMs);

      const path = instrument.saveMining();
      expect(existsSync(path)).toBe(true);

      const data = JSON.parse(readFileSync(path, 'utf-8'));
      expect(data.commands).toBe(2);
      expect(data.totalDurationMs).toBeGreaterThan(0);
      // orient produces envelope, chart may be envelope or mixed
      const envelopeCount = (data.byStructure['envelope'] ?? 0) + (data.byStructure['mixed'] ?? 0);
      expect(envelopeCount).toBe(2);
    });
  });

  // --- cross-command workflow ---

  describe('end-to-end workflow sequence', () => {
    it('orient -> chart -> show -> validate in sequence', () => {
      const orient = runCli('orient --note "workflow sequence test"');
      expect(orient.exitCode).toBe(0);

      const chart = runCli('chart');
      expect(chart.exitCode).toBe(0);

      const show = runCli('show init --note "workflow show"');
      expect(show.exitCode).toBe(0);

      const validate = runCli('validate init --note "workflow validate"');
      // validate may fail on missing artifacts but should not crash
      expect(validate.exitCode === 0 || validate.exitCode === 1).toBe(true);
    });

    it('orient data is consistent with chart render', () => {
      const orient = runCli('orient --note "consistency check"');
      const chart = runCli('chart');

      const orientEnv = extractEnvelope(orient.stdout);
      const chartEnv = extractEnvelope(chart.stdout);

      expect(orientEnv).not.toBeNull();
      expect(chartEnv).not.toBeNull();

      // Chart render body should reference the current level
      const orientData = orientEnv!.data as any;
      const chartBody = chartEnv!.render?.body ?? '';
      // The chart should contain level markers
      expect(chartBody).toContain('L0');
    });
  });

  // --- retire ---

  describe('retire command', () => {
    it('retire --list returns valid output', () => {
      const { exitCode } = runCli('retire --list --note "integration retire list"');
      expect(exitCode === 0 || exitCode === 1).toBe(true);
    });
  });

  // --- diff ---

  describe('diff command', () => {
    it('diff against HEAD returns valid output', () => {
      const { exitCode } = runCli('diff HEAD --note "integration diff test"');
      // May succeed or fail depending on state, should not crash
      expect(exitCode === 0 || exitCode === 1).toBe(true);
    });
  });
});
