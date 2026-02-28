// @module spec-origin-gate-tests
// Tests for scripts/ci/roadmap-spec-origin-gate.ts
//
// Strategy: copy the script into a temp dir at scripts/ci/roadmap-spec-origin-gate.ts
// so import.meta.dirname resolves to tmpDir/scripts/ci/ and root = tmpDir.
// Set up .roadmap/head.json, receipts, and a git repo with a known diff.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, cpSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const SCRIPT_SRC = resolve(import.meta.dirname, '../scripts/ci/roadmap-spec-origin-gate.ts');

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

// --- Helpers ---

function setupGitRepo(dir: string, opts: {
  headJson: object;
  headChanged: boolean;
  receipts?: Array<{ name: string; content: object }>;
}): void {
  // Place script so import.meta.dirname resolves root = dir
  mkdirSync(join(dir, 'scripts', 'ci'), { recursive: true });
  cpSync(SCRIPT_SRC, join(dir, 'scripts', 'ci', 'roadmap-spec-origin-gate.ts'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));

  mkdirSync(join(dir, '.roadmap', 'receipts'), { recursive: true });

  // Write receipts before any commit so they're on disk for the script
  for (const r of (opts.receipts ?? [])) {
    writeFileSync(join(dir, '.roadmap', 'receipts', r.name), JSON.stringify(r.content, null, 2));
  }

  // Git setup
  spawnSync('git', ['init'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'test'], { cwd: dir });

  if (opts.headChanged) {
    // Initial commit WITHOUT head.json so it appears in the diff
    // Write a placeholder so .roadmap/receipts dir is tracked
    writeFileSync(join(dir, '.roadmap', '.gitkeep'), '');
    spawnSync('git', ['add', '-A'], { cwd: dir });
    spawnSync('git', ['commit', '-m', 'initial'], { cwd: dir });

    // Write head.json and commit — now it shows as changed vs HEAD~1
    writeFileSync(join(dir, '.roadmap', 'head.json'), JSON.stringify(opts.headJson, null, 2));
    spawnSync('git', ['add', '-A'], { cwd: dir });
    spawnSync('git', ['commit', '-m', 'add head.json'], { cwd: dir });
  } else {
    // head.json present from the start — unchanged in diff
    writeFileSync(join(dir, '.roadmap', 'head.json'), JSON.stringify(opts.headJson, null, 2));
    spawnSync('git', ['add', '-A'], { cwd: dir });
    spawnSync('git', ['commit', '-m', 'initial'], { cwd: dir });

    // Dummy second commit so HEAD~1 works
    writeFileSync(join(dir, 'dummy.txt'), 'x');
    spawnSync('git', ['add', '-A'], { cwd: dir });
    spawnSync('git', ['commit', '-m', 'dummy change'], { cwd: dir });
  }
}

function runGate(dir: string, baseRef = 'HEAD~1'): { status: number; result: any; stderr: string } {
  const scriptPath = join(dir, 'scripts', 'ci', 'roadmap-spec-origin-gate.ts');
  const r = spawnSync('npx', ['tsx', scriptPath, baseRef], { cwd: dir, encoding: 'utf-8' });
  let result: any = null;
  try { result = JSON.parse(r.stdout); } catch { /* stdout not JSON */ }
  return { status: r.status ?? -1, result, stderr: r.stderr ?? '' };
}

// --- Fixtures ---

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'spec-origin-gate-test-'));
});

