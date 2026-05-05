import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Meta-test: a minimal DAG whose terminal node has a report-prompt intent gate.
// Exercises the full CLI advance pipeline (not just library calls).
// Validates that structured report validation works end-to-end through bin/roadmap.ts.

const CLI = join(process.cwd(), 'bin/roadmap.ts');
const TSX = join(process.cwd(), 'node_modules', '.bin', 'tsx');

function run(cmd: string, cwd: string): { ok: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { ok: true, stdout, stderr: '' };
  } catch (e: any) {
    return {
      ok: false,
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
    };
  }
}

function cli(args: string, cwd: string) {
  return run(`"${TSX}" "${CLI}" ${args}`, cwd);
}

const REPORT_PROMPT =
  'Provide a completion report:\n' +
  '1. COMMIT STATUS: Are all produces committed?\n' +
  '2. TEST EVIDENCE: What tests ran?\n' +
  '3. UNVALIDATED ASSUMPTIONS: What has no validator?\n' +
  '4. FAILURE SURFACE: What would break?\n' +
  '5. SCOPE DECISIONS: What was excluded?\n' +
  '6. AUDIT TRAIL: What artifacts exist?';

// DAG with report-prompt intent gate on terminal node.
// Written directly to head.json (spec schema doesn't allow prompt/expandOnFail;
// speckit-import adds those post-validation — we're testing advance, not make).
const HEAD_JSON = {
  id: 'report-meta',
  desc: 'Meta-test DAG for report validation',
  init: 'init',
  term: 'term',
  nodes: {
    init: {
      id: 'init', desc: 'root', produces: [], consumes: [], deps: [],
      validate: [], idempotent: true,
    },
    term: {
      id: 'term', desc: 'terminal with report gate', produces: [], consumes: [],
      deps: ['init'],
      validate: [{
        type: 'intent',
        statement: 'Report validation works end-to-end',
        confidence: 0.8,
        evaluator: 'self',
        prompt: [REPORT_PROMPT],
      }],
      idempotent: true,
    },
  },
  version: '0.3.0',
  protocolVersion: '0.3.0',
};

describe('report-validation meta-test (CLI pipeline)', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'report-meta-'));
    execSync('git init -b main && git commit --allow-empty -m "init"', { cwd: tmpDir, stdio: 'pipe' });
    // Write head.json and spec-origin.json (advance requires valid origin)
    const roadmapDir = join(tmpDir, '.roadmap');
    mkdirSync(roadmapDir, { recursive: true });
    writeFileSync(join(roadmapDir, 'head.json'), JSON.stringify(HEAD_JSON, null, 2));
    writeFileSync(join(roadmapDir, 'completed.json'), '[]');
    writeFileSync(join(roadmapDir, 'spec-origin.json'), JSON.stringify({
      schemaVersion: 1,
      engine: 'spec-kit',
      version: '1.0.0',
      compile_hash: 'test-hash',
      spec_sha: 'test-sha',
      importedAt: new Date().toISOString(),
      dagId: 'report-meta',
    }));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('advance init succeeds (no validators)', () => {
    const result = cli('advance init --note "auto"', tmpDir);
    expect(result.ok).toBe(true);
    const out = JSON.parse(result.stdout);
    expect(out.ok).toBe(true);
  });

  it('advance term REJECTS without --evaluate (unevaluated intent)', () => {
    const result = cli('advance term --note "try without judgment"', tmpDir);
    expect(result.ok).toBe(false);
    const combined = result.stdout + result.stderr;
    // Without --evaluate, the intent validator fails
    expect(combined).toContain('unevaluated');
    expect(combined).toContain('--evaluate-file');
  });

  it('advance term REJECTS freeform prose via --evaluate-file', () => {
    const judgment = [{
      statement: 'Report validation works end-to-end',
      confidence: 0.95,
      reasoning: 'Confident',
      promptAnswers: ['Everything looks great, all done!'],
    }];
    const evalPath = join(tmpDir, 'freeform-eval.json');
    writeFileSync(evalPath, JSON.stringify(judgment));

    const result = cli(`advance term --evaluate-file "${evalPath}" --note "freeform"`, tmpDir);
    expect(result.ok).toBe(false);
    const combined = result.stdout + result.stderr;
    expect(combined).toContain('report validation failed');
  });

  it('advance term REJECTS report with missing sections', () => {
    const judgment = [{
      statement: 'Report validation works end-to-end',
      confidence: 0.95,
      reasoning: 'Confident',
      promptAnswers: [
        '1. COMMIT STATUS: done.\n2. TEST EVIDENCE: passed.',
      ],
    }];
    const evalPath = join(tmpDir, 'partial-eval.json');
    writeFileSync(evalPath, JSON.stringify(judgment));

    const result = cli(`advance term --evaluate-file "${evalPath}" --note "partial"`, tmpDir);
    expect(result.ok).toBe(false);
    const combined = result.stdout + result.stderr;
    expect(combined).toContain('report validation failed');
    expect(combined).toContain('UNVALIDATED ASSUMPTIONS');
  });

  it('advance term ACCEPTS valid structured report', () => {
    const judgment = [{
      statement: 'Report validation works end-to-end',
      confidence: 0.95,
      reasoning: 'All sections present and non-empty',
      promptAnswers: [
        '1. COMMIT STATUS: All files committed at abc123.\n' +
        '2. TEST EVIDENCE: vitest 24/24 pass.\n' +
        '3. UNVALIDATED ASSUMPTIONS: None.\n' +
        '4. FAILURE SURFACE: Empty string to validateReport.\n' +
        '5. SCOPE DECISIONS: Deferred telemetry.\n' +
        '6. AUDIT TRAIL: trail.jsonl, completed.json.',
      ],
    }];
    const evalPath = join(tmpDir, 'valid-eval.json');
    writeFileSync(evalPath, JSON.stringify(judgment));

    const result = cli(`advance term --evaluate-file "${evalPath}" --note "valid report"`, tmpDir);
    expect(result.ok).toBe(true);
    const out = JSON.parse(result.stdout);
    expect(out.ok).toBe(true);
  });
});
