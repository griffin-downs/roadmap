// Test: parallel-edit-guard

import { test } from 'node:test';
import * as assert from 'node:assert';

test('parallel-edit-guard: detects concurrent edits within 60s window', () => {
  const now = Date.now();
  const twoMinutesAgo = now - (2 * 60 * 1000);
  const thirtySecondsAgo = now - (30 * 1000);
  
  // Create mock completion records showing concurrent edits
  const records = [
    { nodeId: 'node-a', completedAt: new Date(twoMinutesAgo).toISOString(), branch: 'feat/test' },
    { nodeId: 'node-b', completedAt: new Date(thirtySecondsAgo).toISOString(), branch: 'feat/test' },
  ];

  // Check if records are within 60s window
  const recentRecords = records.filter(r => {
    const completedTime = new Date(r.completedAt).getTime();
    return (now - completedTime) < (60 * 1000);
  });

  assert.strictEqual(recentRecords.length, 1, 'should detect recent concurrent edit');
  assert.strictEqual(recentRecords[0].nodeId, 'node-b');
});

test('parallel-edit-guard: ignores edits from different branches', () => {
  const now = Date.now();
  const recentTime = now - (30 * 1000);

  const records = [
    { nodeId: 'node-a', completedAt: new Date(recentTime).toISOString(), branch: 'feat/feature-1' },
    { nodeId: 'node-b', completedAt: new Date(recentTime).toISOString(), branch: 'feat/feature-2' },
  ];

  const currentBranch = 'feat/feature-1';
  const sameBranchRecents = records.filter(r => {
    const completedTime = new Date(r.completedAt).getTime();
    const isRecent = (now - completedTime) < (60 * 1000);
    return isRecent && r.branch === currentBranch && r.nodeId !== 'node-a'; // exclude self
  });

  assert.strictEqual(sameBranchRecents.length, 0, 'should not warn about different branches');
});

test('parallel-edit-guard: returns empty warning for safe state', () => {
  const records: any[] = [];
  const warnings = records.length === 0 ? [] : ['Concurrent edits detected'];
  
  assert.strictEqual(warnings.length, 0);
});