afterEach(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// --- Tests ---

describe('spec-origin-gate CI script', () => {
  it('head-unchanged: head.json not in diff → pass immediately', () => {
    setupGitRepo(tmpDir, {
      headJson: { id: 'test-dag' },
      headChanged: false,
    });
    const { status, result } = runGate(tmpDir);

    expect(result).not.toBeNull();
    expect(result.passed).toBe(true);
    expect(result.headChanged).toBe(false);
    expect(status).toBe(0);
  });

  it('manual-edit: head.json changed, no spec field → pass with warning', () => {
    setupGitRepo(tmpDir, {
      headJson: { id: 'hand-crafted-dag', desc: 'no spec field' },
      headChanged: true,
    });
    const { status, result, stderr } = runGate(tmpDir);

    expect(result).not.toBeNull();
    expect(result.passed).toBe(true);
    expect(result.headChanged).toBe(true);
    expect(result.hasSpec).toBe(false);
    expect(result.details).toMatch(/hand-crafted/i);
    expect(stderr).toMatch(/WARNING/);
    expect(status).toBe(0);
  });

  it('spec-pipeline: full chain valid → pass', () => {
    const compiledSha = 'abc123def456';
    const headJson = {
      id: 'spec-pipeline-dag',
      spec: {
        compiled_sha256: compiledSha,
        engine: { name: 'test', version: '1.0' },
        inputs: [],
      },
    };
    // Compute dagHash from the exact serialized content that will be written to disk
    const headContent = JSON.stringify(headJson, null, 2);
    const dagHash = sha256(headContent);

    setupGitRepo(tmpDir, {
      headJson,
      headChanged: true,
      receipts: [
        {
          name: 'spec-compile-test.json',
          content: { type: 'spec-compile', compile_hash: compiledSha },
        },
        {
          // Must start with 'import-' but NOT 'import-compiled' per line 153 filter
          name: 'import-abc123.json',
          content: { type: 'import-compiled', compile_hash: compiledSha, dag_hash: dagHash },
        },
      ],
    });
    const { status, result } = runGate(tmpDir);

    expect(result).not.toBeNull();
    expect(result.passed).toBe(true);
    expect(result.headChanged).toBe(true);
    expect(result.hasSpec).toBe(true);
    expect(result.chainValid).toBe(true);
    expect(result.details).toMatch(/chain verified/);
    expect(status).toBe(0);
  });

  it('hash-mismatch: spec-compile receipt has wrong compile_hash → fail', () => {
    const compiledSha = 'correct-hash-value';
    const headJson = {
      id: 'mismatch-dag',
      spec: {
        compiled_sha256: compiledSha,
        engine: { name: 'test', version: '1.0' },
        inputs: [],
      },
    };

    setupGitRepo(tmpDir, {
      headJson,
      headChanged: true,
      receipts: [
        {
          name: 'spec-compile-wrong.json',
          content: { type: 'spec-compile', compile_hash: 'wrong-hash-value' },
        },
      ],
    });
    const { status, result } = runGate(tmpDir);

    expect(result).not.toBeNull();
    expect(result.passed).toBe(false);
    expect(result.headChanged).toBe(true);
    expect(result.hasSpec).toBe(true);
    expect(result.chainValid).toBe(false);
    expect(result.details).toMatch(/no spec-compile receipt/);
    expect(status).toBe(1);
  });

  it('missing-import-receipt: spec-compile found but no import receipt → fail', () => {
    const compiledSha = 'matched-compile-hash';
    const headJson = {
      id: 'no-import-dag',
      spec: {
        compiled_sha256: compiledSha,
        engine: { name: 'test', version: '1.0' },
        inputs: [],
      },
    };

    setupGitRepo(tmpDir, {
      headJson,
      headChanged: true,
      receipts: [
        {
          name: 'spec-compile-ok.json',
          content: { type: 'spec-compile', compile_hash: compiledSha },
        },
        // No import receipt at all
      ],
    });
    const { status, result } = runGate(tmpDir);

    expect(result).not.toBeNull();
    expect(result.passed).toBe(false);
    expect(result.hasSpec).toBe(true);
    expect(result.chainValid).toBe(false);
    expect(result.details).toMatch(/no import receipt/);
    expect(status).toBe(1);
  });

  it('dag-hash-mismatch: import receipt dag_hash does not match head.json content → fail', () => {
    const compiledSha = 'valid-compile-hash';
    const headJson = {
      id: 'dag-hash-mismatch-dag',
      spec: {
        compiled_sha256: compiledSha,
        engine: { name: 'test', version: '1.0' },
        inputs: [],
      },
    };

    setupGitRepo(tmpDir, {
      headJson,
      headChanged: true,
      receipts: [
        {
          name: 'spec-compile-valid.json',
          content: { type: 'spec-compile', compile_hash: compiledSha },
        },
        {
          name: 'import-valid.json',
          content: {
            type: 'import-compiled',
            compile_hash: compiledSha,
            dag_hash: 'stale-dag-hash-from-before-edit',
          },
        },
      ],
    });
    const { status, result } = runGate(tmpDir);

    expect(result).not.toBeNull();
    expect(result.passed).toBe(false);
    expect(result.hasSpec).toBe(true);
    expect(result.chainValid).toBe(false);
    expect(result.details).toMatch(/no import receipt/);
    expect(status).toBe(1);
  });
});
