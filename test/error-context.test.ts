import test from 'node:test';
import assert from 'node:assert/strict';
import { RoadmapError } from '../src/errors.ts';

test('RoadmapError.toJSON() preserves all context fields', () => {
  const context = {
    fix: 'do X',
    node: 'my-node',
    attempted: '/foo/bar',
    customField: 42,
    nested: { key: 'value' },
  };

  const error = new RoadmapError('NODE_NOT_FOUND', context, 'Custom message');

  const json = error.toJSON();

  // Verify structure
  assert.strictEqual(json.name, 'RoadmapError');
  assert.strictEqual(json.code, 'NODE_NOT_FOUND');
  assert.strictEqual(json.message, 'Custom message');

  // Verify all context fields are present
  assert.deepStrictEqual(json.context, context);
  assert.strictEqual(json.context.fix, 'do X');
  assert.strictEqual(json.context.node, 'my-node');
  assert.strictEqual(json.context.attempted, '/foo/bar');
  assert.strictEqual(json.context.customField, 42);
  assert.deepStrictEqual(json.context.nested, { key: 'value' });
});

test('CLI error payload spreads all context fields', () => {
  const context = {
    fix: 'do X',
    node: 'my-node',
    attempted: '/foo/bar',
    customField: 42,
    errors: ['error1', 'error2'],
  };

  const error = new RoadmapError('VALIDATION_FAILED', context);
  const rej = error.toJSON();
  const code = rej.code;
  const message = rej.message;

  // Simulate what bin/roadmap.ts does
  const { fix: ctxFix, ...restContext } = rej.context ?? {};
  const errorPayload: Record<string, unknown> = {
    code,
    message,
    fix: ctxFix ? [ctxFix] : undefined,
    ...restContext,
  };

  // Verify all fields are present
  assert.strictEqual(errorPayload.code, 'VALIDATION_FAILED');
  assert.ok(errorPayload.message);
  assert.deepStrictEqual(errorPayload.fix, ['do X']);
  assert.strictEqual(errorPayload.node, 'my-node');
  assert.strictEqual(errorPayload.attempted, '/foo/bar');
  assert.strictEqual(errorPayload.customField, 42);
  assert.deepStrictEqual(errorPayload.errors, ['error1', 'error2']);
});

test('context fields without fix are preserved', () => {
  const context = {
    node: 'test-node',
    path: '/some/path',
    expected: 'value1',
    actual: 'value2',
  };

  const error = new RoadmapError('CONTRACT_VIOLATION', context);
  const rej = error.toJSON();

  const { fix: ctxFix, ...restContext } = rej.context ?? {};
  const errorPayload: Record<string, unknown> = {
    code: rej.code,
    message: rej.message,
    fix: ctxFix ? [ctxFix] : undefined,
    ...restContext,
  };

  // fix should be undefined (not present)
  assert.strictEqual(errorPayload.fix, undefined);

  // All other fields should be present
  assert.strictEqual(errorPayload.node, 'test-node');
  assert.strictEqual(errorPayload.path, '/some/path');
  assert.strictEqual(errorPayload.expected, 'value1');
  assert.strictEqual(errorPayload.actual, 'value2');
});
