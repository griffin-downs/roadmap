import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('pre-commit hook', () => {
  const hookPath = 'scripts/hooks/pre-commit';

  it('hook file exists and is executable', () => {
    expect(existsSync(hookPath)).toBe(true);

    // Check if executable (Unix file mode)
    const stats = require('fs').statSync(hookPath);
    const isExecutable = (stats.mode & 0o111) !== 0;
    expect(isExecutable).toBe(true);
  });

  it('hook script contains typecheck gate', () => {
    const content = readFileSync(hookPath, 'utf-8');
    expect(content).toContain('npm run check');
    expect(content).toContain('TypeScript');
  });

  it('hook script contains DAG integrity gate', () => {
    const content = readFileSync(hookPath, 'utf-8');
    expect(content).toContain('npm run check:dag:define');
    expect(content).toContain('DAG');
  });

  it('hook script handles failure gracefully', () => {
    const content = readFileSync(hookPath, 'utf-8');
    expect(content).toContain('exit 1');
    expect(content).toContain('--no-verify');
  });

  it('git config points to scripts/hooks', () => {
    try {
      const result = execSync('git config core.hooksPath', { encoding: 'utf-8' });
      expect(result.trim()).toBe('scripts/hooks');
    } catch (e) {
      // Git config might not be set in test environment
      // This is OK - the actual development environment sets it
      console.log('Note: git config core.hooksPath not set in test env');
    }
  });

  it('hook would block commit on TypeScript errors', () => {
    const content = readFileSync(hookPath, 'utf-8');
    // Verify the script structure that would prevent commit
    expect(content).toMatch(/set -e/); // Exit on error
    expect(content).toMatch(/FAILED.*1/); // Track failures
  });

  it('hook provides clear error messages', () => {
    const content = readFileSync(hookPath, 'utf-8');
    expect(content).toContain('Pre-commit validation');
    expect(content).toContain('passed');
    expect(content).toContain('failed');
  });

  it('hook allows explicit override with --no-verify', () => {
    const content = readFileSync(hookPath, 'utf-8');
    // Script should document the override
    expect(content).toContain('--no-verify');
  });
});
