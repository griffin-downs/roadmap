// Test suite for advance-handoff handoff writing functionality
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { saveFinal, saveInterim } from '../src/lib/agent-dispatch/handoff-journal.ts';
import type { FinalHandoff, InterimHandoff } from '../src/lib/brief.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');

test('saveInterim writes interim handoff to .roadmap/.handoff/', async (t) => {
  const testDir = join(tmpdir(), `roadmap-interim-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    const interim: InterimHandoff = {
      timestamp: new Date().toISOString(),
      progress: 0.5,
      discovered: ['found pattern A'],
      blockers: ['missing file X'],
      currentFile: 'src/module.ts',
      estimatedTimeRemaining: 15,
    };

    await saveInterim(testDir, 'test-node', interim);

    const handoffDir = join(testDir, '.roadmap', '.handoff');
    assert.ok(existsSync(handoffDir), 'Handoff directory should be created');

    const files = readdirSync(handoffDir);
    const interimFile = files.find((f: string) => f.startsWith('test-node-interim-'));
    assert.ok(interimFile, 'Interim handoff file should be written with timestamp');

    const written = JSON.parse(readFileSync(join(handoffDir, interimFile!), 'utf-8')) as InterimHandoff;
    assert.strictEqual(written.progress, 0.5, 'Progress should match');
    assert.deepStrictEqual(written.blockers, ['missing file X'], 'Blockers should match');
  } finally {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  }
});

test('saveFinal writes final handoff to .roadmap/.handoff/<nodeId>.json', async (t) => {
  const testDir = join(tmpdir(), `roadmap-final-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    const final: FinalHandoff = {
      timestamp: new Date().toISOString(),
      progress: 1.0,
      discovered: [],
      blockers: [],
      currentFile: '',
      summary: 'Module completed successfully',
      keyDecisions: ['chose pattern A over B', 'refactored for clarity'],
      gotchas: ['regex syntax was tricky'],
      nextNodeEntry: {
        consumes: ['output.json'],
        ready: true,
        blockers: [],
      },
    };

    await saveFinal(testDir, 'test-node', final);

    const finalPath = join(testDir, '.roadmap', '.handoff', 'test-node.json');
    assert.ok(existsSync(finalPath), 'Final handoff file should be written');

    const written = JSON.parse(readFileSync(finalPath, 'utf-8')) as FinalHandoff;
    assert.strictEqual(written.progress, 1.0, 'Progress should be 1.0');
    assert.strictEqual(written.summary, 'Module completed successfully', 'Summary should match');
    assert.deepStrictEqual(written.nextNodeEntry.consumes, ['output.json'], 'Next node entry should match');
  } finally {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  }
});

test('multiple interims accumulated chronologically', async (t) => {
  const testDir = join(tmpdir(), `roadmap-multi-interim-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    // Write multiple interims
    const interim1: InterimHandoff = {
      timestamp: new Date(Date.now() - 10000).toISOString(),
      progress: 0.25,
      discovered: ['found A'],
      blockers: [],
      currentFile: 'file1.ts',
    };

    const interim2: InterimHandoff = {
      timestamp: new Date(Date.now() - 5000).toISOString(),
      progress: 0.75,
      discovered: ['found B'],
      blockers: [],
      currentFile: 'file2.ts',
    };

    await saveInterim(testDir, 'node', interim1);
    await saveInterim(testDir, 'node', interim2);

    const handoffDir = join(testDir, '.roadmap', '.handoff');
    const files = readdirSync(handoffDir);
    const interimFiles = files.filter((f: string) => f.startsWith('node-interim-'));

    assert.strictEqual(interimFiles.length, 2, 'Should have two interim files');
    assert.ok(
      interimFiles[0] < interimFiles[1],
      'Files should be in chronological order by timestamp'
    );
  } finally {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  }
});
