import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  validateEntry,
  migrateEntry,
  loadCompletionsWithEvidence,
  saveCompletionWithEvidence,
  type CompletionRecordWithEvidence,
} from '../src/runtime/completion.ts';

const TEST_REPO = '/tmp/roadmap-schema-test';

function setupTestRepo() {
  if (existsSync(TEST_REPO)) {
    rmSync(TEST_REPO, { recursive: true });
  }
  mkdirSync(join(TEST_REPO, '.roadmap'), { recursive: true });
}

function cleanupTestRepo() {
  if (existsSync(TEST_REPO)) {
    rmSync(TEST_REPO, { recursive: true });
  }
}

test('validateEntry: accepts valid entry with required fields', () => {
  const valid: CompletionRecordWithEvidence = {
    nodeId: 'test-node',
    completedAt: '2026-03-03T10:00:00.000Z',
  };
  assert.ok(validateEntry(valid));
});

test('validateEntry: rejects null', () => {
  assert.ok(!validateEntry(null));
});

test('validateEntry: rejects undefined', () => {
  assert.ok(!validateEntry(undefined));
});

test('validateEntry: rejects missing nodeId', () => {
  const invalid = {
    completedAt: '2026-03-03T10:00:00.000Z',
  };
  assert.ok(!validateEntry(invalid));
});

test('validateEntry: rejects missing completedAt', () => {
  const invalid = {
    nodeId: 'test-node',
  };
  assert.ok(!validateEntry(invalid));
});

test('validateEntry: rejects non-string nodeId', () => {
  const invalid = {
    nodeId: 123,
    completedAt: '2026-03-03T10:00:00.000Z',
  };
  assert.ok(!validateEntry(invalid));
});

test('validateEntry: rejects non-string completedAt', () => {
  const invalid = {
    nodeId: 'test-node',
    completedAt: 1234567890,
  };
  assert.ok(!validateEntry(invalid));
});

test('validateEntry: accepts entry with optional fields', () => {
  const valid: CompletionRecordWithEvidence = {
    nodeId: 'test-node',
    completedAt: '2026-03-03T10:00:00.000Z',
    owner: 'agent-1',
    checkpointId: 'cp-123',
    legacy: true,
    validationChecks: [
      { rule: 'test', passed: true, evidence: 'passed' },
    ],
  };
  assert.ok(validateEntry(valid));
});

test('migrateEntry: converts legacy format without evidence', () => {
  const legacy = {
    nodeId: 'old-node',
    completedAt: '2026-03-03',
    legacy: true,
  };
  const migrated = migrateEntry(legacy);
  assert.equal(migrated.nodeId, 'old-node');
  assert.equal(migrated.completedAt, '2026-03-03');
  assert.ok(migrated.legacy);
  assert.ok(!migrated.validationChecks || migrated.validationChecks.length === 0);
});

test('migrateEntry: converts old evidence string format', () => {
  const legacy = {
    nodeId: 'old-node',
    completedAt: '2026-03-03T10:00:00.000Z',
    evidence: 'src/file.ts committed abc123',
  };
  const migrated = migrateEntry(legacy);
  assert.equal(migrated.nodeId, 'old-node');
  assert.equal(migrated.completedAt, '2026-03-03T10:00:00.000Z');
  assert.ok(migrated.legacy);
});

test('migrateEntry: preserves evidence array', () => {
  const legacy = {
    nodeId: 'node-with-checks',
    completedAt: '2026-03-03T10:00:00.000Z',
    evidence: [
      { rule: 'artifact-exists:file.ts', passed: true, evidence: 'file exists' },
      { rule: 'shell:test', passed: true, evidence: 'exit 0' },
    ],
  };
  const migrated = migrateEntry(legacy);
  assert.equal(migrated.nodeId, 'node-with-checks');
  assert.ok(migrated.validationChecks);
  assert.equal(migrated.validationChecks.length, 2);
  assert.equal(migrated.validationChecks[0].rule, 'artifact-exists:file.ts');
});

test('migrateEntry: handles validationChecks field', () => {
  const entry = {
    nodeId: 'node-with-checks',
    completedAt: '2026-03-03T10:00:00.000Z',
    validationChecks: [
      { rule: 'shell:test', passed: true, evidence: 'passed' },
    ],
  };
  const migrated = migrateEntry(entry);
  assert.ok(migrated.validationChecks);
  assert.equal(migrated.validationChecks.length, 1);
});

