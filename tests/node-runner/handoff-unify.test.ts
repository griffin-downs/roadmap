import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  HandoffJournal,
  writeInterimHandoff,
  writeFinalHandoff,
  journalDir,
} from '../src/lib/agent-dispatch/handoff-journal.ts';
import type { InterimHandoff, FinalHandoff } from '../src/lib/brief.ts';

test('HandoffJournal writes interim handoffs to .roadmap/.handoff/', async () => {
  const tmpDir = mkdtempSync(join('/tmp', 'handoff-unify-'));
  try {
    const journal = new HandoffJournal(tmpDir);
    const nodeId = 'test-node-1';
    const interim: InterimHandoff = {
      timestamp: '2025-03-04T10:30:00Z',
      progress: 0.5,
      context: 'Testing interim handoff',
      blockers: [],
    };

    await journal.writeInterim(nodeId, interim);

    const handoffDir = join(tmpDir, '.roadmap', '.handoff');
    assert(existsSync(handoffDir), 'handoff directory should exist at .roadmap/.handoff');

    const files = readdirSync(handoffDir);
    assert(files.length > 0, 'interim handoff file should exist');
    assert(files[0].startsWith(`${nodeId}-interim-`), 'interim file should have correct prefix');
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test('HandoffJournal writes final handoffs to .roadmap/.handoff/', async () => {
  const tmpDir = mkdtempSync(join('/tmp', 'handoff-unify-'));
  try {
    const journal = new HandoffJournal(tmpDir);
    const nodeId = 'test-node-2';
    const final: FinalHandoff = {
      timestamp: '2025-03-04T11:00:00Z',
      summary: 'Work completed successfully',
      gotchas: [],
      keyDecisions: [],
    };

    await journal.writeFinal(nodeId, final);

    const handoffDir = join(tmpDir, '.roadmap', '.handoff');
    assert(existsSync(handoffDir), 'handoff directory should exist at .roadmap/.handoff');

    const filePath = join(handoffDir, `${nodeId}.json`);
    assert(existsSync(filePath), 'final handoff file should exist');

    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    assert.strictEqual(data.summary, 'Work completed successfully');
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test('standalone writeInterimHandoff writes to .roadmap/.handoff/', async () => {
  const tmpDir = mkdtempSync(join('/tmp', 'handoff-unify-'));
  try {
    const nodeId = 'test-node-3';
    const interim: InterimHandoff = {
      timestamp: '2025-03-04T12:00:00Z',
      progress: 0.75,
      context: 'Testing standalone function',
      blockers: [],
    };

    await writeInterimHandoff(tmpDir, nodeId, interim);

    const handoffDir = join(tmpDir, '.roadmap', '.handoff');
    assert(existsSync(handoffDir), 'handoff directory should exist at .roadmap/.handoff');

    const files = readdirSync(handoffDir);
    assert(files.length > 0, 'interim file should exist');
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test('standalone writeFinalHandoff writes to .roadmap/.handoff/', async () => {
  const tmpDir = mkdtempSync(join('/tmp', 'handoff-unify-'));
  try {
    const nodeId = 'test-node-4';
    const final: FinalHandoff = {
      timestamp: '2025-03-04T12:30:00Z',
      summary: 'Standalone final handoff',
      gotchas: [],
      keyDecisions: [],
    };

    await writeFinalHandoff(tmpDir, nodeId, final);

    const handoffDir = join(tmpDir, '.roadmap', '.handoff');
    assert(existsSync(handoffDir), 'handoff directory should exist at .roadmap/.handoff');

    const filePath = join(handoffDir, `${nodeId}.json`);
    assert(existsSync(filePath), 'final handoff file should exist');
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test('journalDir() returns .roadmap/.handoff path', () => {
  const tmpDir = '/tmp/test-repo';
  const result = journalDir(tmpDir);
  const expected = join(tmpDir, '.roadmap', '.handoff');
  assert.strictEqual(result, expected, 'journalDir should return .roadmap/.handoff path');
});
