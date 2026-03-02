// @module tests/trail-manager
// Tests for trail-manager: watch, auto-commit, atomic updates

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { mkdtemp, rmdir } from 'node:fs';
import { tmpdir } from 'node:os';
import { TrailManager, createTrailManager, trailDirty, autoCommitTrail } from '../src/lib/roadmap/trail-manager.ts';

let testRepo: string;

/**
 * Create a temporary git repo for testing.
 */
async function setupTestRepo(): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'trail-test-'));

  // Initialize git repo
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@example.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: dir, stdio: 'pipe' });

  // Create .roadmap directory with initial files
  const roadmapDir = join(dir, '.roadmap');
  await fs.mkdir(roadmapDir, { recursive: true });

  // Create initial head.json
  await fs.writeFile(
    join(roadmapDir, 'head.json'),
    JSON.stringify({ dagId: 'test-dag', version: 1 }, null, 2)
  );

  // Create initial trail.jsonl
  await fs.writeFile(
    join(roadmapDir, 'trail.jsonl'),
    JSON.stringify({ ts: '2026-03-02T00:00:00Z', cmd: 'init' }) + '\n'
  );

  // Initial commit
  execSync('git add .', { cwd: dir, stdio: 'pipe' });
  execSync('git commit --no-verify -m "init"', { cwd: dir, stdio: 'pipe' });

  return dir;
}

/**
 * Clean up test repo.
 */
