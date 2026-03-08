// Test suite for make commit warning surfacing
import { test } from 'node:test';
import * as assert from 'node:assert';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Tests ──────────────────────────────────────────────────────────────────

test('roadmap.ts contains commitWarning declaration', () => {
  const roadmapPath = resolve(__dirname, '../bin/roadmap.ts');
  const source = readFileSync(roadmapPath, 'utf-8');

  assert.ok(
    source.includes('let commitWarning: string | undefined'),
    'Expected commitWarning variable declaration in cmdMake'
  );
});

test('roadmap.ts catch block captures stderr from git error', () => {
  const roadmapPath = resolve(__dirname, '../bin/roadmap.ts');
  const source = readFileSync(roadmapPath, 'utf-8');

  assert.ok(
    source.includes('const stderr = e.stderr?.toString().trim()'),
    'Expected stderr extraction from error'
  );

  assert.ok(
    source.includes('commitWarning = `Git commit failed'),
    'Expected commitWarning assignment in catch block'
  );
});

test('roadmap.ts includes commitWarning in JSON output when defined', () => {
  const roadmapPath = resolve(__dirname, '../bin/roadmap.ts');
  const source = readFileSync(roadmapPath, 'utf-8');

  // Check that the spread operator is used conditionally
  assert.ok(
    source.includes('...(commitWarning ? { commitWarning } : {})'),
    'Expected conditional spread of commitWarning in JSON output'
  );
});

test('catch block has proper error handling with fallback', () => {
  const roadmapPath = resolve(__dirname, '../bin/roadmap.ts');
  const source = readFileSync(roadmapPath, 'utf-8');

  // Verify all three fallback levels are present
  assert.ok(
    source.includes('e.stderr?.toString().trim() || e.message || \'unknown error\''),
    'Expected three-level fallback for error message extraction'
  );
});

test('error message includes "Git commit failed" prefix for clarity', () => {
  const roadmapPath = resolve(__dirname, '../bin/roadmap.ts');
  const source = readFileSync(roadmapPath, 'utf-8');

  assert.ok(
    source.includes('Git commit failed (head.json written but uncommitted)'),
    'Expected clear error prefix in commitWarning'
  );
});

test('error message truncates to 200 chars to avoid bloat', () => {
  const roadmapPath = resolve(__dirname, '../bin/roadmap.ts');
  const source = readFileSync(roadmapPath, 'utf-8');

  assert.ok(
    source.includes('.slice(0, 200)'),
    'Expected error message truncation to 200 characters'
  );
});

test('catch block is not empty (original problem fixed)', () => {
  const roadmapPath = resolve(__dirname, '../bin/roadmap.ts');
  const source = readFileSync(roadmapPath, 'utf-8');

  // Check that we don't have the old empty catch block pattern
  assert.ok(
    !source.includes('} catch (e) {\n    // Commit might fail, but DAG is written\n  }'),
    'Expected empty catch block to be replaced with proper error handling'
  );
});
