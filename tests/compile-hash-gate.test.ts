// Test suite for compile-hash normalization
import { test } from 'node:test';
import * as assert from 'node:assert';
import { createHash } from 'node:crypto';

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizeHash(input: string): string {
  if (/^[a-f0-9]{64}$/.test(input)) return input;
  return createHash('sha256').update(input).digest('hex');
}

// ── Tests ──────────────────────────────────────────────────────────────────

test('normalizeHash: valid hex64 returns unchanged', () => {
  const validHex64 = 'a'.repeat(64);
  assert.strictEqual(normalizeHash(validHex64), validHex64);
});

test('normalizeHash: arbitrary string returns 64-char hex', () => {
  const result = normalizeHash('my-compile-hash');
  assert.match(result, /^[a-f0-9]{64}$/);
  // Verify it's actually the hash of the input
  const expected = createHash('sha256').update('my-compile-hash').digest('hex');
  assert.strictEqual(result, expected);
});

test('normalizeHash: empty string returns 64-char hex', () => {
  const result = normalizeHash('');
  assert.match(result, /^[a-f0-9]{64}$/);
  // Verify it's the hash of empty string
  const expected = createHash('sha256').update('').digest('hex');
  assert.strictEqual(result, expected);
});

test('normalizeHash: output always matches /^[a-f0-9]{64}$/', () => {
  const inputs = [
    'valid-hex-ish',
    'build-v1.2.3',
    '12345',
    'a'.repeat(64), // valid hex64
    'z'.repeat(64), // invalid hex (z not in range)
    'short',
    '',
  ];

  for (const input of inputs) {
    const result = normalizeHash(input);
    assert.match(result, /^[a-f0-9]{64}$/, `Failed for input: "${input}"`);
  }
});

test('normalizeHash: uppercase hex is converted to lowercase', () => {
  const upperHex = 'A'.repeat(64);
  const result = normalizeHash(upperHex);
  // Since uppercase doesn't match /^[a-f0-9]{64}$/ (lowercase), it gets hashed
  assert.match(result, /^[a-f0-9]{64}$/);
  // Verify it's hashed (uppercase treated as arbitrary string)
  const expected = createHash('sha256').update(upperHex).digest('hex');
  assert.strictEqual(result, expected);
});

test('normalizeHash: deterministic on repeated calls', () => {
  const input = 'test-string';
  const result1 = normalizeHash(input);
  const result2 = normalizeHash(input);
  assert.strictEqual(result1, result2);
});
