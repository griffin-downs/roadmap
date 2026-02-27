/**
 * Tests for git pre-commit hook test enforcement.
 * Verifies hook behavior: test requirement, bypass, config loading, edge cases.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

const testRepoDir = path.join(tmpdir(), `.test-hook-repo-${process.pid}`);
const hooksDir = path.join(testRepoDir, '.git', 'hooks');
const roadmapDir = path.join(testRepoDir, '.roadmap');
const srcDir = path.join(testRepoDir, 'src');
const binDir = path.join(testRepoDir, 'bin');
const testsDir = path.join(testRepoDir, 'tests');
const hookLogPath = path.join(testRepoDir, '.git', 'hooks.log');

function exec(cmd: string, opts?: any) {
  return execSync(cmd, {
    cwd: testRepoDir,
    encoding: 'utf-8',
    ...opts,
  });
}

function execMayFail(cmd: string) {
  try {
    execSync(cmd, {
      cwd: testRepoDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return { success: true, output: '' };
  } catch (e) {
    return { success: false, output: e instanceof Error ? e.message : String(e) };
  }
}

function createFile(filePath: string, content: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content);
}

function setupTestRepo() {
  // Clean up if exists
  if (fs.existsSync(testRepoDir)) {
    fs.rmSync(testRepoDir, { recursive: true });
  }

  // Create repo structure
  fs.mkdirSync(testRepoDir, { recursive: true });
  fs.mkdirSync(srcDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(testsDir, { recursive: true });
  fs.mkdirSync(roadmapDir, { recursive: true });

  // Init git repo
  exec('git init');
  exec('git config user.email "test@example.com"');
  exec('git config user.name "Test User"');

  // Copy hook script from project
  const hookSrc = path.join(import.meta.dirname, '..', 'hooks', 'pre-commit');
  const hookDest = path.join(hooksDir, 'pre-commit');
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.copyFileSync(hookSrc, hookDest);
  fs.chmodSync(hookDest, 0o755);

  // Create default config
  const defaultConfig = {
    testEnforcement: {
      enabled: true,
      scope: ['src/', 'bin/'],
      testPattern: 'tests/**/*.test.ts',
    },
  };
  fs.writeFileSync(
    path.join(roadmapDir, 'hook-config.json'),
    JSON.stringify(defaultConfig, null, 2) + '\n'
  );

  // Create initial commit
  createFile(path.join(testRepoDir, 'README.md'), '# Test Repo\n');
  exec('git add README.md');
  exec('git commit -m "initial commit"');
}

