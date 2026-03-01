import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadCompletions, saveCompletion, isNodeComplete, getCompletedNodeIds } from '../src/lib/completion/completion-tracker';

describe('completion-tracker', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temporary directory for each test
    testDir = join(tmpdir(), `roadmap-test-${Date.now()}-${Math.random()}`);
    mkdirSync(join(testDir, '.roadmap'), { recursive: true });
  });

  afterEach(() => {
    // Clean up
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('loads empty completions when file does not exist', () => {
    const completions = loadCompletions(testDir);
    expect(completions.size).toBe(0);
  });

  it('saves a completion record', () => {
    saveCompletion(testDir, 'node-1', 'griffin', 'cp-123');

    const completionsPath = join(testDir, '.roadmap', 'completed.json');
    expect(existsSync(completionsPath)).toBe(true);

    const data = JSON.parse(readFileSync(completionsPath, 'utf-8'));
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
    expect(data[0].nodeId).toBe('node-1');
    expect(data[0].owner).toBe('griffin');
    expect(data[0].checkpointId).toBe('cp-123');
    expect(data[0].completedAt).toBeDefined();
  });

  it('loads saved completion records', () => {
    saveCompletion(testDir, 'node-1', 'griffin', 'cp-123');

    const completions = loadCompletions(testDir);
    expect(completions.size).toBe(1);
    expect(completions.has('node-1')).toBe(true);

    const record = completions.get('node-1')!;
    expect(record.nodeId).toBe('node-1');
    expect(record.owner).toBe('griffin');
  });

  it('appends new completions to existing records', () => {
    saveCompletion(testDir, 'node-1', 'griffin', 'cp-123');
    saveCompletion(testDir, 'node-2', 'alice', 'cp-456');

    const completions = loadCompletions(testDir);
    expect(completions.size).toBe(2);
    expect(completions.has('node-1')).toBe(true);
    expect(completions.has('node-2')).toBe(true);
  });

  it('updates completion record if node is completed again', () => {
    const now1 = Date.now();
    saveCompletion(testDir, 'node-1', 'griffin', 'cp-123');

    // Wait a bit to ensure timestamp differs
    const before2 = new Date();
    saveCompletion(testDir, 'node-1', 'alice', 'cp-789');

    const completions = loadCompletions(testDir);
    expect(completions.size).toBe(1);

    const record = completions.get('node-1')!;
    expect(record.owner).toBe('alice');  // Updated
    expect(record.checkpointId).toBe('cp-789');  // Updated
    expect(new Date(record.completedAt) >= before2).toBe(true);  // Newer timestamp
  });

  it('checks if node is complete', () => {
    saveCompletion(testDir, 'node-1', 'griffin', 'cp-123');

    const completions = loadCompletions(testDir);
    expect(isNodeComplete(completions, 'node-1')).toBe(true);
    expect(isNodeComplete(completions, 'node-2')).toBe(false);
  });

  it('gets set of completed node IDs', () => {
    saveCompletion(testDir, 'init', 'griffin', 'cp-123');
    saveCompletion(testDir, 'config', 'griffin', 'cp-124');
    saveCompletion(testDir, 'build', 'alice', 'cp-125');

    const completions = loadCompletions(testDir);
    const completed = getCompletedNodeIds(completions);

    expect(completed).toBeInstanceOf(Set);
    expect(completed.size).toBe(3);
    expect(completed.has('init')).toBe(true);
    expect(completed.has('config')).toBe(true);
    expect(completed.has('build')).toBe(true);
    expect(completed.has('missing')).toBe(false);
  });

  it('handles missing owner and checkpointId gracefully', () => {
    saveCompletion(testDir, 'node-1');

    const completions = loadCompletions(testDir);
    const record = completions.get('node-1')!;

    expect(record.nodeId).toBe('node-1');
    expect(record.owner).toBeUndefined();
    expect(record.checkpointId).toBeUndefined();
    expect(record.completedAt).toBeDefined();
  });

  it('recovers from corrupted completed.json', () => {
    // Write invalid JSON
    const filePath = join(testDir, '.roadmap', 'completed.json');
    require('fs').writeFileSync(filePath, 'not valid json');

    // Should return empty map instead of throwing
    const completions = loadCompletions(testDir);
    expect(completions.size).toBe(0);
  });
});