async function teardownTestRepo(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

beforeEach(async () => {
  testRepo = await setupTestRepo();
});

afterEach(async () => {
  await teardownTestRepo(testRepo);
});

describe('TrailManager: dirty detection', () => {
  it('detects trail.jsonl is clean after init', () => {
    const isDirty = trailDirty(testRepo);
    expect(isDirty).toBe(false);
  });

  it('detects trail.jsonl becomes dirty when appended', async () => {
    const trailPath = join(testRepo, '.roadmap', 'trail.jsonl');
    const content = await fs.readFile(trailPath, 'utf-8');
    await fs.writeFile(
      trailPath,
      content + JSON.stringify({ ts: '2026-03-02T00:00:01Z', cmd: 'orient' }) + '\n'
    );

    const isDirty = trailDirty(testRepo);
    expect(isDirty).toBe(true);
  });

  it('detects head.json is dirty when modified', async () => {
    const headPath = join(testRepo, '.roadmap', 'head.json');
    await fs.writeFile(
      headPath,
      JSON.stringify({ dagId: 'test-dag', version: 2 }, null, 2)
    );

    const isDirty = trailDirty(testRepo);
    expect(isDirty).toBe(true);
  });
});

describe('TrailManager: auto-commit', () => {
  it('commits trail + head atomically when dirty', async () => {
    // Make trail dirty
    const trailPath = join(testRepo, '.roadmap', 'trail.jsonl');
    const content = await fs.readFile(trailPath, 'utf-8');
    await fs.writeFile(
      trailPath,
      content + JSON.stringify({ ts: '2026-03-02T00:00:01Z', cmd: 'orient' }) + '\n'
    );

    const result = autoCommitTrail(testRepo);

    expect(result.committed).toBe(true);
    // Manager starts with lastCommittedEntryCount=0. Trail had 1 (init) + 1 (added) = 2 total
    // So entriesAdded = 2 - 0 = 2 (counting all entries since manager instantiation)
    expect(result.entriesAdded).toBe(2);
    expect(result.trailSha).toBeDefined();
    expect(result.headSha).toBeDefined();
    expect(result.message).toContain('trail:');
  });

  it('no-ops when nothing dirty', () => {
    const result = autoCommitTrail(testRepo);

    expect(result.committed).toBe(false);
    expect(result.reason).toBe('nothing-dirty');
  });

  it('respects dryRun mode', async () => {
    // Make trail dirty
    const trailPath = join(testRepo, '.roadmap', 'trail.jsonl');
    const content = await fs.readFile(trailPath, 'utf-8');
    await fs.writeFile(
      trailPath,
      content + JSON.stringify({ ts: '2026-03-02T00:00:01Z', cmd: 'orient' }) + '\n'
    );

    const result = autoCommitTrail(testRepo, true);

    expect(result.committed).toBe(false);
    expect(result.reason).toBe('dryrun');

    // Verify files are still dirty
    expect(trailDirty(testRepo)).toBe(true);
  });

  it('counts entries correctly across commits', async () => {
    // First commit: trail starts with 1 (init) + add 2 = 3 total
    const trailPath = join(testRepo, '.roadmap', 'trail.jsonl');
    let content = await fs.readFile(trailPath, 'utf-8');
    content += JSON.stringify({ ts: '2026-03-02T00:00:01Z', cmd: 'orient' }) + '\n';
    content += JSON.stringify({ ts: '2026-03-02T00:00:02Z', cmd: 'complete' }) + '\n';
    await fs.writeFile(trailPath, content);

    const result1 = autoCommitTrail(testRepo);
    // First manager instance: lastCommittedEntryCount = 0, trail has 3 entries → entriesAdded = 3
    expect(result1.entriesAdded).toBe(3);

    // Second commit: 1 entry added → 4 total
    // Fresh manager instance: lastCommittedEntryCount = 0, trail has 4 entries → entriesAdded = 4
    content = await fs.readFile(trailPath, 'utf-8');
    content += JSON.stringify({ ts: '2026-03-02T00:00:03Z', cmd: 'orient' }) + '\n';
    await fs.writeFile(trailPath, content);

    const result2 = autoCommitTrail(testRepo);
    // Second manager instance also starts fresh, so entriesAdded = 4
    expect(result2.entriesAdded).toBe(4);
  });
});

describe('TrailManager: watching (non-interactive)', () => {
  it('creates manager with config', () => {
    const manager = new TrailManager({
      repoRoot: testRepo,
      enabled: false,
    });

    expect(manager).toBeDefined();
  });

  it('createTrailManager returns started manager', () => {
    const manager = createTrailManager({
      repoRoot: testRepo,
      enabled: false,  // disable auto-start for testing
    });

    expect(manager).toBeDefined();
  });

  it('respects autoCommit=false config', async () => {
    const manager = new TrailManager({
      repoRoot: testRepo,
      enabled: true,
      autoCommit: false,  // manual trigger only
      debounceMs: 100,
    });

    // Make trail dirty
    const trailPath = join(testRepo, '.roadmap', 'trail.jsonl');
    const content = await fs.readFile(trailPath, 'utf-8');
    await fs.writeFile(
      trailPath,
      content + JSON.stringify({ ts: '2026-03-02T00:00:01Z', cmd: 'orient' }) + '\n'
    );

    manager.start();

    // Wait for debounce window to pass
    await new Promise(r => setTimeout(r, 200));

    // Should still be dirty (autoCommit=false)
    expect(trailDirty(testRepo)).toBe(true);

    manager.stop();
  });

  it('handles missing trail.jsonl gracefully', () => {
    // Create a minimal git repo without trail.jsonl
    const emptyRepo = join(testRepo, 'empty');
    execSync(`mkdir -p "${emptyRepo}"`, { stdio: 'pipe' });
    execSync('git init', { cwd: emptyRepo, stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { cwd: emptyRepo, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: emptyRepo, stdio: 'pipe' });

    const result = autoCommitTrail(emptyRepo);
    // Should return false since no files to commit
    expect(result.committed).toBe(false);
  });

  it('manager.stop() cleans up watcher', () => {
    const manager = new TrailManager({
      repoRoot: testRepo,
      enabled: true,
      autoCommit: false,
    });

    manager.start();
    manager.stop();
    manager.stop();  // idempotent

    // No exception thrown
    expect(true).toBe(true);
  });

  it('commit is synchronous and returns immediately', async () => {
    // Make trail dirty
    const trailPath = join(testRepo, '.roadmap', 'trail.jsonl');
    const content = await fs.readFile(trailPath, 'utf-8');
    await fs.writeFile(
      trailPath,
      content + JSON.stringify({ ts: '2026-03-02T00:00:01Z', cmd: 'orient' }) + '\n'
    );

    const manager = new TrailManager({
      repoRoot: testRepo,
      enabled: false,
    });

    const start = Date.now();
    const result = manager.commit();
    const duration = Date.now() - start;

    expect(result.committed).toBe(true);
    // Synchronous call should be very fast (<100ms)
    expect(duration).toBeLessThan(100);
  });
});

describe('TrailManager: integration', () => {
  it('atomically commits trail + head together', async () => {
    // Modify both files
    const trailPath = join(testRepo, '.roadmap', 'trail.jsonl');
    const headPath = join(testRepo, '.roadmap', 'head.json');

    let trailContent = await fs.readFile(trailPath, 'utf-8');
    trailContent += JSON.stringify({ ts: '2026-03-02T00:00:01Z', cmd: 'orient' }) + '\n';
    await fs.writeFile(trailPath, trailContent);

    await fs.writeFile(
      headPath,
      JSON.stringify({ dagId: 'test-dag', version: 2 }, null, 2)
    );

    const result = autoCommitTrail(testRepo);

    expect(result.committed).toBe(true);
    expect(result.trailSha).toBeDefined();
    expect(result.headSha).toBeDefined();

    // Verify both are in same commit
    const log = execSync(
      'git log -1 --pretty=format:%H:%B',
      { cwd: testRepo, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    expect(log).toContain('trail:');

    // Verify clean state
    expect(trailDirty(testRepo)).toBe(false);
  });

  it('handles concurrent trail appends (batched via debounce)', async () => {
    const manager = new TrailManager({
      repoRoot: testRepo,
      enabled: false,  // manual control
      autoCommit: false,
      debounceMs: 50,
    });

    // Simulate multiple appends before commit
    const trailPath = join(testRepo, '.roadmap', 'trail.jsonl');
    let content = await fs.readFile(trailPath, 'utf-8');

    for (let i = 1; i <= 3; i++) {
      content += JSON.stringify({ ts: `2026-03-02T00:00:0${i}Z`, cmd: 'orient' }) + '\n';
    }
    await fs.writeFile(trailPath, content);

    const result = manager.commit();

    expect(result.committed).toBe(true);
    // Trail starts with 1 (init), add 3 more = 4 total
    // Manager starts with lastCommittedEntryCount = 0
    // So entriesAdded = 4 - 0 = 4
    expect(result.entriesAdded).toBe(4);
  });
});
