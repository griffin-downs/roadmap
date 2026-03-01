import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ValidationDetector, detectValidationIssues, MetricViolation } from '../../src/lib/disconnect-detector/validation-subsystem';

describe('ValidationDetector', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validation-detect-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('detects missing validation rule fields', async () => {
    const roadmapDir = path.join(tmpDir, '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });

    fs.writeFileSync(
      path.join(roadmapDir, 'head.json'),
      JSON.stringify({
        nodes: {
          'test-node': {
            validate: [{ type: 'artifact-exists' }], // missing 'path'
          },
        },
      })
    );

    const detector = new ValidationDetector({ roadmapRoot: tmpDir });
    const issues = await detector.scan();

    expect(issues.some(i => i.type === 'state-divergence')).toBe(true);
  });

  it('detects missing spec files', async () => {
    const roadmapDir = path.join(tmpDir, '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });

    fs.writeFileSync(
      path.join(roadmapDir, 'head.json'),
      JSON.stringify({
        nodes: {
          'test-node': {
            validate: [{ type: 'spec-conformance', spec: '.specify/missing.md', scenario: 'Test' }],
          },
        },
      })
    );

    const detector = new ValidationDetector({ roadmapRoot: tmpDir });
    const issues = await detector.scan();

    expect(issues.some(i => i.severity === 'error')).toBe(true);
  });

  it('exposes detectValidationIssues function', async () => {
    const issues = await detectValidationIssues({ roadmapRoot: tmpDir });
    expect(Array.isArray(issues)).toBe(true);
  });

  describe('metric constraints', () => {
    it('detects file count exceeding threshold', async () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      // Create 12 files — threshold set to 10
      for (let i = 0; i < 12; i++) {
        fs.writeFileSync(path.join(srcDir, `file${i}.ts`), `// file ${i}\n`);
      }

      const detector = new ValidationDetector({
        roadmapRoot: tmpDir,
        metrics: { maxFilesPerDir: 10 },
        scanDirs: ['src'],
      });
      const issues = await detector.scan();

      const metricIssues = issues.filter(i => (i as MetricViolation).metric === 'file-count') as MetricViolation[];
      expect(metricIssues.length).toBe(1);
      expect(metricIssues[0].actual).toBe(12);
      expect(metricIssues[0].threshold).toBe(10);
      expect(metricIssues[0].repairOptions.length).toBeGreaterThan(0);
      expect(metricIssues[0].repairOptions.some(r => r.action === 'expand-node')).toBe(true);
    });

    it('detects line count exceeding threshold', async () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      // Create a 60-line file — threshold set to 50
      const lines = Array.from({ length: 60 }, (_, i) => `const x${i} = ${i};`).join('\n');
      fs.writeFileSync(path.join(srcDir, 'big.ts'), lines);

      const detector = new ValidationDetector({
        roadmapRoot: tmpDir,
        metrics: { maxLinesPerFile: 50 },
        scanDirs: ['src'],
      });
      const issues = await detector.scan();

      const metricIssues = issues.filter(i => (i as MetricViolation).metric === 'line-count') as MetricViolation[];
      expect(metricIssues.length).toBe(1);
      expect(metricIssues[0].actual).toBe(60);
      expect(metricIssues[0].threshold).toBe(50);
      expect(metricIssues[0].repairOptions[0].action).toBe('split-file');
    });

    it('detects module imbalance across sibling directories', async () => {
      const srcDir = path.join(tmpDir, 'src');
      const bigMod = path.join(srcDir, 'big-module');
      const smallMod = path.join(srcDir, 'small-module');
      fs.mkdirSync(bigMod, { recursive: true });
      fs.mkdirSync(smallMod, { recursive: true });

      // big-module: 20 files, small-module: 1 file — ratio 20, threshold 5
      for (let i = 0; i < 20; i++) {
        fs.writeFileSync(path.join(bigMod, `f${i}.ts`), `// f\n`);
      }
      fs.writeFileSync(path.join(smallMod, 'only.ts'), '// only\n');

      const detector = new ValidationDetector({
        roadmapRoot: tmpDir,
        metrics: { balanceRatio: 5 },
        scanDirs: ['src'],
      });
      const issues = await detector.scan();

      const balanceIssues = issues.filter(i => (i as MetricViolation).metric === 'module-balance') as MetricViolation[];
      expect(balanceIssues.length).toBe(1);
      expect(balanceIssues[0].actual).toBe(20);
      expect(balanceIssues[0].severity).toBe('info');
      expect(balanceIssues[0].repairOptions.length).toBeGreaterThan(0);
    });

    it('no violations when within thresholds', async () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      // 3 small files — well within defaults
      for (let i = 0; i < 3; i++) {
        fs.writeFileSync(path.join(srcDir, `ok${i}.ts`), `const x = ${i};\n`);
      }

      const detector = new ValidationDetector({
        roadmapRoot: tmpDir,
        scanDirs: ['src'],
      });
      const issues = await detector.scan();

      const metricIssues = issues.filter(i => 'metric' in i);
      expect(metricIssues.length).toBe(0);
    });

    it('scanMetrics returns only metric violations', () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      for (let i = 0; i < 6; i++) {
        fs.writeFileSync(path.join(srcDir, `m${i}.ts`), '// ok\n');
      }

      const detector = new ValidationDetector({
        roadmapRoot: tmpDir,
        metrics: { maxFilesPerDir: 5 },
        scanDirs: ['src'],
      });
      const violations = detector.scanMetrics();

      expect(violations.length).toBe(1);
      expect(violations[0].metric).toBe('file-count');
      expect(violations[0].actual).toBe(6);
    });
  });
});
