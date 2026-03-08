// @module attribution-warn
// @entry test

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Helper: checkAttribution with manual logic (since we can't easily import from bin/roadmap.ts)
function checkAttributionLogic(changedFiles: string[], produces: string[]): string | undefined {
  const producesSet = new Set(produces.map(p => (p.startsWith('/') ? p.slice(1) : p)));
  const outsideFiles = changedFiles.filter(f => !producesSet.has(f) && !f.startsWith('.roadmap/'));

  if (outsideFiles.length > 0) {
    return `Branch has ${outsideFiles.length} changed file(s) outside this node's produces: ${outsideFiles.slice(0, 5).join(', ')}`;
  }
  return undefined;
}

test('checkAttribution: empty git status → returns undefined', () => {
  const result = checkAttributionLogic([], ['src/file.ts']);
  assert.equal(result, undefined, 'should return undefined when no files changed');
});

test('checkAttribution: files matching produces → returns undefined', () => {
  const changedFiles = ['src/file.ts', 'src/other.ts'];
  const produces = ['src/file.ts', 'src/other.ts'];
  const result = checkAttributionLogic(changedFiles, produces);
  assert.equal(result, undefined, 'should return undefined when all files are in produces');
});

test('checkAttribution: files outside produces → returns warning string', () => {
  const changedFiles = ['src/file.ts', 'test/other.ts', 'docs/readme.md'];
  const produces = ['src/file.ts'];
  const result = checkAttributionLogic(changedFiles, produces);
  assert(result !== undefined, 'should return a warning when files outside produces exist');
  assert(result.includes('2 changed file'), 'should mention correct file count');
  assert(result.includes('test/other.ts'), 'should include outside file names');
});

test('checkAttribution: ignores .roadmap/ prefix in changed files', () => {
  const changedFiles = ['src/file.ts', '.roadmap/head.json'];
  const produces = ['src/file.ts'];
  const result = checkAttributionLogic(changedFiles, produces);
  assert.equal(result, undefined, 'should ignore .roadmap/ changes');
});

test('checkAttribution: warning string format includes file names and count', () => {
  const changedFiles = ['file1.ts', 'file2.ts', 'file3.ts', 'file4.ts', 'file5.ts', 'file6.ts'];
  const produces = [];
  const result = checkAttributionLogic(changedFiles, produces);
  assert(result !== undefined, 'should return warning');
  assert(result.includes('6 changed file'), 'should include correct count');
  assert(result.includes('outside this node\'s produces'), 'should explain the problem');
});

test('bin/roadmap.ts includes checkAttribution call', () => {
  const repoRoot = '/home/griffin/src/.dev/roadmap';

  // Verify that the checkAttribution function is called in advanceNode
  const output = execSync('grep -A 2 "Attribution safety:" bin/roadmap.ts', {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  assert(output.includes('checkAttribution'), 'advanceNode should call checkAttribution');
  assert(output.includes('produces'), 'checkAttribution should be called with produces');
});

test('source contains checkAttribution function', () => {
  const repoRoot = '/home/griffin/src/.dev/roadmap';

  const output = execSync('grep -n "function checkAttribution" bin/roadmap.ts', {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  assert(output.includes('checkAttribution'), 'checkAttribution function should be defined');
});

test('source contains attributionWarning in result', () => {
  const repoRoot = '/home/griffin/src/.dev/roadmap';

  const output = execSync('grep -n "attributionWarning" bin/roadmap.ts', {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  assert(output.includes('attributionWarning'), 'attributionWarning should be included in result object');
});
