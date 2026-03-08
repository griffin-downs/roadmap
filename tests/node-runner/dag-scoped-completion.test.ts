// Test: dag-scoped-completion

import { test } from 'node:test';
import * as assert from 'node:assert';
import { CompletionStore } from '../src/runtime/completion.ts';

test('dag-scoped-completion: filterByDagId includes current DAG receipts', () => {
  // Create a mock CompletionStore with mixed DAG receipts
  const records = [
    { nodeId: 'node-a', completedAt: '2026-03-04', dagId: 'dag-1', validationChecks: [{ rule: 'shell', passed: true, evidence: 'pass' }] },
    { nodeId: 'node-b', completedAt: '2026-03-04', dagId: 'dag-2', validationChecks: [{ rule: 'shell', passed: true, evidence: 'pass' }] },
    { nodeId: 'node-c', completedAt: '2026-03-04', dagId: 'dag-1', validationChecks: [{ rule: 'shell', passed: true, evidence: 'pass' }] },
    { nodeId: 'node-d', completedAt: '2026-03-04', validationChecks: [{ rule: 'shell', passed: true, evidence: 'pass' }] }, // legacy, no dagId
  ];

  const store = CompletionStore.fromRecords(records);
  const filtered = store.filterByDagId('dag-1');

  // Should include dag-1 nodes and legacy nodes (no dagId)
  assert.strictEqual(filtered.hasPassing('node-a'), true);
  assert.strictEqual(filtered.hasPassing('node-c'), true);
  assert.strictEqual(filtered.hasPassing('node-d'), true);

  // Should exclude other DAG
  assert.strictEqual(filtered.hasPassing('node-b'), false);
});

test('dag-scoped-completion: filterByDagId excludes other DAGs', () => {
  const records = [
    { nodeId: 'old-node', completedAt: '2026-03-04', dagId: 'old-dag', validationChecks: [{ rule: 'shell', passed: true, evidence: 'pass' }] },
  ];

  const store = CompletionStore.fromRecords(records);
  const filtered = store.filterByDagId('new-dag');

  // Should not include nodes from other DAGs
  assert.strictEqual(filtered.hasPassing('old-node'), false);
});
