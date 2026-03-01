import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { define, graph, validateNode } from '../src/protocol.ts';
import type { ValidationRule, IntentJudgment } from '../src/protocol.ts';
import {
  recordEvaluation,
  readEvaluations,
  loadContextFiles,
  judgmentToRecord,
} from '../src/lib/intent/intent-evaluator.ts';
import type { IntentEvaluationRecord } from '../src/lib/intent/intent-evaluator.ts';

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

const INTENT_RULE: ValidationRule = {
  type: 'intent',
  statement: 'The store rejects whitespace-only submissions',
  confidence: 0.8,
  evaluator: 'self',
};

const GOOD_JUDGMENT: IntentJudgment = {
  statement: 'The store rejects whitespace-only submissions',
  confidence: 0.92,
  reasoning: 'Line 45 of todoStore.ts trims and checks for empty string before inserting.',
  evidence: ['todoStore.ts:45 — validates non-empty after trim'],
};

const WEAK_JUDGMENT: IntentJudgment = {
  statement: 'The store rejects whitespace-only submissions',
  confidence: 0.6,
  reasoning: 'Could not find explicit whitespace validation.',
};

function intentDag(rules: ValidationRule[] = [INTENT_RULE]) {
  return define(graph({
    id: 'test', desc: 'test', init: 'init', term: 'term',
    nodes: {
      init: node('init'),
      n: node('n', { produces: ['src/store.ts'], deps: ['init'], validate: rules }),
      term: node('term', { deps: ['n'] }),
    },
  }));
}

// ── loadContextFiles ──────────────────────────────────────────────────────────

describe('loadContextFiles', () => {
  let root: string;
  beforeEach(() => { root = tempDir(); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reads existing files', () => {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/store.ts'), 'const x = 1;');
    const files = loadContextFiles(['src/store.ts'], root);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/store.ts');
    expect(files[0].content).toContain('const x = 1');
  });

  it('skips missing files silently', () => {
    const files = loadContextFiles(['nonexistent.ts'], root);
    expect(files).toHaveLength(0);
  });

  it('reads multiple files, skips missing', () => {
    writeFileSync(join(root, 'a.ts'), 'a');
    writeFileSync(join(root, 'b.ts'), 'b');
    const files = loadContextFiles(['a.ts', 'b.ts', 'missing.ts'], root);
    expect(files).toHaveLength(2);
  });
});

// ── recordEvaluation + readEvaluations ───────────────────────────────────────

describe('recordEvaluation', () => {
  let root: string;
  beforeEach(() => { root = tempDir(); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('creates .roadmap/evaluations/<nodeId>.jsonl', () => {
    const record = judgmentToRecord('n', GOOD_JUDGMENT, 'self', 0.8);
    recordEvaluation('n', record, root);
    expect(existsSync(join(root, '.roadmap', 'evaluations', 'n.jsonl'))).toBe(true);
  });

  it('appends entries — each line is valid JSON', () => {
    recordEvaluation('n', judgmentToRecord('n', GOOD_JUDGMENT, 'self', 0.8), root);
    recordEvaluation('n', judgmentToRecord('n', WEAK_JUDGMENT, 'self', 0.8), root);
    const lines = readFileSync(join(root, '.roadmap', 'evaluations', 'n.jsonl'), 'utf-8')
      .trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).confidence).toBe(0.92);
    expect(JSON.parse(lines[1]).confidence).toBe(0.6);
  });

  it('creates directories recursively if absent', () => {
    recordEvaluation('x', judgmentToRecord('x', GOOD_JUDGMENT, 'self', 0.8), root);
    expect(existsSync(join(root, '.roadmap', 'evaluations'))).toBe(true);
  });
});

