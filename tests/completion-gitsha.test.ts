import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync, spawnSync } from 'node:child_process';
import { saveCompletionWithEvidence, loadCompletionsWithEvidence, hasPassingReceipt } from '../src/lib/completion-evidence.ts';

let tmpDir: string;

function initGitRepo(dir: string): void {
  spawnSync('git', ['init'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'test'], { cwd: dir });
  writeFileSync(join(dir, 'dummy.txt'), 'x');
  spawnSync('git', ['add', '-A'], { cwd: dir });
  spawnSync('git', ['commit', '-m', 'initial'], { cwd: dir });
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
