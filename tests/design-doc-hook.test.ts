import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('design-doc-hook.sh', () => {
  let tempDir: string;
  const hookPath = join(process.cwd(), 'src/lib/enforcement/design-doc-hook.sh');

  beforeEach(() => {
    tempDir = mkdtempSync(join('/tmp', 'design-doc-hook-'));
    // Initialize minimal git repo
    execSync('git init', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should pass when no untracked .md files in .roadmap/', () => {
    // Create initial commit so git doesn't complain
    writeFileSync(join(tempDir, 'README.md'), 'test');
    execSync('git add README.md', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

    const result = execSync(`bash ${hookPath}`, { cwd: tempDir, stdio: 'pipe' }).toString();
    expect(result).toBe('');
  });

  it('should fail when untracked .md file exists in .roadmap/', () => {
    // Create initial structure
    writeFileSync(join(tempDir, 'README.md'), 'test');
    execSync('git add README.md', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

    // Create untracked .md in .roadmap/
    mkdirSync(join(tempDir, '.roadmap'), { recursive: true });
    writeFileSync(join(tempDir, '.roadmap', 'design.md'), 'untracked design doc');

    try {
      execSync(`bash ${hookPath}`, { cwd: tempDir, stdio: 'pipe' });
      expect.fail('Hook should have rejected untracked design doc');
    } catch (e) {
      const error = e as { status: number; stdout: string; stderr: string };
      expect(error.status).toBe(1);
    }
  });

  it('should pass when untracked .md is in .roadmap/spec/', () => {
    // Create initial commit
    writeFileSync(join(tempDir, 'README.md'), 'test');
    execSync('git add README.md', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

    // Create untracked .md in .roadmap/spec/ (should be allowed)
    mkdirSync(join(tempDir, '.roadmap', 'spec'), { recursive: true });
    writeFileSync(join(tempDir, '.roadmap', 'spec', 'acceptance.md'), 'spec doc');

    const result = execSync(`bash ${hookPath}`, { cwd: tempDir, stdio: 'pipe' }).toString();
    expect(result).toBe('');
  });

  it('should pass when SKIP_DESIGN_CHECK is set', () => {
    // Create initial commit
    writeFileSync(join(tempDir, 'README.md'), 'test');
    execSync('git add README.md', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

    // Create untracked .md in .roadmap/
    mkdirSync(join(tempDir, '.roadmap'), { recursive: true });
    writeFileSync(join(tempDir, '.roadmap', 'design.md'), 'untracked design doc');

    // Should pass with bypass
    const result = execSync(`SKIP_DESIGN_CHECK='testing' bash ${hookPath}`, { cwd: tempDir, stdio: 'pipe' }).toString();
    expect(result).toBe('');
  });

  it('should allow multiple untracked design docs in different subdirs of .roadmap/', () => {
    // Create initial commit
    writeFileSync(join(tempDir, 'README.md'), 'test');
    execSync('git add README.md', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

    // Create multiple untracked .md files in .roadmap/
    mkdirSync(join(tempDir, '.roadmap', 'design'), { recursive: true });
    mkdirSync(join(tempDir, '.roadmap', 'research'), { recursive: true });
    writeFileSync(join(tempDir, '.roadmap', 'design', 'auth-flow.md'), 'auth design');
    writeFileSync(join(tempDir, '.roadmap', 'research', 'findings.md'), 'research findings');

    try {
      execSync(`bash ${hookPath}`, { cwd: tempDir, stdio: 'pipe' });
      expect.fail('Hook should have rejected untracked design docs');
    } catch (e) {
      const error = e as { status: number };
      expect(error.status).toBe(1);
    }
  });

  it('should not match .md files outside .roadmap/', () => {
    // Create initial commit
    writeFileSync(join(tempDir, 'README.md'), 'test');
    execSync('git add README.md', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

    // Create untracked .md outside .roadmap/
    writeFileSync(join(tempDir, 'docs', 'guide.md'), 'guide', { flag: 'a' });
    mkdirSync(join(tempDir, 'docs'), { recursive: true });
    writeFileSync(join(tempDir, 'docs', 'guide.md'), 'guide');

    const result = execSync(`bash ${hookPath}`, { cwd: tempDir, stdio: 'pipe' }).toString();
    expect(result).toBe('');
  });

  it('should provide helpful error message when blocking', () => {
    // Create initial commit
    writeFileSync(join(tempDir, 'README.md'), 'test');
    execSync('git add README.md', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

    // Create untracked .md
    mkdirSync(join(tempDir, '.roadmap'), { recursive: true });
    writeFileSync(join(tempDir, '.roadmap', 'design.md'), 'untracked');

    try {
      execSync(`bash ${hookPath}`, { cwd: tempDir, stdio: 'stderr' });
      expect.fail('Should have thrown');
    } catch (e) {
      const error = e as { stderr: string };
      expect(error.stderr).toContain('Design doc enforcement failed');
      expect(error.stderr).toContain('Untracked design documents');
    }
  });
});
