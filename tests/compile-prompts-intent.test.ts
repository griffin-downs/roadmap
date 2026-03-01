import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { define, graph } from '../src/protocol.ts';
import type { ValidationRule } from '../src/protocol.ts';
import { compilePrompts, fillTemplate } from '../src/lib/compile-prompts.ts';
import { recordEvaluation, judgmentToRecord } from '../src/lib/intent/intent-evaluator.ts';
import type { IntentEvaluationRecord } from '../src/lib/intent/intent-evaluator.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function tempDir(): string {
  const dir = join(tmpdir(), `compile-prompts-intent-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function nodeSpec(id: string, overrides: Partial<{
  desc: string;
  produces: string[];
  consumes: string[];
  deps: string[];
  validate: ValidationRule[];
}> = {}) {
  return {
    id,
    desc: overrides.desc ?? `task: ${id}`,
    produces: overrides.produces ?? [],
    consumes: overrides.consumes ?? [],
    deps: overrides.deps ?? [],
    validate: overrides.validate ?? [],
    idempotent: true,
  };
}

function intentDag(nodeId: string, validate: ValidationRule[]) {
  return define(graph({
    id: 'test', desc: 'test dag', init: 'init', term: 'term',
    nodes: {
      init: nodeSpec('init'),
      [nodeId]: nodeSpec(nodeId, {
        produces: [`src/${nodeId}.ts`],
        deps: ['init'],
        validate,
      }),
      term: nodeSpec('term', { deps: [nodeId] }),
    },
  }));
}

// Minimal template that surfaces verification_checklist — enough for intent section assertions.
const MINIMAL_TEMPLATE = '{{verification_checklist}}';

const INTENT_RULE: ValidationRule = {
  type: 'intent',
  statement: 'The module handles empty input gracefully',
  confidence: 0.8,
  evaluator: 'self',
};

const INTENT_RULE_B: ValidationRule = {
  type: 'intent',
  statement: 'Error messages include actionable remediation steps',
  confidence: 0.75,
  evaluator: 'council',
};

function failureRecord(
  nodeId: string,
  statement: string,
  reasoning: string,
  evidence: string[] = [],
): IntentEvaluationRecord {
  return {
    nodeId,
    statement,
    evaluator: 'self',
    confidence: 0.4,
    reasoning,
    evidence,
    threshold: 0.8,
    pass: false,
    evaluatedAt: new Date().toISOString(),
  };
}

function passRecord(nodeId: string, statement: string): IntentEvaluationRecord {
  return {
    nodeId,
    statement,
    evaluator: 'self',
    confidence: 0.9,
    reasoning: 'Looks good.',
    evidence: [],
    threshold: 0.8,
    pass: true,
    evaluatedAt: new Date().toISOString(),
  };
}

// ── buildIntentSelfCheck: no history (cold start) ─────────────────────────────

describe('buildIntentSelfCheck — no history (cold start)', () => {
  let root: string;
  beforeEach(() => { root = tempDir(); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('emits statement and threshold line when no prior evaluations exist', () => {
    const n = nodeSpec('alpha', {
      produces: ['src/alpha.ts'],
      validate: [INTENT_RULE],
    });
    const output = fillTemplate(MINIMAL_TEMPLATE, n, 'core', null, root);
    expect(output).toContain(INTENT_RULE.statement);
    expect(output).toContain(`threshold: ${INTENT_RULE.confidence}`);
  });

  it('does not emit Known failure mode line when no evaluations dir exists', () => {
    const n = nodeSpec('alpha', {
      produces: ['src/alpha.ts'],
      validate: [INTENT_RULE],
    });
    const output = fillTemplate(MINIMAL_TEMPLATE, n, 'core', null, root);
    expect(output).not.toContain('Known failure mode');
  });

  it('does not emit Evidence line when no evaluations exist', () => {
    const n = nodeSpec('alpha', {
      produces: ['src/alpha.ts'],
      validate: [INTENT_RULE],
    });
    const output = fillTemplate(MINIMAL_TEMPLATE, n, 'core', null, root);
    expect(output).not.toContain('Evidence:');
  });

  it('emits evaluator name in the checklist item', () => {
    const n = nodeSpec('alpha', {
      produces: ['src/alpha.ts'],
      validate: [INTENT_RULE],
    });
    const output = fillTemplate(MINIMAL_TEMPLATE, n, 'core', null, root);
    expect(output).toContain(`evaluator: ${INTENT_RULE.evaluator}`);
  });
});

// ── buildIntentSelfCheck: with failing history ────────────────────────────────

describe('buildIntentSelfCheck — with failing history', () => {
  let root: string;
  beforeEach(() => { root = tempDir(); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('emits Known failure mode from most recent failure record', () => {
    const nodeId = 'alpha';
    const reasoning = 'No null guard found in input path';
    recordEvaluation(nodeId, failureRecord(nodeId, INTENT_RULE.statement, reasoning), root);

    const n = nodeSpec(nodeId, { produces: ['src/alpha.ts'], validate: [INTENT_RULE] });
    const output = fillTemplate(MINIMAL_TEMPLATE, n, 'core', null, root);
    expect(output).toContain(`Known failure mode: ${reasoning}`);
  });

  it('emits Evidence line when failure record has evidence entries', () => {
    const nodeId = 'alpha';
    const evidence = ['src/alpha.ts:12 — missing null check', 'src/alpha.ts:45 — throws on empty'];
    recordEvaluation(nodeId, failureRecord(nodeId, INTENT_RULE.statement, 'No guard', evidence), root);

    const n = nodeSpec(nodeId, { produces: ['src/alpha.ts'], validate: [INTENT_RULE] });
    const output = fillTemplate(MINIMAL_TEMPLATE, n, 'core', null, root);
    expect(output).toContain('Evidence:');
    expect(output).toContain(evidence.join(', '));
  });

  it('does not emit Evidence line when failure record has no evidence', () => {
    const nodeId = 'alpha';
    recordEvaluation(nodeId, failureRecord(nodeId, INTENT_RULE.statement, 'Weak coverage', []), root);

    const n = nodeSpec(nodeId, { produces: ['src/alpha.ts'], validate: [INTENT_RULE] });
    const output = fillTemplate(MINIMAL_TEMPLATE, n, 'core', null, root);
    expect(output).toContain('Known failure mode');
    expect(output).not.toContain('Evidence:');
  });

  it('uses most recent failure — ignores earlier ones', () => {
    const nodeId = 'alpha';
    const firstReasoning = 'Old failure reason';
    const latestReasoning = 'Latest failure reason, more specific';
    recordEvaluation(nodeId, failureRecord(nodeId, INTENT_RULE.statement, firstReasoning), root);
    recordEvaluation(nodeId, failureRecord(nodeId, INTENT_RULE.statement, latestReasoning), root);

    const n = nodeSpec(nodeId, { produces: ['src/alpha.ts'], validate: [INTENT_RULE] });
    const output = fillTemplate(MINIMAL_TEMPLATE, n, 'core', null, root);
    expect(output).toContain(`Known failure mode: ${latestReasoning}`);
    expect(output).not.toContain(firstReasoning);
  });

  it('most recent record is a pass — hint still reflects last failure in history', () => {
    // Implementation: lastFailure = history.filter(!pass).at(-1) — the last failure is shown
    // regardless of whether a subsequent pass exists. This tests actual behavior.
    const nodeId = 'alpha';
    const failReasoning = 'Null guard was absent';
    recordEvaluation(nodeId, failureRecord(nodeId, INTENT_RULE.statement, failReasoning), root);
    recordEvaluation(nodeId, passRecord(nodeId, INTENT_RULE.statement), root);

    const n = nodeSpec(nodeId, { produces: ['src/alpha.ts'], validate: [INTENT_RULE] });
    const output = fillTemplate(MINIMAL_TEMPLATE, n, 'core', null, root);
    // The last failure (not the pass) is surfaced
    expect(output).toContain(`Known failure mode: ${failReasoning}`);
  });

  it('multiple rules: only matching statement gets failure hint, others remain clean', () => {
    const nodeId = 'alpha';
    // Only rule A has a failure record
    recordEvaluation(nodeId, failureRecord(nodeId, INTENT_RULE.statement, 'Rule A failed'), root);

    const n = nodeSpec(nodeId, {
      produces: ['src/alpha.ts'],
      validate: [INTENT_RULE, INTENT_RULE_B],
    });
    const output = fillTemplate(MINIMAL_TEMPLATE, n, 'core', null, root);

    // Rule A line (in the intent self-check section) should have the hint
    expect(output).toContain('Known failure mode: Rule A failed');

    // Rule B statement must appear (it's a checklist item in both sections)
    expect(output).toContain(INTENT_RULE_B.statement);

    // Extract the intent self-check section specifically
    const intentSection = output.split('### Intent (self-check')[1] ?? '';
    // Rule B's checklist line is the last item in the intent section and has no hint after it
    const ruleBAnchor = `- [ ] "${INTENT_RULE_B.statement}"`;
    const afterRuleBLine = intentSection.split(ruleBAnchor)[1] ?? '';
    // Only threshold/evaluator meta follows rule B's line — no Known failure mode
    expect(afterRuleBLine).not.toContain('Known failure mode');
    expect(afterRuleBLine).not.toContain('Evidence:');
  });
});

// ── compilePrompts integration (tmp dir) ──────────────────────────────────────

describe('compilePrompts() integration — intent self-check', () => {
  let root: string;

  beforeEach(() => { root = tempDir(); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('node with intent rule + prior failure → compiled prompt contains Known failure mode', () => {
    const nodeId = 'widget';
    const reasoning = 'Widget did not sanitize XSS vectors';
    recordEvaluation(nodeId, failureRecord(nodeId, INTENT_RULE.statement, reasoning), root);

    const dag = intentDag(nodeId, [INTENT_RULE]);
    const { prompts } = compilePrompts(dag as any, { nodes: [nodeId], repoRoot: root });

    const p = prompts.find(pr => pr.node === nodeId)!;
    expect(p).toBeDefined();
    expect(p.content).toContain(`Known failure mode: ${reasoning}`);
  });

  it('node with intent rule + no evaluations dir → statement present, no hint', () => {
    const nodeId = 'widget';
    // No recordEvaluation call — evaluations dir does not exist

    const dag = intentDag(nodeId, [INTENT_RULE]);
    const { prompts } = compilePrompts(dag as any, { nodes: [nodeId], repoRoot: root });

    const p = prompts.find(pr => pr.node === nodeId)!;
    expect(p).toBeDefined();
    expect(p.content).toContain(INTENT_RULE.statement);
    expect(p.content).not.toContain('Known failure mode');
  });

  it('deterministic checklist items still present alongside intent self-check section', () => {
    const nodeId = 'widget';
    const shellRule: ValidationRule = { type: 'shell', command: 'npx vitest run tests/widget.test.ts' };
    const artifactRule: ValidationRule = { type: 'artifact-exists', target: `src/${nodeId}.ts` };

    const dag = intentDag(nodeId, [shellRule, artifactRule, INTENT_RULE]);
    const { prompts } = compilePrompts(dag as any, { nodes: [nodeId], repoRoot: root });

    const p = prompts.find(pr => pr.node === nodeId)!;
    expect(p.content).toContain('npx vitest run tests/widget.test.ts');
    expect(p.content).toContain(`src/${nodeId}.ts`);
    expect(p.content).toContain(INTENT_RULE.statement);
  });

  it('intent section heading appears when intent rule present', () => {
    const nodeId = 'widget';
    const dag = intentDag(nodeId, [INTENT_RULE]);
    const { prompts } = compilePrompts(dag as any, { nodes: [nodeId], repoRoot: root });

    const p = prompts.find(pr => pr.node === nodeId)!;
    expect(p.content).toContain('Intent (self-check');
  });

  it('no intent section when node has no intent rules', () => {
    const nodeId = 'plain';
    const dag = intentDag(nodeId, [{ type: 'shell', command: 'tsc --noEmit' }]);
    const { prompts } = compilePrompts(dag as any, { nodes: [nodeId], repoRoot: root });

    const p = prompts.find(pr => pr.node === nodeId)!;
    expect(p.content).not.toContain('Intent (self-check');
  });

  it('prior failure with evidence → compiled prompt contains Evidence line', () => {
    const nodeId = 'widget';
    const evidence = ['src/widget.ts:7 — raw input passed directly'];
    recordEvaluation(nodeId, failureRecord(nodeId, INTENT_RULE.statement, 'XSS vector', evidence), root);

    const dag = intentDag(nodeId, [INTENT_RULE]);
    const { prompts } = compilePrompts(dag as any, { nodes: [nodeId], repoRoot: root });

    const p = prompts.find(pr => pr.node === nodeId)!;
    expect(p.content).toContain('Evidence:');
    expect(p.content).toContain(evidence[0]);
  });

  it('failure for different statement does not bleed into unrelated intent rule', () => {
    const nodeId = 'widget';
    // Record a failure only for INTENT_RULE_B.statement
    recordEvaluation(nodeId, failureRecord(nodeId, INTENT_RULE_B.statement, 'B failed'), root);

    const dag = intentDag(nodeId, [INTENT_RULE, INTENT_RULE_B]);
    const { prompts } = compilePrompts(dag as any, { nodes: [nodeId], repoRoot: root });

    const p = prompts.find(pr => pr.node === nodeId)!;

    // INTENT_RULE_B should have the hint
    expect(p.content).toContain('Known failure mode: B failed');

    // INTENT_RULE should not have a hint — get text before INTENT_RULE_B statement
    const beforeB = p.content.split(INTENT_RULE_B.statement)[0] ?? '';
    expect(beforeB).not.toContain('Known failure mode');
  });
});
