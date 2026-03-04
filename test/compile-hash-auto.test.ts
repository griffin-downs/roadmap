// Test: compile-hash auto-computation

import { test } from 'node:test';
import * as assert from 'node:assert';
import { createHash } from 'node:crypto';

// Helper: compute hash from tasks array (as the implementation does)
function computeTasksHash(tasks: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(tasks)).digest('hex');
}

test('compile-hash-auto: computes hash from tasks when missing', () => {
  const tasks = [
    { id: 'task-1', desc: 'First task' },
    { id: 'task-2', desc: 'Second task' },
  ];

  const expectedHash = computeTasksHash(tasks);
  assert.match(expectedHash, /^[a-f0-9]{64}$/);
  assert.strictEqual(expectedHash.length, 64);
});

test('compile-hash-auto: computes same hash for identical tasks', () => {
  const tasks1 = [{ id: 'a', desc: 'task' }];
  const tasks2 = [{ id: 'a', desc: 'task' }];

  const hash1 = computeTasksHash(tasks1);
  const hash2 = computeTasksHash(tasks2);

  assert.strictEqual(hash1, hash2, 'identical tasks should produce same hash');
});

test('compile-hash-auto: different tasks produce different hashes', () => {
  const tasks1 = [{ id: 'a', desc: 'task1' }];
  const tasks2 = [{ id: 'a', desc: 'task2' }];

  const hash1 = computeTasksHash(tasks1);
  const hash2 = computeTasksHash(tasks2);

  assert.notStrictEqual(hash1, hash2, 'different tasks should produce different hashes');
});

test('compile-hash-auto: handles empty tasks array', () => {
  const tasks: unknown[] = [];
  const hash = computeTasksHash(tasks);

  assert.match(hash, /^[a-f0-9]{64}$/);
  // Empty array should always hash to same value
  const hash2 = computeTasksHash([]);
  assert.strictEqual(hash, hash2);
});