describe('readEvaluations', () => {
  let root: string;
  beforeEach(() => { root = tempDir(); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('returns empty array when no file exists', () => {
    expect(readEvaluations('n', root)).toEqual([]);
  });

  it('reads all records in order', () => {
    recordEvaluation('n', judgmentToRecord('n', GOOD_JUDGMENT, 'self', 0.8), root);
    recordEvaluation('n', judgmentToRecord('n', WEAK_JUDGMENT, 'self', 0.8), root);
    const records = readEvaluations('n', root);
    expect(records).toHaveLength(2);
    expect(records[0].confidence).toBe(0.92);
    expect(records[1].confidence).toBe(0.6);
  });

  it('record contains all required fields', () => {
    recordEvaluation('n', judgmentToRecord('n', GOOD_JUDGMENT, 'self', 0.8), root);
    const [r] = readEvaluations('n', root);
    expect(r.nodeId).toBe('n');
    expect(r.statement).toBe(GOOD_JUDGMENT.statement);
    expect(r.evaluator).toBe('self');
    expect(r.threshold).toBe(0.8);
    expect(typeof r.evaluatedAt).toBe('string');
    expect(r.pass).toBe(true);
  });
});

// ── judgmentToRecord ─────────────────────────────────────────────────────────

describe('judgmentToRecord', () => {
  it('sets pass=true when confidence >= threshold', () => {
    const r = judgmentToRecord('n', { statement: 's', confidence: 0.85, reasoning: 'ok' }, 'self', 0.8);
    expect(r.pass).toBe(true);
  });

  it('sets pass=false when confidence < threshold', () => {
    const r = judgmentToRecord('n', { statement: 's', confidence: 0.6, reasoning: 'weak' }, 'council', 0.8);
    expect(r.pass).toBe(false);
  });

  it('defaults evidence to empty array', () => {
    const r = judgmentToRecord('n', { statement: 's', confidence: 0.9, reasoning: 'ok' }, 'self', 0.8);
    expect(r.evidence).toEqual([]);
  });

  it('copies evidence when provided', () => {
    const r = judgmentToRecord('n', { statement: 's', confidence: 0.9, reasoning: 'ok', evidence: ['a:1'] }, 'self', 0.8);
    expect(r.evidence).toEqual(['a:1']);
  });
});

// ── validateNode: unevaluated (default complete) ─────────────────────────────

describe('validateNode: intent without judgments (default complete)', () => {
  it('unevaluated intent → passes, intentStatus=unevaluated', async () => {
    const dag = intentDag();
    const result = await validateNode(dag, 'n', () => true);
    expect(result.passed).toBe(true);
    const check = result.checks.find(c => c.rule.type === 'intent')!;
    expect(check.intentStatus).toBe('unevaluated');
    expect(check.passed).toBe(true);
    expect(check.judgment).toBeUndefined();
  });

  it('multiple unevaluated intents → all pass, none block', async () => {
    const dag = intentDag([
      { type: 'intent', statement: 'intent A', confidence: 0.8, evaluator: 'self' },
      { type: 'intent', statement: 'intent B', confidence: 0.9, evaluator: 'council' },
    ]);
    const result = await validateNode(dag, 'n', () => true);
    expect(result.passed).toBe(true);
    expect(result.checks.filter(c => c.intentStatus === 'unevaluated')).toHaveLength(2);
  });

  it('deterministic validator failure still blocks even with unevaluated intents', async () => {
    const dag = intentDag([
      { type: 'artifact-exists', target: 'missing.ts' },
      INTENT_RULE,
    ]);
    const result = await validateNode(dag, 'n', () => false);
    expect(result.passed).toBe(false);
  });
});

// ── validateNode: with judgments (complete --evaluate) ───────────────────────

describe('validateNode: intent with LLM judgments', () => {
  it('confidence >= threshold → passes, intentStatus=evaluated', async () => {
    const dag = intentDag();
    const result = await validateNode(dag, 'n', () => true, { intentJudgments: [GOOD_JUDGMENT] });
    expect(result.passed).toBe(true);
    const check = result.checks.find(c => c.rule.type === 'intent')!;
    expect(check.intentStatus).toBe('evaluated');
    expect(check.judgment?.confidence).toBe(0.92);
  });

  it('confidence < threshold → fails', async () => {
    const dag = intentDag();
    const result = await validateNode(dag, 'n', () => true, { intentJudgments: [WEAK_JUDGMENT] });
    expect(result.passed).toBe(false);
    const check = result.checks.find(c => c.rule.type === 'intent')!;
    expect(check.passed).toBe(false);
    expect(check.judgment?.confidence).toBe(0.6);
  });

  it('exact threshold boundary: confidence == threshold → passes', async () => {
    const dag = intentDag([{ type: 'intent', statement: 's', confidence: 0.8, evaluator: 'self' }]);
    const result = await validateNode(dag, 'n', () => true, {
      intentJudgments: [{ statement: 's', confidence: 0.8, reasoning: 'ok' }],
    });
    expect(result.passed).toBe(true);
  });

  it('judgment not found for a statement → that check is unevaluated (non-blocking)', async () => {
    const dag = intentDag();
    // Provide judgment for a DIFFERENT statement
    const result = await validateNode(dag, 'n', () => true, {
      intentJudgments: [{ statement: 'unrelated statement', confidence: 0.9, reasoning: 'x' }],
    });
    expect(result.passed).toBe(true); // unmatched → unevaluated → non-blocking
    const check = result.checks.find(c => c.rule.type === 'intent')!;
    expect(check.intentStatus).toBe('unevaluated');
  });

  it('evidence passed through onto the check', async () => {
    const dag = intentDag();
    const result = await validateNode(dag, 'n', () => true, {
      intentJudgments: [{ ...GOOD_JUDGMENT, evidence: ['store.ts:45 — validates'] }],
    });
    const check = result.checks.find(c => c.rule.type === 'intent')!;
    expect(check.judgment?.evidence).toEqual(['store.ts:45 — validates']);
  });

  it('reasoning truncated in evidence string but preserved in judgment', async () => {
    const longReasoning = 'x'.repeat(300);
    const dag = intentDag();
    const result = await validateNode(dag, 'n', () => true, {
      intentJudgments: [{ ...GOOD_JUDGMENT, reasoning: longReasoning }],
    });
    const check = result.checks.find(c => c.rule.type === 'intent')!;
    expect(check.judgment?.reasoning).toBe(longReasoning); // full on judgment
    expect(check.evidence!.length).toBeLessThan(300);       // truncated in evidence string
  });

  it('multiple intent rules: all provided judgments evaluated independently', async () => {
    const dag = intentDag([
      { type: 'intent', statement: 'A', confidence: 0.8, evaluator: 'self' },
      { type: 'intent', statement: 'B', confidence: 0.85, evaluator: 'council' },
    ]);
    const result = await validateNode(dag, 'n', () => true, {
      intentJudgments: [
        { statement: 'A', confidence: 0.9, reasoning: 'ok' },
        { statement: 'B', confidence: 0.7, reasoning: 'weak' }, // fails threshold 0.85
      ],
    });
    expect(result.passed).toBe(false);
    const [cA, cB] = result.checks.filter(c => c.rule.type === 'intent');
    expect(cA.passed).toBe(true);
    expect(cB.passed).toBe(false);
  });

  it('intent + deterministic: both must pass', async () => {
    const dag = intentDag([
      { type: 'artifact-exists', target: 'src/store.ts' },
      INTENT_RULE,
    ]);
    // artifact exists, good judgment → passes
    const pass = await validateNode(dag, 'n', p => p === 'src/store.ts', { intentJudgments: [GOOD_JUDGMENT] });
    expect(pass.passed).toBe(true);

    // artifact missing, good judgment → still fails
    const fail = await validateNode(dag, 'n', () => false, { intentJudgments: [GOOD_JUDGMENT] });
    expect(fail.passed).toBe(false);
  });
});
