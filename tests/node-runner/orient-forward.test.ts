// Test: orient-forward — scanPendingSpecs

import { test } from 'node:test';
import * as assert from 'node:assert';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { resolve } from 'path';
import { scanPendingSpecs } from '../src/lib/orient-forward.ts';

test('orient-forward: scanPendingSpecs finds unloaded specs', async () => {
  const testDir = '/tmp/orient-forward-test';
  try {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    mkdirSync(resolve(testDir, '.roadmap'), { recursive: true });

    // Create test spec files
    writeFileSync(
      resolve(testDir, '.roadmap/phase-a-spec.json'),
      JSON.stringify({ dag_id: 'phase-a', dag_desc: 'Phase A' })
    );
    writeFileSync(
      resolve(testDir, '.roadmap/phase-b-spec.json'),
      JSON.stringify({ dag_id: 'phase-b', dag_desc: 'Phase B' })
    );

    // Scan with current dag_id = phase-a
    const pending = scanPendingSpecs(testDir, 'phase-a');

    // Should find phase-b as pending, exclude phase-a
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].dagId, 'phase-b');
    assert.strictEqual(pending[0].desc, 'Phase B');
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('orient-forward: returns empty array when no specs present', async () => {
  const testDir = '/tmp/orient-forward-test-empty';
  try {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(resolve(testDir, '.roadmap'), { recursive: true });

    const pending = scanPendingSpecs(testDir, 'current-dag');
    assert.strictEqual(pending.length, 0);
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('orient-forward: skips spec-origin.json and invalid specs', async () => {
  const testDir = '/tmp/orient-forward-test-invalid';
  try {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(resolve(testDir, '.roadmap'), { recursive: true });

    writeFileSync(
      resolve(testDir, '.roadmap/spec-origin.json'),
      JSON.stringify({ dag_id: 'should-be-ignored' })
    );
    writeFileSync(resolve(testDir, '.roadmap/bad-spec-spec.json'), 'not json');

    const pending = scanPendingSpecs(testDir, 'current');
    assert.strictEqual(pending.length, 0, 'should skip spec-origin.json and invalid JSON');
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});
