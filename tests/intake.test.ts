import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { scanIntake, importIntake, certifyIntake } from '../src/lib/intake.js';

function makeTmpGitRepo(): string {
  const tmp = mkdtempSync(join(tmpdir(), 'intake-test-'));
  execSync('git init', { cwd: tmp, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: tmp, stdio: 'pipe' });
  execSync('git config user.name "test"', { cwd: tmp, stdio: 'pipe' });
  // Initial commit
  writeFileSync(join(tmp, 'README.md'), '# test');
  execSync('git add -A && git commit -m "init"', { cwd: tmp, stdio: 'pipe' });
  return tmp;
}

describe('intake', () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmpGitRepo(); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  describe('scanIntake', () => {
    it('returns empty candidates when no changes', () => {
      const result = scanIntake(tmp);
      expect(result.candidates).toEqual([]);
      expect(result.changedFiles).toEqual([]);
    });

    it('groups changed files into candidates by directory', () => {
      mkdirSync(join(tmp, 'src', 'lib'), { recursive: true });
      writeFileSync(join(tmp, 'src', 'lib', 'foo.ts'), 'export const foo = 1;');
      writeFileSync(join(tmp, 'src', 'lib', 'bar.ts'), 'export const bar = 2;');
      execSync('git add -A && git commit -m "add src"', { cwd: tmp, stdio: 'pipe' });

      const baseSha = execSync('git rev-list --max-parents=0 HEAD', { cwd: tmp, encoding: 'utf-8' }).trim();
      const result = scanIntake(tmp, { baseSha });

      expect(result.candidates.length).toBeGreaterThanOrEqual(1);
      const srcCandidate = result.candidates.find(c => c.id.includes('src-lib'));
      expect(srcCandidate).toBeDefined();
      expect(srcCandidate!.produces).toContain('src/lib/foo.ts');
      expect(srcCandidate!.produces).toContain('src/lib/bar.ts');
    });

    it('skips .roadmap and node_modules paths', () => {
      mkdirSync(join(tmp, '.roadmap'), { recursive: true });
      writeFileSync(join(tmp, '.roadmap', 'state.json'), '{}');
      writeFileSync(join(tmp, 'app.ts'), 'console.log("hi")');
      execSync('git add -A && git commit -m "add files"', { cwd: tmp, stdio: 'pipe' });

      const baseSha = execSync('git rev-list --max-parents=0 HEAD', { cwd: tmp, encoding: 'utf-8' }).trim();
      const result = scanIntake(tmp, { baseSha });

      expect(result.skipped.some(f => f.startsWith('.roadmap/'))).toBe(true);
      expect(result.candidates.every(c => !c.produces.some(p => p.startsWith('.roadmap/')))).toBe(true);
    });
  });

  describe('importIntake', () => {
    it('creates head.json with intake nodes', () => {
      const candidates = [{
        id: 'intake-src',
        desc: 'Intake from src',
        produces: ['src/main.ts'],
        consumes: [],
        changedPaths: ['src/main.ts'],
        intakeFrom: 'abc123',
      }];
      const result = importIntake(tmp, candidates, { dagId: 'test-dag' });
      expect(existsSync(result.dagPath)).toBe(true);
      expect(result.imported).toHaveLength(1);
      expect(result.imported[0].id).toBe('intake-src');

      const dag = JSON.parse(readFileSync(result.dagPath, 'utf-8'));
      expect(dag.nodes['intake-src']).toBeDefined();
      expect(dag.nodes['intake-src'].intakeFrom).toBe('abc123');
    });

    it('writes intake receipt', () => {
      const candidates = [{
        id: 'intake-lib',
        desc: 'Intake from lib',
        produces: ['lib/util.ts'],
        consumes: [],
        changedPaths: ['lib/util.ts'],
        intakeFrom: 'def456',
      }];
      const result = importIntake(tmp, candidates);
      expect(existsSync(result.receipt)).toBe(true);
      const receipt = JSON.parse(readFileSync(result.receipt, 'utf-8'));
      expect(receipt.type).toBe('intake-import');
    });

    it('does not duplicate existing nodes', () => {
      const candidates = [{
        id: 'intake-src',
        desc: 'Intake from src',
        produces: ['src/a.ts'],
        consumes: [],
        changedPaths: ['src/a.ts'],
        intakeFrom: 'abc',
      }];
      importIntake(tmp, candidates, { dagId: 'test' });
      const result = importIntake(tmp, candidates, { dagId: 'test' });
      expect(result.imported).toHaveLength(0);
    });
  });

  describe('certifyIntake', () => {
    it('certifies nodes whose artifacts exist', () => {
      const candidates = [{
        id: 'intake-src',
        desc: 'Intake from src',
        produces: ['src/main.ts'],
        consumes: [],
        changedPaths: ['src/main.ts'],
        intakeFrom: 'abc',
      }];
      importIntake(tmp, candidates, { dagId: 'test' });

      // Create the artifact
      mkdirSync(join(tmp, 'src'), { recursive: true });
      writeFileSync(join(tmp, 'src', 'main.ts'), 'export const main = 1;');
      execSync('git add -A && git commit -m "add main"', { cwd: tmp, stdio: 'pipe' });

      const result = certifyIntake(tmp, ['intake-src']);
      expect(result.certified).toContain('intake-src');
      expect(result.skipped).toHaveLength(0);
    });

    it('skips nodes whose artifacts are missing', () => {
      const candidates = [{
        id: 'intake-missing',
        desc: 'Missing',
        produces: ['does-not-exist.ts'],
        consumes: [],
        changedPaths: ['does-not-exist.ts'],
        intakeFrom: 'abc',
      }];
      importIntake(tmp, candidates, { dagId: 'test' });

      const result = certifyIntake(tmp, ['intake-missing']);
      expect(result.certified).toHaveLength(0);
      expect(result.skipped).toContain('intake-missing');
    });
  });
});
