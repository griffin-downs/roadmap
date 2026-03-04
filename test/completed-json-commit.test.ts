// Test suite for completed.json pre-commit exemption
import { test } from 'node:test';
import * as assert from 'node:assert';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Mock the Gate 0 logic from pre-commit hook.
 * Simulates: "Direct commit on main/master — block unless only completed.json staged"
 * On feature/develop/wip branches: allow anything
 */
function testGate0(stagedFiles: string[], branch: string): boolean {
  // Feature branches allow all files
  if (branch.startsWith('feat/') || branch.startsWith('wip/') || branch === 'develop') {
    return true; // PASS
  }

  // main/master: block direct commits unless only completed.json
  if (branch === 'main' || branch === 'master') {
    if (stagedFiles.length === 0) {
      return true; // No staged files — PASS
    }

    // Check if only completed.json files are staged
    const nonCompletedFiles = stagedFiles.filter(
      f => !f.includes('.roadmap/completed.json'),
    );

    if (nonCompletedFiles.length === 0) {
      return true; // Only completed.json — PASS
    }

    return false; // Other files mixed in — FAIL
  }

  // Other branches: allow
  return true;
}

// ── Tests ──────────────────────────────────────────────────────────────────

test('main branch: completed.json alone passes guard', () => {
  assert.strictEqual(testGate0(['.roadmap/completed.json'], 'main'), true);
});

test('main branch: head.json alone fails guard', () => {
  assert.strictEqual(testGate0(['.roadmap/head.json'], 'main'), false);
});

test('main branch: completed.json + other files fails guard', () => {
  assert.strictEqual(testGate0(['.roadmap/completed.json', 'src/index.ts'], 'main'), false);
});

test('main branch: empty staged files passes guard', () => {
  assert.strictEqual(testGate0([], 'main'), true);
});

test('main branch: .roadmap/completed.json is the exemption', () => {
  // The exemption is specifically for .roadmap/completed.json
  // The filter matches any file containing '.roadmap/completed.json' substring
  assert.strictEqual(testGate0(['.roadmap/completed.json'], 'main'), true);
});

test('main branch: head.json + completed.json fails guard', () => {
  assert.strictEqual(testGate0(['.roadmap/head.json', '.roadmap/completed.json'], 'main'), false);
});

test('feature branch: all files pass guard', () => {
  assert.strictEqual(testGate0(['.roadmap/head.json', 'src/index.ts', '.roadmap/completed.json'], 'feat/my-task'), true);
});

test('develop branch: all files pass guard', () => {
  assert.strictEqual(testGate0(['.roadmap/head.json', 'src/index.ts'], 'develop'), true);
});

test('wip branch: all files pass guard', () => {
  assert.strictEqual(testGate0(['.roadmap/head.json', 'src/index.ts'], 'wip/research'), true);
});
