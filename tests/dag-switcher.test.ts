import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  DagSwitcher,
  switchDAG,
  validateDAGExists,
  getCurrentDAGId,
  loadDAGById,
} from '../src/lib/roadmap/dag-switcher.ts';
import type { Graph } from '../src/protocol.ts';

const createTestDAG = (id: string, desc: string): Graph<string> => ({
  id,
  desc,
  init: 'node-a',
  term: 'node-b',
  nodes: {
    'node-a': {
      id: 'node-a',
      desc: `First node of ${id}`,
      produces: [],
      consumes: [],
      deps: [],
      validate: [],
      idempotent: true,
    },
    'node-b': {
      id: 'node-b',
      desc: `Second node of ${id}`,
      produces: [],
      consumes: [],
      deps: ['node-a'],
      validate: [],
      idempotent: true,
    },
  },
});

describe('DagSwitcher', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join('/tmp', 'dag-switcher-test-'));
    const roadmapDir = join(tmpDir, '.roadmap');
    require('node:fs').mkdirSync(roadmapDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should validate existing DAG', () => {
    const roadmapDir = join(tmpDir, '.roadmap');
    const dagId = 'test-dag-001';
    const dag = createTestDAG(dagId, 'Test DAG');
    const dagPath = join(roadmapDir, `head.${dagId}.json`);
    writeFileSync(dagPath, JSON.stringify(dag, null, 2));

    const result = validateDAGExists(tmpDir, dagId);
    expect(result).toBe(dagPath);
  });

  it('should throw for missing DAG', () => {
    expect(() => validateDAGExists(tmpDir, 'nonexistent')).toThrow(/DAG not found/);
  });

  it('should throw for invalid JSON DAG', () => {
    const roadmapDir = join(tmpDir, '.roadmap');
    const dagId = 'invalid-dag';
    const dagPath = join(roadmapDir, `head.${dagId}.json`);
    writeFileSync(dagPath, 'not valid json');

    expect(() => validateDAGExists(tmpDir, dagId)).toThrow(/Invalid DAG file/);
  });

  it('should get current DAG ID', () => {
    const roadmapDir = join(tmpDir, '.roadmap');
    const dag = createTestDAG('current-dag', 'Current DAG');
    const headPath = join(roadmapDir, 'head.json');
    writeFileSync(headPath, JSON.stringify(dag, null, 2));

    const currentId = getCurrentDAGId(tmpDir);
    expect(currentId).toBe('current-dag');
  });

  it('should return null when head.json does not exist', () => {
    const currentId = getCurrentDAGId(tmpDir);
    expect(currentId).toBeNull();
  });

  it('should load DAG by ID', () => {
    const roadmapDir = join(tmpDir, '.roadmap');
    const dagId = 'load-test';
    const dag = createTestDAG(dagId, 'Load Test DAG');
    const dagPath = join(roadmapDir, `head.${dagId}.json`);
    writeFileSync(dagPath, JSON.stringify(dag, null, 2));

    const loaded = loadDAGById(tmpDir, dagId);
    expect(loaded.id).toBe(dagId);
    expect(loaded.desc).toBe('Load Test DAG');
  });

  it('should switch between DAGs', async () => {
    const roadmapDir = join(tmpDir, '.roadmap');

    // Create two DAGs
    const dag1 = createTestDAG('dag-1', 'First DAG');
    const dag2 = createTestDAG('dag-2', 'Second DAG');

    const dag1Path = join(roadmapDir, 'head.dag-1.json');
    const dag2Path = join(roadmapDir, 'head.dag-2.json');
    const headPath = join(roadmapDir, 'head.json');

    writeFileSync(dag1Path, JSON.stringify(dag1, null, 2));
    writeFileSync(dag2Path, JSON.stringify(dag2, null, 2));

    // Initially set to dag-1
    writeFileSync(headPath, JSON.stringify(dag1, null, 2));

    // Switch to dag-2
    const switcher = new DagSwitcher(tmpDir);
    const result = await switcher.switch('dag-2');

    expect(result.dagId).toBe('dag-2');
    expect(result.switched).toBe(true);
    expect(result.previousDagId).toBe('dag-1');

    // Verify head.json was updated
    const newHead = JSON.parse(readFileSync(headPath, 'utf8')) as Graph<string>;
    expect(newHead.id).toBe('dag-2');
  });

  it('should list available DAGs', () => {
    const roadmapDir = join(tmpDir, '.roadmap');

    // Create multiple DAGs
    const dag1 = createTestDAG('dag-alpha', 'Alpha DAG');
    const dag2 = createTestDAG('dag-beta', 'Beta DAG');
    const dag3 = createTestDAG('dag-gamma', 'Gamma DAG');

    writeFileSync(join(roadmapDir, 'head.dag-alpha.json'), JSON.stringify(dag1));
    writeFileSync(join(roadmapDir, 'head.dag-beta.json'), JSON.stringify(dag2));
    writeFileSync(join(roadmapDir, 'head.dag-gamma.json'), JSON.stringify(dag3));

    const switcher = new DagSwitcher(tmpDir);
    const available = switcher.getAvailableDAGs();

    expect(available).toEqual(['dag-alpha', 'dag-beta', 'dag-gamma']);
  });

  it('should handle atomic updates on switch failure', async () => {
    const roadmapDir = join(tmpDir, '.roadmap');
    const dag1 = createTestDAG('dag-1', 'First DAG');
    const headPath = join(roadmapDir, 'head.json');

    writeFileSync(headPath, JSON.stringify(dag1, null, 2));

    // Try to switch to non-existent DAG
    const switcher = new DagSwitcher(tmpDir);

    try {
      await switcher.switch('nonexistent');
    } catch (err) {
      // Expected to fail
    }

    // Verify head.json is unchanged
    const stillHead = JSON.parse(readFileSync(headPath, 'utf8')) as Graph<string>;
    expect(stillHead.id).toBe('dag-1');
  });

  it('should use switchDAG convenience function', async () => {
    const roadmapDir = join(tmpDir, '.roadmap');
    const dag1 = createTestDAG('dag-1', 'First DAG');
    const dag2 = createTestDAG('dag-2', 'Second DAG');

    const dag1Path = join(roadmapDir, 'head.dag-1.json');
    const dag2Path = join(roadmapDir, 'head.dag-2.json');
    const headPath = join(roadmapDir, 'head.json');

    writeFileSync(dag1Path, JSON.stringify(dag1, null, 2));
    writeFileSync(dag2Path, JSON.stringify(dag2, null, 2));
    writeFileSync(headPath, JSON.stringify(dag1, null, 2));

    const result = await switchDAG(tmpDir, 'dag-2');
    expect(result.dagId).toBe('dag-2');
    expect(result.switched).toBe(true);
  });

  it('should get current DAG after switch', async () => {
    const roadmapDir = join(tmpDir, '.roadmap');
    const dag1 = createTestDAG('dag-1', 'First DAG');
    const dag2 = createTestDAG('dag-2', 'Second DAG');

    const dag1Path = join(roadmapDir, 'head.dag-1.json');
    const dag2Path = join(roadmapDir, 'head.dag-2.json');
    const headPath = join(roadmapDir, 'head.json');

    writeFileSync(dag1Path, JSON.stringify(dag1, null, 2));
    writeFileSync(dag2Path, JSON.stringify(dag2, null, 2));
    writeFileSync(headPath, JSON.stringify(dag1, null, 2));

    const switcher = new DagSwitcher(tmpDir);

    expect(switcher.getCurrentDAG()).toBe('dag-1');

    await switcher.switch('dag-2');

    expect(switcher.getCurrentDAG()).toBe('dag-2');
  });
});
