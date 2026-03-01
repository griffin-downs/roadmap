import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DAGDetector, detectDAGMismatches } from '../../src/lib/disconnect-detector/dag-subsystem';

describe('DAGDetector', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-detect-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('detects missing head.json', async () => {
    const detector = new DAGDetector({ roadmapRoot: tmpDir });
    const report = await detector.scan();

    expect(report.healthy).toBe(false);
    expect(report.mismatches.some(m => m.type === 'stale-head')).toBe(true);
  });

  it('detects completion state mismatch', async () => {
    const roadmapDir = path.join(tmpDir, '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });

    fs.writeFileSync(
      path.join(roadmapDir, 'head.json'),
      JSON.stringify({
        dag: { id: 'test-dag-001' },
        headSha: 'abc123',
      })
    );

    fs.writeFileSync(
      path.join(roadmapDir, 'completed.json'),
      JSON.stringify({
        dagId: 'different-dag-001',
        lastUpdated: Date.now(),
      })
    );

    const detector = new DAGDetector({ roadmapRoot: tmpDir });
    const report = await detector.scan();

    expect(report.mismatches.some(m => m.type === 'completion-mismatch')).toBe(true);
  });

  it('detects stale completed.json', async () => {
    const roadmapDir = path.join(tmpDir, '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });

    fs.writeFileSync(
      path.join(roadmapDir, 'head.json'),
      JSON.stringify({
        dag: { id: 'test-dag-001' },
        headSha: 'abc123',
      })
    );

    // Create completed.json with timestamp > 24h ago
    fs.writeFileSync(
      path.join(roadmapDir, 'completed.json'),
      JSON.stringify({
        dagId: 'test-dag-001',
        lastUpdated: Date.now() - 2 * 24 * 60 * 60 * 1000,
      })
    );

    const detector = new DAGDetector({ roadmapRoot: tmpDir });
    const report = await detector.scan();

    expect(report.mismatches.some(m => m.type === 'stale-head' && m.severity === 'info')).toBe(true);
  });

  it('detects orphaned candidate DAGs', async () => {
    const roadmapDir = path.join(tmpDir, '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });

    fs.writeFileSync(
      path.join(roadmapDir, 'head.json'),
      JSON.stringify({
        dag: { id: 'test-dag-001' },
        headSha: 'abc123',
      })
    );

    // Create stale candidate (> 7 days old)
    const candidatePath = path.join(roadmapDir, 'head.candidate.json');
    fs.writeFileSync(candidatePath, JSON.stringify({}));
    const stat = fs.statSync(candidatePath);
    fs.utimesSync(candidatePath, Date.now() - 10 * 24 * 60 * 60 * 1000, Date.now() - 10 * 24 * 60 * 60 * 1000);

    const detector = new DAGDetector({ roadmapRoot: tmpDir });
    const report = await detector.scan();

    expect(report.mismatches.some(m => m.type === 'orphaned-dag')).toBe(true);
  });

  it('reports healthy DAG state', async () => {
    const roadmapDir = path.join(tmpDir, '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });

    fs.writeFileSync(
      path.join(roadmapDir, 'head.json'),
      JSON.stringify({
        dag: { id: 'test-dag-001' },
        headSha: 'abc123',
      })
    );

    fs.writeFileSync(
      path.join(roadmapDir, 'completed.json'),
      JSON.stringify({
        dagId: 'test-dag-001',
        lastUpdated: Date.now(),
      })
    );

    const detector = new DAGDetector({ roadmapRoot: tmpDir });
    const report = await detector.scan();

    expect(report.healthy).toBe(true);
    expect(report.mismatches.filter(m => m.severity === 'error')).toHaveLength(0);
  });

  it('exposes detectDAGMismatches function', async () => {
    const roadmapDir = path.join(tmpDir, '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });

    fs.writeFileSync(
      path.join(roadmapDir, 'head.json'),
      JSON.stringify({
        dag: { id: 'test-dag-001' },
        headSha: 'abc123',
      })
    );

    const report = await detectDAGMismatches({ roadmapRoot: tmpDir });

    expect(report).toBeDefined();
    expect(report.dagId).toBe('test-dag-001');
  });
});
