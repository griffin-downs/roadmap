import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import {
  writeCandidateDAG,
  loadCandidate,
  computeHeadSha,
  candidateExists,
  CANDIDATE_PATH,
} from '../src/lib/dag-candidate.ts';
import type { CandidateEnvelope } from '../src/lib/dag-candidate.ts';
import type { Graph } from '../src/protocol.ts';

// Minimal valid DAG for testing
function minimalDAG(id = 'test-dag', extraNodes?: Record<string, unknown>): Graph<string> {
  return {
    id,
    desc: 'test dag',
    init: 'init',
    term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [], validate: [] },
      term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['init'], validate: [] },
      ...extraNodes,
    },
  } as Graph<string>;
}

function setupRepo(root: string, dag?: Graph<string>) {
  const roadmapDir = join(root, '.roadmap');
  mkdirSync(roadmapDir, { recursive: true });
  const d = dag ?? minimalDAG();
  writeFileSync(join(roadmapDir, 'head.json'), JSON.stringify(d, null, 2) + '\n');
  return d;
}

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = join(tmpdir(), `dc-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(tmpRoot, { recursive: true });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('dag-candidate', () => {
  // S1 — writeCandidateDAG writes correct envelope shape
  describe('S1: writeCandidateDAG envelope shape', () => {
    it('writes head.candidate.json with correct envelope fields', () => {
      const dag = setupRepo(tmpRoot);
      const envelope = writeCandidateDAG(tmpRoot, dag, 'import', 'tasks.md');

      expect(envelope.schemaVersion).toBe(1);
      expect(envelope.source).toBe('import');
      expect(envelope.sourceDetail).toBe('tasks.md');
      expect(envelope.dag).toEqual(dag);
      expect(typeof envelope.baseSha).toBe('string');
      expect(envelope.baseSha.length).toBe(64); // sha256 hex
      expect(typeof envelope.createdAt).toBe('string');

      // Verify file on disk matches
      const onDisk = JSON.parse(readFileSync(join(tmpRoot, CANDIDATE_PATH), 'utf-8'));
      expect(onDisk.schemaVersion).toBe(1);
      expect(onDisk.source).toBe('import');
      expect(onDisk.dag.id).toBe('test-dag');
    });

    it('baseSha matches sha256 of head.json content', () => {
      setupRepo(tmpRoot);
      const headContent = readFileSync(join(tmpRoot, '.roadmap', 'head.json'), 'utf-8');
      const expectedSha = createHash('sha256').update(headContent).digest('hex');

      const envelope = writeCandidateDAG(tmpRoot, minimalDAG(), 'expand', 'script.ts');
      expect(envelope.baseSha).toBe(expectedSha);
    });
  });

  // S2 — writeCandidateDAG blocks if candidate exists; replaceCurrent overrides
  describe('S2: writeCandidateDAG blocking', () => {
    it('throws if candidate already exists', () => {
      setupRepo(tmpRoot);
      writeCandidateDAG(tmpRoot, minimalDAG(), 'import', 'first.md');

      expect(() => writeCandidateDAG(tmpRoot, minimalDAG(), 'import', 'second.md'))
        .toThrow(/Candidate already exists/);
    });

    it('replaceCurrent: true allows overwrite', () => {
      setupRepo(tmpRoot);
      writeCandidateDAG(tmpRoot, minimalDAG(), 'import', 'first.md');

      const dag2 = minimalDAG('dag-v2');
      const envelope = writeCandidateDAG(tmpRoot, dag2, 'expand', 'script.ts', { replaceCurrent: true });
      expect(envelope.dag.id).toBe('dag-v2');
      expect(envelope.source).toBe('expand');
    });

    it('throws if no head.json exists', () => {
      mkdirSync(join(tmpRoot, '.roadmap'), { recursive: true });
      // No head.json written
      expect(() => writeCandidateDAG(tmpRoot, minimalDAG(), 'import', 'x.md'))
        .toThrow(/No head\.json found/);
    });
  });

  // S3 — loadCandidate returns null or parsed envelope
  describe('S3: loadCandidate', () => {
    it('returns null if no candidate exists', () => {
      setupRepo(tmpRoot);
      expect(loadCandidate(tmpRoot)).toBeNull();
    });

    it('returns parsed envelope if candidate present', () => {
      const dag = setupRepo(tmpRoot);
      writeCandidateDAG(tmpRoot, dag, 'import', 'tasks.md');

      const loaded = loadCandidate(tmpRoot);
      expect(loaded).not.toBeNull();
      expect(loaded!.schemaVersion).toBe(1);
      expect(loaded!.source).toBe('import');
      expect(loaded!.dag.id).toBe('test-dag');
    });
  });

  // S4 — candidateExists
  describe('S4: candidateExists', () => {
    it('returns false when no candidate', () => {
      setupRepo(tmpRoot);
      expect(candidateExists(tmpRoot)).toBe(false);
    });

    it('returns true after writing candidate', () => {
      setupRepo(tmpRoot);
      writeCandidateDAG(tmpRoot, minimalDAG(), 'import', 'x.md');
      expect(candidateExists(tmpRoot)).toBe(true);
    });
  });

  // S5 — computeHeadSha
  describe('S5: computeHeadSha', () => {
    it('returns sha256 hex of head.json content', () => {
      setupRepo(tmpRoot);
      const content = readFileSync(join(tmpRoot, '.roadmap', 'head.json'), 'utf-8');
      const expected = createHash('sha256').update(content).digest('hex');

      expect(computeHeadSha(tmpRoot)).toBe(expected);
    });

    it('returns null if head.json missing', () => {
      // tmpRoot exists but no .roadmap/head.json
      expect(computeHeadSha(tmpRoot)).toBeNull();
    });
  });

  // S6 — stale detection: baseSha mismatch when head.json changes
  describe('S6: stale detection', () => {
    it('detects stale candidate when head.json changes after write', () => {
      setupRepo(tmpRoot);
      const envelope = writeCandidateDAG(tmpRoot, minimalDAG(), 'import', 'x.md');
      const originalBaseSha = envelope.baseSha;

      // Modify head.json — simulates an accept of a different candidate or manual edit
      const newDag = minimalDAG('modified');
      writeFileSync(join(tmpRoot, '.roadmap', 'head.json'), JSON.stringify(newDag, null, 2) + '\n');

      const currentSha = computeHeadSha(tmpRoot);
      expect(currentSha).not.toBe(originalBaseSha);

      // Loaded candidate still has old baseSha
      const loaded = loadCandidate(tmpRoot)!;
      expect(loaded.baseSha).toBe(originalBaseSha);
      expect(loaded.baseSha !== currentSha).toBe(true);
    });
  });

  // S7 — diff logic: added/removed/changed node IDs
  describe('S7: diff logic', () => {
    it('correctly identifies added, removed, and changed nodes', () => {
      const liveDag = minimalDAG('live', {
        'node-a': { id: 'node-a', desc: 'stays same', produces: ['a.ts'], consumes: [], deps: ['init'], validate: [] },
        'node-b': { id: 'node-b', desc: 'will change', produces: ['b.ts'], consumes: [], deps: ['init'], validate: [] },
        'node-c': { id: 'node-c', desc: 'will be removed', produces: ['c.ts'], consumes: [], deps: ['init'], validate: [] },
      });

      const candidateDag = minimalDAG('candidate', {
        'node-a': { id: 'node-a', desc: 'stays same', produces: ['a.ts'], consumes: [], deps: ['init'], validate: [] },
        'node-b': { id: 'node-b', desc: 'CHANGED desc', produces: ['b.ts'], consumes: [], deps: ['init'], validate: [] },
        'node-d': { id: 'node-d', desc: 'newly added', produces: ['d.ts'], consumes: [], deps: ['init'], validate: [] },
      });

      const liveIds = new Set(Object.keys(liveDag.nodes));
      const candidateIds = new Set(Object.keys(candidateDag.nodes));

      const added = [...candidateIds].filter(id => !liveIds.has(id));
      const removed = [...liveIds].filter(id => !candidateIds.has(id));
      const changed = [...liveIds].filter(id =>
        candidateIds.has(id) && JSON.stringify(liveDag.nodes[id]) !== JSON.stringify(candidateDag.nodes[id])
      );

      expect(added).toContain('node-d');
      expect(removed).toContain('node-c');
      expect(changed).toContain('node-b');
      expect(changed).not.toContain('node-a'); // unchanged
      expect(changed).not.toContain('init');    // unchanged
    });
  });

  // S8 — roundtrip: write → load → verify dag matches
  describe('S8: roundtrip', () => {
    it('loaded candidate dag matches original', () => {
      const dag = minimalDAG('roundtrip', {
        'feat-x': { id: 'feat-x', desc: 'feature', produces: ['feat.ts'], consumes: ['init.ts'], deps: ['init'], validate: [{ type: 'artifact-exists', path: 'feat.ts' }] },
      });
      setupRepo(tmpRoot, dag);

      writeCandidateDAG(tmpRoot, dag, 'expand', 'expand-roundtrip.ts');
      const loaded = loadCandidate(tmpRoot);

      expect(loaded).not.toBeNull();
      expect(loaded!.dag).toEqual(dag);
      expect(loaded!.dag.id).toBe('roundtrip');
      expect(loaded!.dag.nodes['feat-x'].desc).toBe('feature');
      expect(loaded!.source).toBe('expand');
      expect(loaded!.sourceDetail).toBe('expand-roundtrip.ts');
    });

    it('multiple writes with replaceCurrent preserve latest', () => {
      setupRepo(tmpRoot);
      writeCandidateDAG(tmpRoot, minimalDAG('v1'), 'import', 'a.md');
      writeCandidateDAG(tmpRoot, minimalDAG('v2'), 'expand', 'b.ts', { replaceCurrent: true });

      const loaded = loadCandidate(tmpRoot)!;
      expect(loaded.dag.id).toBe('v2');
      expect(loaded.source).toBe('expand');
    });
  });
});