test('migrateEntry: preserves optional fields', () => {
  const entry = {
    nodeId: 'test-node',
    completedAt: '2026-03-03T10:00:00.000Z',
    owner: 'agent-1',
    checkpointId: 'cp-123',
    gitSha: 'abc123',
    treeSha: 'def456',
  };
  const migrated = migrateEntry(entry);
  assert.equal(migrated.owner, 'agent-1');
  assert.equal(migrated.checkpointId, 'cp-123');
  assert.equal(migrated.gitSha, 'abc123');
  assert.equal(migrated.treeSha, 'def456');
  assert.ok(migrated.legacy);
});

test('migrateEntry: generates timestamp if missing', () => {
  const entry = {
    nodeId: 'test-node',
  };
  const migrated = migrateEntry(entry);
  assert.equal(migrated.nodeId, 'test-node');
  assert.ok(migrated.completedAt);
  // completedAt should be a valid ISO string
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(migrated.completedAt));
});

test('loadCompletionsWithEvidence: migrates legacy entries on read', () => {
  setupTestRepo();
  try {
    // Write a file with mixed legacy and new format entries
    const completionPath = join(TEST_REPO, '.roadmap', 'completed.json');
    writeFileSync(
      completionPath,
      JSON.stringify([
        { nodeId: 'legacy-1', completedAt: '2026-03-03', legacy: true },
        { nodeId: 'legacy-2', completedAt: '2026-03-03', evidence: 'old format' },
        {
          nodeId: 'new-format',
          completedAt: '2026-03-03T10:00:00.000Z',
          validationChecks: [{ rule: 'test', passed: true, evidence: 'passed' }],
        },
      ]),
      'utf-8',
    );

    const loaded = loadCompletionsWithEvidence(TEST_REPO);
    assert.equal(loaded.size, 3);

    // All entries should be valid after migration
    const legacy1 = loaded.get('legacy-1');
    assert.ok(legacy1);
    assert.ok(validateEntry(legacy1));
    assert.equal(legacy1.nodeId, 'legacy-1');

    const legacy2 = loaded.get('legacy-2');
    assert.ok(legacy2);
    assert.ok(validateEntry(legacy2));

    const newFormat = loaded.get('new-format');
    assert.ok(newFormat);
    assert.ok(validateEntry(newFormat));
    assert.ok(newFormat.validationChecks);
    assert.equal(newFormat.validationChecks.length, 1);
  } finally {
    cleanupTestRepo();
  }
});

test('saveCompletionWithEvidence: validates entry before saving', () => {
  setupTestRepo();
  try {
    saveCompletionWithEvidence(
      TEST_REPO,
      'test-node',
      [{ rule: 'test', passed: true, evidence: 'passed' }],
      'agent-1',
    );

    const completionPath = join(TEST_REPO, '.roadmap', 'completed.json');
    const data = JSON.parse(readFileSync(completionPath, 'utf-8'));

    assert.ok(Array.isArray(data));
    assert.equal(data.length, 1);
    const entry = data[0];
    assert.ok(validateEntry(entry));
    assert.equal(entry.nodeId, 'test-node');
    assert.ok(entry.validationChecks);
  } finally {
    cleanupTestRepo();
  }
});

test('Real .roadmap/completed.json: all entries pass validation after migration', () => {
  const completionPath = join(
    '/home/griffin/src/.dev/roadmap',
    '.roadmap',
    'completed.json',
  );
  if (!existsSync(completionPath)) {
    console.log('Skipping: completed.json not found');
    return;
  }

  const raw = JSON.parse(readFileSync(completionPath, 'utf-8'));
  assert.ok(Array.isArray(raw), 'completed.json should be an array');

  let validCount = 0;
  let migratedCount = 0;

  for (const entry of raw) {
    if (validateEntry(entry)) {
      validCount++;
    } else {
      const migrated = migrateEntry(entry);
      assert.ok(validateEntry(migrated), `Entry failed validation after migration: ${JSON.stringify(entry)}`);
      migratedCount++;
    }
  }

  assert.ok(
    validCount + migratedCount === raw.length,
    `All ${raw.length} entries should be valid or migratable`,
  );

  console.log(
    `  ${validCount} entries already valid, ${migratedCount} entries migrated`,
  );
});
