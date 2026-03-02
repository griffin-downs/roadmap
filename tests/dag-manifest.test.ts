import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DAGManifest,
  validateManifest,
  scanDAGManifestForViolations,
  ManifestViolation,
} from '../src/lib/enforcement/dag-manifest.ts';

function tmpDir(): string {
  const dir = join(tmpdir(), `dag-manifest-test-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function createDAGFile(path: string, id: string, desc?: string, withNodes = true): void {
  const dag: any = {
    id,
    desc: desc || `DAG ${id}`,
    init: 'init',
    term: 'term',
    nodes: {},
  };

  if (withNodes) {
    dag.nodes = {
      init: {
        id: 'init',
        desc: 'Initialize',
        produces: ['init.marker'],
        consumes: [],
        deps: [],
        validate: [{ type: 'artifact-exists' }],
      },
      term: {
        id: 'term',
        desc: 'Finalize',
        produces: [],
        consumes: [],
        deps: ['init'],
        validate: [{ type: 'artifact-exists' }],
      },
    };
  }

  writeFileSync(path, JSON.stringify(dag, null, 2));
}

describe('DAGManifest — dag-manifest.ts', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = tmpDir();
    mkdirSync(join(tmpRoot, '.roadmap'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpRoot)) {
      rmSync(tmpRoot, { recursive: true });
    }
  });

  describe('scan()', () => {
    it('returns empty report when .roadmap dir does not exist', () => {
      const missingRoot = join(tmpdir(), 'nonexistent');
      const manifest = new DAGManifest(missingRoot);
      const report = manifest.scan();
      expect(report.entries).toEqual([]);
      expect(report.scannedFiles).toEqual([]);
    });

    it('finds and validates head.*.json files', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      createDAGFile(join(roadmapDir, 'head.backup.json'), 'my-dag', 'My DAG');
      createDAGFile(join(roadmapDir, 'head.candidate.json'), 'candidate-dag', 'Candidate');

      const manifest = new DAGManifest(tmpRoot);
      const report = manifest.scan();

      expect(report.scannedFiles).toContain('head.backup.json');
      expect(report.scannedFiles).toContain('head.candidate.json');
      expect(report.entries.length).toBe(2);
    });

    it('skips head.json (main head, not a variant)', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      createDAGFile(join(roadmapDir, 'head.json'), 'main-dag', 'Main');
      createDAGFile(join(roadmapDir, 'head.backup.json'), 'backup-dag', 'Backup');

      const manifest = new DAGManifest(tmpRoot);
      const report = manifest.scan();

      // Should only find head.backup.json, not head.json
      expect(report.scannedFiles).not.toContain('head.json');
      expect(report.scannedFiles).toContain('head.backup.json');
    });

    it('validates DAG structure in each file', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      createDAGFile(join(roadmapDir, 'head.backup.json'), 'valid-dag', 'Valid');

      const manifest = new DAGManifest(tmpRoot);
      const report = manifest.scan();

      expect(report.entries[0].valid).toBe(true);
      expect(report.entries[0].dagId).toBe('valid-dag');
      expect(report.entries[0].nodeCount).toBe(2); // init + term
    });

    it('reports invalid JSON with parse error', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      writeFileSync(join(roadmapDir, 'head.bad.json'), '{invalid json}');

      const manifest = new DAGManifest(tmpRoot);
      const report = manifest.scan();

      expect(report.entries[0].valid).toBe(false);
      expect(report.entries[0].error).toContain('Parse error');
    });

    it('reports missing required DAG fields', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      // Missing 'desc' field
      writeFileSync(
        join(roadmapDir, 'head.incomplete.json'),
        JSON.stringify({
          id: 'incomplete',
          init: 'init',
          term: 'term',
          nodes: { init: {}, term: {} },
        })
      );

      const manifest = new DAGManifest(tmpRoot);
      const report = manifest.scan();

      expect(report.entries[0].valid).toBe(false);
      expect(report.entries[0].error).toContain('Missing required field: desc');
    });

    it('reports when init/term nodes do not exist', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      writeFileSync(
        join(roadmapDir, 'head.badnodes.json'),
        JSON.stringify({
          id: 'bad',
          desc: 'Bad DAG',
          init: 'missing-init',
          term: 'term',
          nodes: { term: { id: 'term', desc: 'End' } },
        })
      );

      const manifest = new DAGManifest(tmpRoot);
      const report = manifest.scan();

      expect(report.entries[0].valid).toBe(false);
      expect(report.entries[0].error).toContain('Init node');
    });
  });

  describe('orphan detection', () => {
    it('marks DAGs with different ID as orphaned', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      createDAGFile(join(roadmapDir, 'head.json'), 'active-dag', 'Active');
      createDAGFile(join(roadmapDir, 'head.backup.json'), 'old-dag', 'Old');

      const manifest = new DAGManifest(tmpRoot);
      const report = manifest.scan();

      const orphaned = report.entries.filter(e => e.orphaned);
      expect(orphaned.length).toBeGreaterThan(0);
      expect(orphaned[0].dagId).toBe('old-dag');
    });

    it('does not mark valid DAGs as orphaned when they match active head', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      createDAGFile(join(roadmapDir, 'head.json'), 'same-dag', 'Same');
      createDAGFile(join(roadmapDir, 'head.backup.json'), 'same-dag', 'Same backup');

      const manifest = new DAGManifest(tmpRoot);
      const report = manifest.scan();

      const orphaned = report.entries.filter(e => e.orphaned);
      expect(orphaned.length).toBe(0);
    });

    it('includes orphan count in report', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      createDAGFile(join(roadmapDir, 'head.json'), 'main', 'Main');
      createDAGFile(join(roadmapDir, 'head.backup.json'), 'orphan1', 'Orphan 1');
      createDAGFile(join(roadmapDir, 'head.candidate.json'), 'orphan2', 'Orphan 2');

      const manifest = new DAGManifest(tmpRoot);
      const report = manifest.scan();

      expect(report.orphanedCount).toBe(2);
    });
  });

  describe('documentation validation', () => {
    it('detects missing design documentation', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      createDAGFile(join(roadmapDir, 'head.backup.json'), 'nodoc-dag', 'No docs');

      const manifest = new DAGManifest(tmpRoot);
      const report = manifest.scan();

      expect(report.designDocGaps.length).toBeGreaterThan(0);
    });

    it('finds design documentation if present', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      createDAGFile(join(roadmapDir, 'head.backup.json'), 'documented-dag', 'With docs');
      writeFileSync(join(roadmapDir, 'task-5-documented-dag-design.md'), '# Design');

      const manifest = new DAGManifest(tmpRoot);
      const report = manifest.scan();

      expect(report.designDocGaps.length).toBe(0);
    });
  });

  describe('validateManifest()', () => {
    it('returns passed=true when no violations', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      createDAGFile(join(roadmapDir, 'head.backup.json'), 'good-dag', 'Good');
      writeFileSync(join(roadmapDir, 'task-5-good-dag-design.md'), '# Design');

      const manifest = new DAGManifest(tmpRoot);
      const report = manifest.scan();
      const result = validateManifest(report);

      expect(result.passed).toBe(true);
      expect(result.evidence).toContain('valid');
    });

    it('returns passed=false when DAGs are invalid', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      writeFileSync(join(roadmapDir, 'head.bad.json'), '{ bad }');

      const manifest = new DAGManifest(tmpRoot);
      const report = manifest.scan();
      const result = validateManifest(report);

      expect(result.passed).toBe(false);
      expect(result.evidence).toContain('invalid structure');
    });

    it('reports design doc gaps in evidence', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      createDAGFile(join(roadmapDir, 'head.backup.json'), 'undoc-dag', 'Undocumented');

      const manifest = new DAGManifest(tmpRoot);
      const report = manifest.scan();
      const result = validateManifest(report);

      expect(result.passed).toBe(false);
      expect(result.evidence).toContain('design documentation');
    });
  });

  describe('scanDAGManifestForViolations()', () => {
    it('returns violations for invalid DAGs', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      writeFileSync(join(roadmapDir, 'head.bad.json'), '{ bad }');

      const violations = scanDAGManifestForViolations(tmpRoot);

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].type).toBe('invalid-structure');
      expect(violations[0].message).toContain('structure invalid');
    });

    it('returns violations for orphaned DAGs', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      createDAGFile(join(roadmapDir, 'head.json'), 'main', 'Main');
      createDAGFile(join(roadmapDir, 'head.backup.json'), 'orphan', 'Orphan');

      const violations = scanDAGManifestForViolations(tmpRoot);

      const orphanViolations = violations.filter(v => v.type === 'orphaned');
      expect(orphanViolations.length).toBeGreaterThan(0);
    });

    it('returns violations for missing design docs', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      createDAGFile(join(roadmapDir, 'head.backup.json'), 'nodoc', 'No docs');

      const violations = scanDAGManifestForViolations(tmpRoot);

      const docViolations = violations.filter(v => v.type === 'missing-documentation');
      expect(docViolations.length).toBeGreaterThan(0);
      expect(docViolations[0].message).toContain('design documentation');
    });

    it('includes remediation suggestions in violations', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      writeFileSync(join(roadmapDir, 'head.bad.json'), '{ bad }');

      const violations = scanDAGManifestForViolations(tmpRoot);

      expect(violations[0].remediation).toBeDefined();
      expect(violations[0].remediation).toContain('.roadmap');
    });
  });

  describe('archiveOrphaned()', () => {
    it('returns list of orphaned DAG files', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      mkdirSync(join(roadmapDir, 'archived'), { recursive: true });
      createDAGFile(join(roadmapDir, 'head.json'), 'main', 'Main');
      createDAGFile(join(roadmapDir, 'head.backup.json'), 'orphan', 'Orphan');

      const manifest = new DAGManifest(tmpRoot);
      const archived = manifest.archiveOrphaned();

      expect(archived).toContain('head.backup.json');
    });
  });

  describe('error handling', () => {
    it('handles missing files gracefully', () => {
      const manifest = new DAGManifest(tmpRoot);
      expect(() => {
        manifest.scan();
      }).not.toThrow();
    });

    it('handles non-JSON files gracefully', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      writeFileSync(join(roadmapDir, 'head.txt.json'), 'not json');

      const manifest = new DAGManifest(tmpRoot);
      const report = manifest.scan();

      expect(report.entries.length).toBeGreaterThan(0);
      expect(report.entries[0].valid).toBe(false);
    });

    it('handles malformed DAG structure gracefully', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      writeFileSync(
        join(roadmapDir, 'head.malformed.json'),
        JSON.stringify({ id: 'bad', desc: 'bad', init: null, term: null, nodes: null })
      );

      const manifest = new DAGManifest(tmpRoot);
      const report = manifest.scan();

      expect(report.entries[0].valid).toBe(false);
    });
  });

  describe('summary building', () => {
    it('builds correct summary for valid files', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      createDAGFile(join(roadmapDir, 'head.backup.json'), 'test', 'Test');
      writeFileSync(join(roadmapDir, 'task-5-test-design.md'), '# Design');

      const manifest = new DAGManifest(tmpRoot);
      const report = manifest.scan();

      expect(report.summary).toContain('Scanned');
      expect(report.summary).toContain('valid');
    });

    it('includes orphan count in summary', () => {
      const roadmapDir = join(tmpRoot, '.roadmap');
      createDAGFile(join(roadmapDir, 'head.json'), 'main', 'Main');
      createDAGFile(join(roadmapDir, 'head.backup.json'), 'old', 'Old');

      const manifest = new DAGManifest(tmpRoot);
      const report = manifest.scan();

      expect(report.summary).toContain('orphaned');
    });
  });
});
