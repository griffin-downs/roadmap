import { describe, it, expect } from 'vitest';
import { validateTerminalAudit, runAudit, evaluateResponses } from '../src/lib/terminal-audit/validator.ts';
import { computeReport } from '../src/lib/terminal-audit/computed.ts';
import { detectGaps } from '../src/lib/terminal-audit/detected.ts';
import { tasksToDAG, parseTasksMd } from '../src/lib/intake/speckit-import.ts';
import type { Graph, NodeSpec } from '../src/lib/protocol/types.ts';
import type { CompletionRecordWithEvidence } from '../src/lib/evidence/completion-evidence.ts';

function buildDAG(specs: Record<string, Partial<NodeSpec<string, any>>>): Graph<string> {
  const nodes: Record<string, any> = {};
  for (const [id, spec] of Object.entries(specs)) {
    nodes[id] = {
      id, desc: 'test', produces: [], consumes: [], deps: [], validate: [], idempotent: true,
      ...spec,
    };
  }
  return { id: 'test', desc: 'test', init: 'init', term: 'term', nodes } as any;
}

function makeRecords(...entries: Array<{ nodeId: string; gitSha?: string; branch?: string; checks?: Array<{ rule: string; passed: boolean; evidence: string }> }>): Map<string, CompletionRecordWithEvidence> {
  const m = new Map<string, CompletionRecordWithEvidence>();
  for (const e of entries) {
    m.set(e.nodeId, {
      nodeId: e.nodeId,
      completedAt: '2026-03-06T00:00:00Z',
      gitSha: e.gitSha,
      branch: e.branch,
      validationChecks: e.checks ?? [],
    });
  }
  return m;
}

// Full pipeline DAG: init → work → term
const pipelineDAG = buildDAG({
  init: { produces: ['init.marker'] },
  work: {
    consumes: ['init.marker'], deps: ['init'],
    produces: ['src/impl.ts'],
    validate: [
      { type: 'artifact-exists', path: 'src/impl.ts' },
      { type: 'shell', command: 'npx tsc --noEmit src/impl.ts' },
    ],
  },
  term: {
    consumes: ['src/impl.ts'], deps: ['work'],
    validate: [{ type: 'artifact-exists', path: 'src/impl.ts' }],
  },
});