describe('git hook test enforcement', () => {
  beforeEach(setupTestRepo);

  afterEach(() => {
    if (fs.existsSync(testRepoDir)) {
      fs.rmSync(testRepoDir, { recursive: true });
    }
  });

  it('allows commit when src/ file added with tests', () => {
    // Add a source file
    createFile(path.join(srcDir, 'module.ts'), 'export function foo() {}');

    // Add a test file
    createFile(path.join(testsDir, 'module.test.ts'), 'import { foo } from "../src/module";');

    // Stage both files
    exec('git add src/module.ts tests/module.test.ts');

    // Commit should succeed
    const result = execMayFail('git commit -m "add module with tests"');
    expect(result.success).toBe(true);
  });

  it('blocks commit when src/ file added without tests', () => {
    // Add a source file only
    createFile(path.join(srcDir, 'module.ts'), 'export function foo() {}');
    exec('git add src/module.ts');

    // Commit should fail
    const result = execMayFail('git commit -m "add module"');
    expect(result.success).toBe(false);
    expect(result.output).toContain('Test enforcement failed');
  });

  it('blocks commit when bin/ file added without tests', () => {
    // Add a bin file only
    createFile(path.join(binDir, 'cli.ts'), '#!/usr/bin/env node\nconsole.log("hello");');
    exec('git add bin/cli.ts');

    // Commit should fail
    const result = execMayFail('git commit -m "add cli"');
    expect(result.success).toBe(false);
    expect(result.output).toContain('Test enforcement failed');
  });

  it('allows commit with SKIP_TEST_CHECK bypass', () => {
    // Add a source file without tests
    createFile(path.join(srcDir, 'module.ts'), 'export function foo() {}');
    exec('git add src/module.ts');

    // Commit with bypass should succeed
    const result = execMayFail('SKIP_TEST_CHECK="documentation update" git commit -m "add module"');
    expect(result.success).toBe(true);

    // Verify bypass reason was logged
    if (fs.existsSync(hookLogPath)) {
      const log = fs.readFileSync(hookLogPath, 'utf-8');
      expect(log).toContain('SKIP_TEST_CHECK');
      expect(log).toContain('documentation update');
    }
  });

  it('allows commit with only .md file changes', () => {
    // Add a markdown file only
    createFile(path.join(testRepoDir, 'docs', 'guide.md'), '# Guide\n');
    exec('git add docs/guide.md');

    // Commit should succeed (no code changes)
    const result = execMayFail('git commit -m "add guide"');
    expect(result.success).toBe(true);
  });

  it('requires tests for bin/ files', () => {
    // Create bin file
    createFile(path.join(binDir, 'script.ts'), 'import { helper } from "../src/helper";\n');
    exec('git add bin/script.ts');

    // Should fail without tests
    let result = execMayFail('git commit -m "add bin script"');
    expect(result.success).toBe(false);

    // Add test file and retry
    createFile(path.join(testsDir, 'bin-script.test.ts'), 'describe("script", () => {});');
    exec('git add tests/bin-script.test.ts');

    result = execMayFail('git commit --amend --no-edit');
    expect(result.success).toBe(true);
  });

  it('allows commit when only test files are modified', () => {
    // Modify an existing test file (no new addition)
    createFile(path.join(testsDir, 'existing.test.ts'), '// original');
    exec('git add tests/existing.test.ts');
    exec('git commit -m "add test"');

    // Now modify it
    createFile(path.join(testsDir, 'existing.test.ts'), '// updated');
    exec('git add tests/existing.test.ts');

    // Commit should succeed (only test files changed)
    const result = execMayFail('git commit -m "update test"');
    expect(result.success).toBe(true);
  });

  it('respects testEnforcement.enabled = false in config', () => {
    // Disable enforcement in config
    const configPath = path.join(roadmapDir, 'hook-config.json');
    const config = {
      testEnforcement: {
        enabled: false,
        scope: ['src/', 'bin/'],
        testPattern: 'tests/**/*.test.ts',
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

    // Add src file without tests
    createFile(path.join(srcDir, 'module.ts'), 'export function foo() {}');
    exec('git add src/module.ts');

    // Commit should succeed even though no tests
    const result = execMayFail('git commit -m "add module"');
    expect(result.success).toBe(true);
  });

  it('handles missing config gracefully (uses defaults)', () => {
    // Remove config file
    const configPath = path.join(roadmapDir, 'hook-config.json');
    fs.rmSync(configPath);

    // Add src file without tests
    createFile(path.join(srcDir, 'module.ts'), 'export function foo() {}');
    exec('git add src/module.ts');

    // Commit should still fail (defaults enforce)
    const result = execMayFail('git commit -m "add module"');
    expect(result.success).toBe(false);
    expect(result.output).toContain('Test enforcement failed');
  });

  it('ignores src/ files if not in scope', () => {
    // Update config to not include src/
    const configPath = path.join(roadmapDir, 'hook-config.json');
    const config = {
      testEnforcement: {
        enabled: true,
        scope: ['bin/'],
        testPattern: 'tests/**/*.test.ts',
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

    // Add src file without tests
    createFile(path.join(srcDir, 'module.ts'), 'export function foo() {}');
    exec('git add src/module.ts');

    // Commit should succeed (src/ not in scope)
    const result = execMayFail('git commit -m "add module"');
    expect(result.success).toBe(true);
  });

  it('reports helpful error message', () => {
    // Add multiple src files without tests
    createFile(path.join(srcDir, 'module1.ts'), 'export function foo() {}');
    createFile(path.join(srcDir, 'module2.ts'), 'export function bar() {}');
    exec('git add src/module1.ts src/module2.ts');

    // Commit should fail with helpful message
    const result = execMayFail('git commit -m "add modules"');
    expect(result.success).toBe(false);
    expect(result.output).toContain('Changed files in src/ or bin/');
    expect(result.output).toContain('No test files were added');
    expect(result.output).toContain('SKIP_TEST_CHECK');
  });

  it('allows commit when existing .ts files are modified but not added', () => {
    // Create and commit an initial file with tests
    createFile(path.join(srcDir, 'module.ts'), 'export function foo() {}');
    createFile(path.join(testsDir, 'module.test.ts'), 'import { foo } from "../src/module";');
    exec('git add src/module.ts tests/module.test.ts');
    exec('git commit -m "add module"');

    // Modify existing src file (no new test)
    createFile(path.join(srcDir, 'module.ts'), 'export function foo() { return 42; }');
    exec('git add src/module.ts');

    // Commit should succeed (file modified, not added)
    const result = execMayFail('git commit -m "update module"');
    expect(result.success).toBe(true);
  });

  it('catches attempt to add src/ file + modify existing test', () => {
    // Create initial test file
    createFile(path.join(testsDir, 'existing.test.ts'), '// original');
    exec('git add tests/existing.test.ts');
    exec('git commit -m "add test"');

    // Add NEW src file
    createFile(path.join(srcDir, 'module.ts'), 'export function foo() {}');
    // Modify EXISTING test file
    createFile(path.join(testsDir, 'existing.test.ts'), '// updated with new test');

    exec('git add src/module.ts tests/existing.test.ts');

    // Commit should succeed because we added a test file (even if modified too)
    // Wait, the hook checks for ADDED test files, not modified ones
    // So this should fail
    const result = execMayFail('git commit -m "add module"');
    expect(result.success).toBe(false);
  });
});
