import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { define, graph, validateNode } from '../src/protocol.ts';
import type { ValidationRule, IntentEvaluation } from '../src/protocol.ts';
import {
  makeIntentEvaluator,
  loadContextFiles,
  recordEvaluation,
} from '../src/lib/intent-evaluator.ts';
import type { IntentEvaluationRecord } from '../src/lib/intent-evaluator.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function node(id: string, overrides: Partial<{
  produces: string[];
  consumes: string[];
  deps: string[];
  validate: ValidationRule[];
}> = {}) {
  return {
    id, desc: `task: ${id}`,
    produces: overrides.produces ?? [],
    consumes: overrides.consumes ?? [],
    deps: overrides.deps ?? [],
    validate: overrides.validate ?? [],
    idempotent: true,
  };
}

function tempDir(): string {
  const dir = join(tmpdir(), `intent-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Mock LLM evaluator that returns a configurable result.
function mockEvaluator(confidence: number, reasoning = 'test reasoning', evidence: string[] = []) {
  return async (_statement: string, _files: any[], _evaluator: any) => ({
    confidence,
    reasoning,
    evidence,
  });
}

// ── loadContextFiles ──────────────────────────────────────────────────────────

describe('loadContextFiles', () => {
  let root: string;
  beforeEach(() => { root = tempDir(); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reads existing files', () => {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/a.ts'), 'const x = 1;');
    const files = loadContextFiles(['src/a.ts'], root);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/a.ts');
    expect(files[0].content).toContain('const x = 1');
  });

  it('skips missing files silently', () => {
    const files = loadContextFiles(['nonexistent.ts'], root);
    expect(files).toHaveLength(0);
  });

  it('reads multiple files', () => {
    writeFileSync(join(root, 'a.ts'), 'a');
    writeFileSync(join(root, 'b.ts'), 'b');
    const files = loadContextFiles(['a.ts', 'b.ts', 'missing.ts'], root);
    expect(files).toHaveLength(2);
  });

  it('preserves path in result', () => {
    writeFileSync(join(root, 'foo.ts'), 'content');
    const files = loadContextFiles(['foo.ts'], root);
    expect(files[0].path).toBe('foo.ts');
  });
});

// ── recordEvaluation ─────────────────────────────────────────────────────────

describe('recordEvaluation', () => {
  let root: string;
  beforeEach(() => { root = tempDir(); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('creates .roadmap/evaluations/<nodeId>.jsonl', () => {
    const record: IntentEvaluationRecord = {
      pass: true, confidence: 0.9, reasoning: 'looks good', evidence: [],
      nodeId: 'my-node', statement: 'test', evaluator: 'self',
      threshold: 0.8, evaluatedAt: '2026-01-01T00:00:00.000Z', contextPaths: [],
    };
    recordEvaluation('my-node', record, root);
    const path = join(root, '.roadmap', 'evaluations', 'my-node.jsonl');
    expect(existsSync(path)).toBe(true);
  });

  it('appends JSONL entries', () => {
    const record: IntentEvaluationRecord = {
      pass: true, confidence: 0.9, reasoning: 'ok', evidence: [],
      nodeId: 'n', statement: 's', evaluator: 'self',
      threshold: 0.8, evaluatedAt: new Date().toISOString(), contextPaths: [],
    };
    recordEvaluation('n', record, root);
    recordEvaluation('n', { ...record, confidence: 0.7, pass: false }, root);

    const path = join(root, '.roadmap', 'evaluations', 'n.jsonl');
    const lines = readFileSync(path, 'utf-8').trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]);
    const second = JSON.parse(lines[1]);
    expect(first.confidence).toBe(0.9);
    expect(second.confidence).toBe(0.7);
  });

  it('each line is valid JSON with required fields', () => {
    const record: IntentEvaluationRecord = {
      pass: false, confidence: 0.5, reasoning: 'uncertain', evidence: ['a.ts:1 — gap'],
      nodeId: 'x', statement: 'test intent', evaluator: 'council',
      threshold: 0.85, evaluatedAt: '2026-01-01T00:00:00.000Z', contextPaths: ['a.ts'],
    };
    recordEvaluation('x', record, root);
    const path = join(root, '.roadmap', 'evaluations', 'x.jsonl');
    const parsed = JSON.parse(readFileSync(path, 'utf-8').trim());
    expect(parsed.nodeId).toBe('x');
    expect(parsed.statement).toBe('test intent');
    expect(parsed.evaluator).toBe('council');
    expect(parsed.threshold).toBe(0.85);
    expect(parsed.evaluatedAt).toBeTruthy();
    expect(Array.isArray(parsed.contextPaths)).toBe(true);
  });

  it('creates directories recursively if missing', () => {
    const record: IntentEvaluationRecord = {
      pass: true, confidence: 0.9, reasoning: 'ok', evidence: [],
      nodeId: 'y', statement: 's', evaluator: 'self',
      threshold: 0.8, evaluatedAt: new Date().toISOString(), contextPaths: [],
    };
    recordEvaluation('y', record, root);
    expect(existsSync(join(root, '.roadmap', 'evaluations'))).toBe(true);
  });
});

// ── makeIntentEvaluator ───────────────────────────────────────────────────────

describe('makeIntentEvaluator', () => {
  let root: string;
  beforeEach(() => { root = tempDir(); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('returns pass=true when confidence >= threshold', async () => {
    const evaluator = makeIntentEvaluator('n1', root, { evaluatorFn: mockEvaluator(0.9) });
    const result = await evaluator('test statement', [], 'self', root, 0.8);
    expect(result.pass).toBe(true);
    expect(result.confidence).toBe(0.9);
  });

  it('returns pass=false when confidence < threshold', async () => {
    const evaluator = makeIntentEvaluator('n1', root, { evaluatorFn: mockEvaluator(0.6) });
    const result = await evaluator('test statement', [], 'self', root, 0.8);
    expect(result.pass).toBe(false);
    expect(result.confidence).toBe(0.6);
  });

  it('passes reasoning and evidence through', async () => {
    const evaluator = makeIntentEvaluator('n1', root, {
      evaluatorFn: mockEvaluator(0.9, 'detailed reasoning', ['a.ts:10 — implements sorting']),
    });
    const result = await evaluator('test', [], 'self', root, 0.8);
    expect(result.reasoning).toBe('detailed reasoning');
    expect(result.evidence).toEqual(['a.ts:10 — implements sorting']);
  });

  it('records evaluation to .roadmap/evaluations/<nodeId>.jsonl', async () => {
    const evaluator = makeIntentEvaluator('my-node', root, { evaluatorFn: mockEvaluator(0.9) });
    await evaluator('test', [], 'self', root, 0.8);
    const path = join(root, '.roadmap', 'evaluations', 'my-node.jsonl');
    expect(existsSync(path)).toBe(true);
    const record = JSON.parse(readFileSync(path, 'utf-8').trim());
    expect(record.nodeId).toBe('my-node');
    expect(record.statement).toBe('test');
    expect(record.threshold).toBe(0.8);
    expect(record.evaluator).toBe('self');
  });

  it('context scoping: loads files from contextPaths', async () => {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/alpha.ts'), 'export const alpha = 1;');

    let capturedFiles: any[] = [];
    const capturingFn = async (_stmt: string, files: any[], _ev: any) => {
      capturedFiles = files;
      return { confidence: 0.9, reasoning: 'ok', evidence: [] };
    };

    const evaluator = makeIntentEvaluator('n', root, { evaluatorFn: capturingFn });
    await evaluator('test', ['src/alpha.ts'], 'self', root, 0.8);
    expect(capturedFiles).toHaveLength(1);
    expect(capturedFiles[0].path).toBe('src/alpha.ts');
    expect(capturedFiles[0].content).toContain('alpha');
  });

  it('evaluator type is passed to LLM call', async () => {
    let capturedEvaluator = '';
    const capturingFn = async (_stmt: string, _files: any[], ev: 'self' | 'council') => {
      capturedEvaluator = ev;
      return { confidence: 0.9, reasoning: 'ok', evidence: [] };
    };

    const evaluator = makeIntentEvaluator('n', root, { evaluatorFn: capturingFn });
    await evaluator('test', [], 'council', root, 0.8);
    expect(capturedEvaluator).toBe('council');
  });

  it('exact threshold boundary: confidence == threshold → pass', async () => {
    const evaluator = makeIntentEvaluator('n', root, { evaluatorFn: mockEvaluator(0.8) });
    const result = await evaluator('test', [], 'self', root, 0.8);
    expect(result.pass).toBe(true);
  });

  it('just below threshold → fail', async () => {
    const evaluator = makeIntentEvaluator('n', root, { evaluatorFn: mockEvaluator(0.799) });
    const result = await evaluator('test', [], 'self', root, 0.8);
    expect(result.pass).toBe(false);
  });
});

// ── validateNode with intent rules ────────────────────────────────────────────

describe('validateNode: intent rule (no evaluator — unevaluated)', () => {
  it('unevaluated intent → passed=true (non-blocking), intentStatus=unevaluated', async () => {
    const dag = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        n: node('n', {
          produces: ['out.ts'],
          deps: ['init'],
          validate: [{ type: 'intent', statement: 'test intent', confidence: 0.8, evaluator: 'self' }],
        }),
        term: node('term', { deps: ['n'] }),
      },
    }));
    const result = await validateNode(dag, 'n', () => true);
    expect(result.passed).toBe(true); // non-blocking
    const intentCheck = result.checks.find(c => c.rule.type === 'intent');
    expect(intentCheck?.intentStatus).toBe('unevaluated');
    expect(intentCheck?.passed).toBe(true);
  });

  it('multiple intent rules all unevaluated → still passes', async () => {
    const dag = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        n: node('n', {
          deps: ['init'],
          validate: [
            { type: 'intent', statement: 'intent 1', confidence: 0.8, evaluator: 'self' },
            { type: 'intent', statement: 'intent 2', confidence: 0.9, evaluator: 'council' },
          ],
        }),
        term: node('term', { deps: ['n'] }),
      },
    }));
    const result = await validateNode(dag, 'n', () => true);
    expect(result.passed).toBe(true);
    const intentChecks = result.checks.filter(c => c.rule.type === 'intent');
    expect(intentChecks).toHaveLength(2);
    expect(intentChecks.every(c => c.intentStatus === 'unevaluated')).toBe(true);
  });
});

describe('validateNode: intent rule with evaluator', () => {
  let root: string;
  beforeEach(() => { root = tempDir(); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('high confidence → passes', async () => {
    const dag = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        n: node('n', {
          produces: ['out.ts'],
          deps: ['init'],
          validate: [{ type: 'intent', statement: 'test intent', confidence: 0.8, evaluator: 'self' }],
        }),
        term: node('term', { deps: ['n'] }),
      },
    }));

    const intentEvaluator = makeIntentEvaluator('n', root, { evaluatorFn: mockEvaluator(0.9) });
    const result = await validateNode(dag, 'n', () => true, { intentEvaluator, repoRoot: root });
    expect(result.passed).toBe(true);
    const check = result.checks.find(c => c.rule.type === 'intent')!;
    expect(check.intentStatus).toBe('evaluated');
    expect(check.evaluation?.confidence).toBe(0.9);
    expect(check.evaluation?.pass).toBe(true);
  });

  it('low confidence → fails validation', async () => {
    const dag = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        n: node('n', {
          deps: ['init'],
          validate: [{ type: 'intent', statement: 'test intent', confidence: 0.8, evaluator: 'self' }],
        }),
        term: node('term', { deps: ['n'] }),
      },
    }));

    const intentEvaluator = makeIntentEvaluator('n', root, { evaluatorFn: mockEvaluator(0.5) });
    const result = await validateNode(dag, 'n', () => true, { intentEvaluator, repoRoot: root });
    expect(result.passed).toBe(false);
    const check = result.checks.find(c => c.rule.type === 'intent')!;
    expect(check.intentStatus).toBe('evaluated');
    expect(check.evaluation?.pass).toBe(false);
    expect(check.evaluation?.confidence).toBe(0.5);
  });

  it('intent check uses rule.context paths when specified', async () => {
    writeFileSync(join(root, 'ctx.ts'), 'export const value = 42;');
    let capturedPaths: string[] = [];

    const capturingEvaluator = makeIntentEvaluator('n', root, {
      evaluatorFn: async (_stmt, files, _ev) => {
        capturedPaths = files.map((f: any) => f.path);
        return { confidence: 0.9, reasoning: 'ok', evidence: [] };
      },
    });

    const dag = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        n: node('n', {
          produces: ['out.ts'],
          deps: ['init'],
          validate: [{
            type: 'intent', statement: 'test', confidence: 0.8, evaluator: 'self',
            context: ['ctx.ts'], // explicit context
          }],
        }),
        term: node('term', { deps: ['n'] }),
      },
    }));

    await validateNode(dag, 'n', () => true, { intentEvaluator: capturingEvaluator, repoRoot: root });
    expect(capturedPaths).toContain('ctx.ts');
    expect(capturedPaths).not.toContain('out.ts'); // produces not used when context explicit
  });

  it('falls back to node.produces when rule.context not specified', async () => {
    writeFileSync(join(root, 'out.ts'), 'export const out = true;');
    let capturedPaths: string[] = [];

    const capturingEvaluator = makeIntentEvaluator('n', root, {
      evaluatorFn: async (_stmt, files, _ev) => {
        capturedPaths = files.map((f: any) => f.path);
        return { confidence: 0.9, reasoning: 'ok', evidence: [] };
      },
    });

    const dag = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        n: node('n', {
          produces: ['out.ts'],
          deps: ['init'],
          validate: [{ type: 'intent', statement: 'test', confidence: 0.8, evaluator: 'self' }], // no context
        }),
        term: node('term', { deps: ['n'] }),
      },
    }));

    await validateNode(dag, 'n', () => true, { intentEvaluator: capturingEvaluator, repoRoot: root });
    expect(capturedPaths).toContain('out.ts');
  });

  it('records to .roadmap/evaluations when evaluator runs', async () => {
    const dag = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        n: node('n', {
          deps: ['init'],
          validate: [{ type: 'intent', statement: 'some intent', confidence: 0.8, evaluator: 'self' }],
        }),
        term: node('term', { deps: ['n'] }),
      },
    }));

    const intentEvaluator = makeIntentEvaluator('n', root, { evaluatorFn: mockEvaluator(0.9) });
    await validateNode(dag, 'n', () => true, { intentEvaluator, repoRoot: root });
    expect(existsSync(join(root, '.roadmap', 'evaluations', 'n.jsonl'))).toBe(true);
  });

  it('intent + deterministic checks: deterministic failure blocks regardless of intent', async () => {
    const dag = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        n: node('n', {
          deps: ['init'],
          validate: [
            { type: 'artifact-exists', target: 'missing.ts' },    // fails
            { type: 'intent', statement: 'test', confidence: 0.8, evaluator: 'self' }, // would pass
          ],
        }),
        term: node('term', { deps: ['n'] }),
      },
    }));

    const intentEvaluator = makeIntentEvaluator('n', root, { evaluatorFn: mockEvaluator(0.95) });
    const result = await validateNode(dag, 'n', () => false, { intentEvaluator, repoRoot: root });
    expect(result.passed).toBe(false); // artifact-exists fails
    const artifactCheck = result.checks.find(c => c.rule.type === 'artifact-exists');
    expect(artifactCheck?.passed).toBe(false);
  });
});

// ── Tiered execution ──────────────────────────────────────────────────────────

describe('tiered execution: self vs council', () => {
  let root: string;
  beforeEach(() => { root = tempDir(); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('self evaluator rule only fires when evaluateTier includes self', async () => {
    let selfCalled = false;
    const trackingFn = async (_stmt: string, _files: any[], ev: 'self' | 'council') => {
      selfCalled = true;
      expect(ev).toBe('self');
      return { confidence: 0.9, reasoning: 'ok', evidence: [] };
    };

    const dag = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        n: node('n', {
          deps: ['init'],
          validate: [{ type: 'intent', statement: 'test', confidence: 0.8, evaluator: 'self' }],
        }),
        term: node('term', { deps: ['n'] }),
      },
    }));

    const intentEvaluator = makeIntentEvaluator('n', root, { evaluatorFn: trackingFn });
    await validateNode(dag, 'n', () => true, { intentEvaluator, repoRoot: root });
    expect(selfCalled).toBe(true);
  });

  it('council evaluator rule passes evaluator=council to LLM', async () => {
    let capturedEv = '';
    const trackingFn = async (_stmt: string, _files: any[], ev: 'self' | 'council') => {
      capturedEv = ev;
      return { confidence: 0.9, reasoning: 'ok', evidence: [] };
    };

    const dag = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        n: node('n', {
          deps: ['init'],
          validate: [{ type: 'intent', statement: 'test', confidence: 0.8, evaluator: 'council' }],
        }),
        term: node('term', { deps: ['n'] }),
      },
    }));

    const intentEvaluator = makeIntentEvaluator('n', root, { evaluatorFn: trackingFn });
    await validateNode(dag, 'n', () => true, { intentEvaluator, repoRoot: root });
    expect(capturedEv).toBe('council');
  });

  it('without evaluator: council rule is also unevaluated (non-blocking)', async () => {
    const dag = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        n: node('n', {
          deps: ['init'],
          validate: [{ type: 'intent', statement: 'test', confidence: 0.8, evaluator: 'council' }],
        }),
        term: node('term', { deps: ['n'] }),
      },
    }));

    const result = await validateNode(dag, 'n', () => true); // no opts
    expect(result.passed).toBe(true);
    const check = result.checks.find(c => c.rule.type === 'intent');
    expect(check?.intentStatus).toBe('unevaluated');
  });
});
