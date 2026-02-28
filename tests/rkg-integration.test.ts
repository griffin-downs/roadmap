import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const repoRoot = join(__dirname, '..');

describe('rkg-all integration', () => {
  it('tsc --noEmit is clean', () => {
    const result = execSync('npx tsc --noEmit', {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // tsc returns empty stdout on success
    expect(result.trim()).toBe('');
  });

  it('all rkg library modules exist', () => {
    const modules = [
      'src/lib/verify.ts',
      'src/lib/federation.ts',
      'src/lib/completion-store.ts',
      'src/lib/completion-evidence.ts',
      'src/lib/completion-context.ts',
      'src/lib/validator-runner.ts',
      'src/lib/spec-origin.ts',
      'src/lib/plan-selection.ts',
      'src/lib/plan-overlay.ts',
      'src/lib/dispatch.ts',
      'src/lib/intake.ts',
    ];
    for (const mod of modules) {
      expect(existsSync(join(repoRoot, mod)), `missing: ${mod}`).toBe(true);
    }
  });

  it('kernel.json governance policy exists', () => {
    expect(existsSync(join(repoRoot, '.roadmap', 'kernel.json'))).toBe(true);
  });

  it('all test files exist', () => {
    const tests = [
      'tests/attestation.test.ts',
      'tests/federation.test.ts',
      'tests/dispatch.test.ts',
      'tests/ux-explain.test.ts',
    ];
    for (const t of tests) {
      expect(existsSync(join(repoRoot, t)), `missing: ${t}`).toBe(true);
    }
  });
});