describe('E2E: terminal audit full pipeline', () => {
  describe('clean DAG auto-passes', () => {
    it('no gaps → auto-pass without responses', () => {
      const records = makeRecords(
        { nodeId: 'init', checks: [] },
        { nodeId: 'work', gitSha: 'abc', checks: [
          { rule: 'artifact-exists:src/impl.ts', passed: true, evidence: 'file exists' },
          { rule: 'shell:npx tsc --noEmit src/impl.ts', passed: true, evidence: 'exit 0' },
        ]},
      );
      const result = validateTerminalAudit(
        pipelineDAG, records, () => true, ['src/impl.ts'],
      );
      expect(result.passed).toBe(true);
      expect(result.prompts).toHaveLength(0);
      expect(result.computed.commitStatus.length).toBeGreaterThan(0);
    });
  });

  describe('gappy DAG requires responses', () => {
    const gappyDAG = buildDAG({
      init: { produces: ['init.marker'] },
      a: { produces: ['src/a.ts'], deps: ['init'] },
      b: { consumes: ['src/a.ts'], deps: ['a'], produces: ['src/b.ts'] },
      term: { consumes: ['src/b.ts'], deps: ['b'] },
    });

    it('gaps detected → fails without responses', () => {
      const result = validateTerminalAudit(gappyDAG, new Map(), () => true, []);
      expect(result.passed).toBe(false);
      expect(result.prompts.length).toBeGreaterThan(0);
      expect(result.reason).toContain('gap(s) detected');
    });

    it('gaps detected → passes with substantive responses', () => {
      const ctx = runAudit(gappyDAG, new Map(), () => true, []);
      const responses = ctx.prompts.map(p => ({
        promptId: p.id,
        answer: 'This dependency is guaranteed by the DAG ordering — a always runs before b.',
      }));
      const result = validateTerminalAudit(gappyDAG, new Map(), () => true, [], responses);
      expect(result.passed).toBe(true);
    });

    it('gaps detected → fails with placeholder responses', () => {
      const ctx = runAudit(gappyDAG, new Map(), () => true, []);
      const responses = ctx.prompts.map(p => ({
        promptId: p.id,
        answer: '<TODO>',
      }));
      const result = validateTerminalAudit(gappyDAG, new Map(), () => true, [], responses);
      expect(result.passed).toBe(false);
    });
  });

  describe('scope leak detection in pipeline', () => {
    it('stray file triggers scope-leak prompt', () => {
      const ctx = runAudit(pipelineDAG, new Map(), () => true, ['src/impl.ts', 'src/orphan.ts']);
      const leaks = ctx.prompts.filter(p => p.type === 'scope-leak');
      expect(leaks).toHaveLength(1);
      expect(leaks[0].artifact).toBe('src/orphan.ts');
    });
  });

  describe('computed report populated from records', () => {
    it('includes test evidence from completed nodes', () => {
      const records = makeRecords(
        { nodeId: 'work', gitSha: 'sha1', branch: 'feat/x', checks: [
          { rule: 'shell:npx tsc --noEmit src/impl.ts', passed: true, evidence: 'exit 0' },
          { rule: 'artifact-exists:src/impl.ts', passed: true, evidence: 'exists' },
        ]},
      );
      const result = validateTerminalAudit(pipelineDAG, records, () => true, ['src/impl.ts']);
      expect(result.computed.testEvidence).toHaveLength(1);
      expect(result.computed.auditTrail).toHaveLength(1);
      expect(result.computed.auditTrail[0].gitSha).toBe('sha1');
    });
  });

  describe('speckit import: terminal node clean', () => {
    it('tasksToDAG does not inject propagated validators or intent gate on term', () => {
      const tasks = [
        { id: 'setup', desc: 'Setup', priority: 0, depends: [], produces: ['setup.txt'], consumes: [], mode: 'execute' as const, validate: [{ type: 'shell' as const, command: 'echo ok' }] },
        { id: 'build', desc: 'Build', priority: 1, depends: ['setup'], produces: ['build.txt'], consumes: ['setup.txt'], mode: 'execute' as const, validate: [{ type: 'shell' as const, command: 'echo build' }] },
      ];
      const dag = tasksToDAG(tasks, { dagId: 'test-import' });
      const termNode = dag.nodes[dag.term as keyof typeof dag.nodes] as any;

      // No propagated artifact-exists or shell validators
      const propagated = (termNode.validate ?? []).filter((v: any) => v._propagatedFrom);
      expect(propagated).toHaveLength(0);

      // No intent gate
      const intents = (termNode.validate ?? []).filter((v: any) => v.type === 'intent');
      expect(intents).toHaveLength(0);
    });

    it('terminal audit auto-passes on DAG from tasksToDAG when produces are tested', () => {
      const tasks = [
        { id: 'setup', desc: 'Setup', priority: 0, depends: [], produces: ['setup.txt'], consumes: [], mode: 'execute' as const, validate: [{ type: 'artifact-exists' as const, path: 'setup.txt' }, { type: 'shell' as const, command: 'cat setup.txt' }] },
        { id: 'build', desc: 'Build', priority: 1, depends: ['setup'], produces: ['build.txt'], consumes: ['setup.txt'], mode: 'execute' as const, validate: [{ type: 'artifact-exists' as const, path: 'build.txt' }, { type: 'shell' as const, command: 'cat build.txt' }] },
      ];
      const dag = tasksToDAG(tasks, { dagId: 'test-audit' });
      const records = makeRecords(
        { nodeId: 'setup', checks: [{ rule: 'shell:cat setup.txt', passed: true, evidence: 'ok' }] },
        { nodeId: 'build', checks: [{ rule: 'shell:cat build.txt', passed: true, evidence: 'ok' }] },
      );
      const result = validateTerminalAudit(dag, records, () => true, ['setup.txt', 'build.txt']);
      expect(result.passed).toBe(true);
    });
  });

  describe('two-phase advance flow', () => {
    const dag = buildDAG({
      init: { produces: ['init.marker'] },
      work: { produces: ['src/out.ts'], deps: ['init'] },
      term: { consumes: ['src/out.ts'], deps: ['work'] },
    });

    it('phase 1: get context packet with prompts', () => {
      const ctx = runAudit(dag, new Map(), () => true, ['src/extra.ts']);
      expect(ctx.prompts.length).toBeGreaterThan(0);
      // Each prompt has id, type, artifact, question
      for (const p of ctx.prompts) {
        expect(p).toHaveProperty('id');
        expect(p).toHaveProperty('type');
        expect(p).toHaveProperty('artifact');
        expect(p).toHaveProperty('question');
      }
    });

    it('phase 2: evaluate responses → pass', () => {
      const ctx = runAudit(dag, new Map(), () => true, ['src/extra.ts']);
      const responses = ctx.prompts.map(p => ({
        promptId: p.id,
        answer: 'The extra file is a test helper that supports the main implementation.',
      }));
      const result = evaluateResponses(ctx, responses);
      expect(result.passed).toBe(true);
    });
  });
});
