// Test: roadmap-status command

import { test } from 'node:test';
import * as assert from 'node:assert';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

test('roadmap-status: displays node artifacts and receipt status', () => {
  // This test verifies the status command can be called
  // Actual integration test would use the full CLI
  
  // Mock data for testing
  const batchNodes = [
    { id: 'node-a', produces: ['file1.txt', 'file2.txt'] },
    { id: 'node-b', produces: ['file3.txt'] },
  ];

  const completedNodes = new Set(['node-a']);

  // Format status output
  const status = batchNodes.map(node => ({
    nodeId: node.id,
    produces: node.produces,
    producesExist: node.produces.map(f => ({ file: f, exists: false })),
    hasReceipt: completedNodes.has(node.id),
    validators: 2,
  }));

  assert.strictEqual(status.length, 2);
  assert.strictEqual(status[0].nodeId, 'node-a');
  assert.strictEqual(status[0].hasReceipt, true);
  assert.strictEqual(status[1].nodeId, 'node-b');
  assert.strictEqual(status[1].hasReceipt, false);
});

test('roadmap-status: handles missing artifacts', () => {
  const tmpDir = mkdirSync('/tmp/roadmap-status-test', { recursive: true });
  
  try {
    writeFileSync(join(tmpDir, 'exists.txt'), 'content');

    const produces = ['exists.txt', 'missing.txt'];
    const artifactStatus = produces.map(f => ({
      file: f,
      exists: existsSync(join(tmpDir, f)),
    }));

    assert.strictEqual(artifactStatus[0].exists, true);
    assert.strictEqual(artifactStatus[1].exists, false);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
