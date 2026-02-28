import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync, spawnSync } from 'node:child_process';
import { saveCompletionWithEvidence, loadCompletionsWithEvidence, hasPassingReceipt } from '../src/lib/completion-evidence.ts';

const repoRoot = join(import.meta.dirname, '..');
const bin = join(repoRoot, 'bin', 'roadmap.ts');

let tmpDir: string;

function initGitRepo(dir: string): void {
  spawnSync('git', ['init'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'test'], { cwd: dir });
  writeFileSync(join(dir, 'dummy.txt'), 'x');
  spawnSync('git', ['add', '-A'], { cwd: dir });
  spawnSync('git', ['commit', '-m', 'initial'], { cwd: dir });
}

// Minimal 2-node DAG for CLI integration tests
const minimalDag = {
  id: 'gitsha-test',
  desc: 'test',
  init: 'init',
  term: 'term',
  nodes: {
    init: { id: 'init', desc: 'init', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
    term: { id: 'term', desc: 'term', produces: [], consumes: [], deps: ['init'], validate: [], idempotent: true },
  },
};

// Set up a temp dir as a git repo with a roadmap DAG
function setupTestRepo(dir: string): void {
  mkdirSync(join(dir, '.roadmap'), { recursive: true });
  writeFileSync(join(dir, '.roadmap', 'head.json'), JSON.stringify(minimalDag, null, 2));
  writeFileSync(join(dir, '.roadmap', 'completed.json'), JSON.stringify([]));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
  initGitRepo(dir);
}

function readCompleted(dir: string): any[] {
  return JSON.parse(readFileSync(join(dir, '.roadmap', 'completed.json'), 'utf-8'));
}

function getHeadSha(dir: string): string {
  return execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf-8' }).trim();
}

describe('completion-evidence gitSha', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gitsha-test-'));
    mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('emits gitSha as 40-char hex string', () => {
    initGitRepo(tmpDir);
    saveCompletionWithEvidence(tmpDir, 'node-a', [{ rule: 'artifact-exists', passed: true, evidence: 'ok' }]);
    const records = loadCompletionsWithEvidence(tmpDir);
    const record = records.get('node-a');
    expect(record).toBeDefined();
    expect(record!.gitSha).toBeDefined();
    expect(record!.gitSha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('gitSha matches HEAD of the repo', () => {
    initGitRepo(tmpDir);
    const expectedSha = execSync('git rev-parse HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();
    saveCompletionWithEvidence(tmpDir, 'node-b', [{ rule: 'shell', passed: true, evidence: 'ok' }]);
    const record = loadCompletionsWithEvidence(tmpDir).get('node-b');
    expect(record!.gitSha).toBe(expectedSha);
  });

  it('omits gitSha in non-git directory', () => {
    // No git init — just a bare temp dir
    saveCompletionWithEvidence(tmpDir, 'node-c', [{ rule: 'artifact-exists', passed: true, evidence: 'ok' }]);
    const record = loadCompletionsWithEvidence(tmpDir).get('node-c');
    expect(record).toBeDefined();
    expect(record!.gitSha).toBeUndefined();
  });

  it('hasPassingReceipt unaffected by gitSha field', () => {
    initGitRepo(tmpDir);
    saveCompletionWithEvidence(tmpDir, 'node-d', [{ rule: 'artifact-exists', passed: true, evidence: 'ok' }]);
    const record = loadCompletionsWithEvidence(tmpDir).get('node-d');
    expect(record!.gitSha).toBeDefined();
    expect(hasPassingReceipt(record)).toBe(true);
  });
});

describe('CLI gitSha integration', () => {
  let cliTmpDir: string;

  beforeEach(() => {
    cliTmpDir = mkdtempSync(join(tmpdir(), 'gitsha-cli-'));
    setupTestRepo(cliTmpDir);
  });

  afterEach(() => {
    rmSync(cliTmpDir, { recursive: true, force: true });
  });

  it('complete emits gitSha in completed.json', () => {
    const expectedSha = getHeadSha(cliTmpDir);

    const result = spawnSync(
      'npx', ['tsx', bin, 'complete', 'init', '--note', 'test', '--skip-validate'],
      {
        cwd: cliTmpDir,
        encoding: 'utf-8',
        env: { ...process.env, SKIP_PLAN_GATE: '1', AGENT_ID: 'test-agent' },
      },
    );

    expect(result.status).toBe(0);

    const records = readCompleted(cliTmpDir);
    const record = records.find((r: any) => r.nodeId === 'init');
    expect(record).toBeDefined();
    expect(record.gitSha).toBeDefined();
    expect(record.gitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(record.gitSha).toBe(expectedSha);
  });

  it('certify emits gitSha in completed.json', () => {
    const expectedSha = getHeadSha(cliTmpDir);

    // certify on init node (validate: [] — trivially passes)
    const result = spawnSync(
      'npx', ['tsx', bin, 'certify', 'init', '--note', 'test'],
      {
        cwd: cliTmpDir,
        encoding: 'utf-8',
        env: { ...process.env, AGENT_ID: 'test-agent' },
      },
    );

    expect(result.status).toBe(0);

    const records = readCompleted(cliTmpDir);
    const record = records.find((r: any) => r.nodeId === 'init');
    expect(record).toBeDefined();
    expect(record.gitSha).toBeDefined();
    expect(record.gitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(record.gitSha).toBe(expectedSha);
  });
});
